import ts from "typescript";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 150000) return NextResponse.json({ error: "File exceeds the 150 KB execution limit." }, { status: 413 });
    const { code, filename } = JSON.parse(raw);
    if (typeof code !== "string" || typeof filename !== "string" || !/\.[jt]s$/.test(filename)) return NextResponse.json({ error: "Run supports standalone .js and .ts files." }, { status: 400 });
    const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true);
    let modules = false;
    function inspect(node: ts.Node) { if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === "require")) || ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) modules = true; ts.forEachChild(node, inspect); }
    inspect(source);
    if (modules) return NextResponse.json({ error: "The runner supports standalone functions. Module imports and exports are not supported yet." }, { status: 400 });
    const result = ts.transpileModule(code, { fileName: filename, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } });
    if (result.diagnostics?.some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)) return NextResponse.json({ error: "Fix syntax errors before running this file." }, { status: 400 });
    return NextResponse.json({ code: result.outputText });
  } catch { return NextResponse.json({ error: "Unable to prepare this file for execution." }, { status: 400 }); }
}
