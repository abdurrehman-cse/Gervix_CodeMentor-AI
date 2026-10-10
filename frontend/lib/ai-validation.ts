import type { AIAnalysis, MentorContext, Problem, TestCase } from "./types";
import ts from "typescript";
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string" && value.length <= 20000;
const integer = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 30) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10000 && value.every(item => jsonValue(item, depth + 1));
  return record(value) && Object.keys(value).length <= 1000 && Object.values(value).every(item => jsonValue(item, depth + 1));
}
export function validateAnalysis(value: unknown, context: MentorContext): AIAnalysis {
  if (!record(value) || !Array.isArray(value.problems) || !Array.isArray(value.tests) || !string(value.explanation) || value.problems.length > 100 || value.tests.length > 40) throw new Error("Invalid analysis");
  const problems = value.problems.map((item, index) => {
    if (!record(item) || !["error", "warning", "info", "suggestion"].includes(String(item.severity)) || !["file", "title", "description", "consequence", "concept", "question"].every(key => string(item[key])) || !["line", "column", "endLine", "endColumn"].every(key => integer(item[key])) || !Array.isArray(item.hints) || !item.hints.length || !item.hints.every(string)) throw new Error("Invalid problem");
    const file = context.files.find(file => file.kind === "file" && file.path === item.file);
    if (!file) throw new Error("Unknown file");
    const lines = file.content.split("\n");
    const startLine = Number(item.line), endLine = Number(item.endLine), column = Number(item.column), endColumn = Number(item.endColumn);
    if (startLine > lines.length || endLine > lines.length || endLine < startLine || column > lines[startLine - 1].length + 1 || endColumn > lines[endLine - 1].length + 1 || (startLine === endLine && endColumn <= column)) throw new Error("Invalid location");
    if (item.quickFix != null) {
      if (!record(item.quickFix) || !string(item.quickFix.oldCode) || !string(item.quickFix.newCode)) throw new Error("Invalid fix");
      const selected = lines.slice(startLine - 1, endLine).map((line, offset) => line.slice(offset === 0 ? column - 1 : 0, startLine + offset === endLine ? endColumn - 1 : undefined)).join("\n");
      if (selected !== item.quickFix.oldCode || selected.length > 1000 || item.quickFix.newCode.length > 1000) delete item.quickFix;
    }
    return { ...item, id: `ai:${index}` } as Problem;
  });
  const active = context.files.find(file => file.path === context.activeFile)!;
  const source = ts.createSourceFile(active.path, active.content, ts.ScriptTarget.Latest, true);
  const functionNames = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) functionNames.add(statement.name.text);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) functionNames.add(declaration.name.text);
  }
  const tests = value.tests.map((item, index) => {
    if (!record(item) || !["name", "category", "functionName", "reason"].every(key => string(item[key])) || !/^[A-Za-z_$][\w$]*$/.test(String(item.functionName)) || !Array.isArray(item.args) || !("expected" in item) || !integer(item.line)) throw new Error("Invalid test");
    if (!functionNames.has(String(item.functionName)) || Number(item.line) > active.content.split("\n").length || !jsonValue(item.args) || !jsonValue(item.expected)) throw new Error("Test does not match an executable function or JSON contract");
    return { ...item, id: `test:${index}` } as TestCase;
  });
  const complexity = value.complexity;
  if (complexity !== null && (!record(complexity) || !["time", "space", "explanation", "caveat"].every(key => string(complexity[key])) || !Array.isArray(complexity.lines) || !complexity.lines.every(line => integer(line) && line <= active.content.split("\n").length))) throw new Error("Invalid complexity");
  return { problems, tests, complexity: complexity as AIAnalysis["complexity"], explanation: value.explanation, provider: "AI provider" };
}
