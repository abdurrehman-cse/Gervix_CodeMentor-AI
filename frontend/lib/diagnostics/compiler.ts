import ts from "typescript";
import path from "node:path";
import type { MentorContext } from "../types";
const libraryCache = new Map<string, ts.SourceFile>();

export function compilerDiagnostics(context: MentorContext): ts.Diagnostic[] {
  const root = path.resolve("/codementor-virtual-workspace");
  const files = new Map(context.files.filter(file => file.kind === "file" && /\.[jt]s$/.test(file.path)).map(file => [path.join(root, file.path), file.content]));
  const options: ts.CompilerOptions = { allowJs: true, checkJs: true, noEmit: true, strictNullChecks: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, types: [], lib: ["lib.es2020.d.ts", "lib.webworker.d.ts"] };
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile, originalExists = host.fileExists;
  const libraryRoot = path.dirname(ts.getDefaultLibFilePath(options));
  const isLibrary = (filename: string) => path.dirname(filename) === libraryRoot && /^lib\..*\.d\.ts$/.test(path.basename(filename));
  host.readFile = filename => files.get(path.normalize(filename)) ?? (isLibrary(filename) ? originalRead(filename) : undefined);
  host.fileExists = filename => files.has(path.normalize(filename)) || isLibrary(filename) && originalExists(filename);
  host.directoryExists = directory => directory === libraryRoot || [...files.keys()].some(filename => filename.startsWith(path.normalize(directory) + path.sep));
  host.getSourceFile = (filename, languageVersion) => {
    if (isLibrary(filename) && libraryCache.has(filename)) return libraryCache.get(filename);
    const content = host.readFile(filename);
    if (content === undefined) return undefined;
    const source = ts.createSourceFile(filename, content, languageVersion, true);
    if (isLibrary(filename)) libraryCache.set(filename, source);
    return source;
  };
  const filename = path.join(root, context.activeFile);
  const program = ts.createProgram({ rootNames: [filename], options, host });
  const source = program.getSourceFile(filename);
  if (!source) return [];
  const supportedCodes = new Set([2304, 2339, 2345, 2367, 2454, 2531, 2532, 2552, 2554, 18047, 18048]);
  return program.getSemanticDiagnostics(source).filter(diagnostic => supportedCodes.has(diagnostic.code)).slice(0, 30);
}
