const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { readEditorSelection, emptySelection } = require("../lib/editor-selection.ts");
const { localAnalysis } = require("../lib/local-analysis.ts");
const { validContext } = require("../lib/ai/context.ts");
function context(code, selection) { return { action: "analyze", files: [{ path: "solution.js", kind: "file", content: code }], activeFile: "solution.js", selection, line: 1, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "", level: "beginner", mode: "learning" }; }

test("editor selection snapshots use Monaco's actual range and text, including partial lines", () => {
  const range = { startLineNumber: 2, startColumn: 4, endLineNumber: 8, endColumn: 11, positionLineNumber: 2 };
  const instance = { getModel: () => ({ getValueInRange(actual) { assert.equal(actual, range); return "actual selected code\n\n  with indentation"; } }), getSelection: () => range };
  assert.deepEqual(readEditorSelection(instance), { selection: { text: "actual selected code\n\n  with indentation", startLine: 2, endLine: 8, startColumn: 4, endColumn: 11 }, line: 2 });
});
test("an unavailable model or editor produces a safe empty selection snapshot", () => {
  assert.deepEqual(readEditorSelection(null), { selection: emptySelection, line: 1 });
  assert.deepEqual(readEditorSelection({ getModel: () => null, getSelection: () => null }), { selection: emptySelection, line: 1 });
});
test("collapsed selection retains the current cursor coordinates without fabricating code", () => {
  const range = { startLineNumber: 10, startColumn: 9, endLineNumber: 10, endColumn: 9, positionLineNumber: 10 };
  const instance = { getModel: () => ({ getValueInRange: () => "" }), getSelection: () => range };
  assert.deepEqual(readEditorSelection(instance), { selection: { text: "", startLine: 10, endLine: 10, startColumn: 9, endColumn: 9 }, line: 10 });
});
test("same-line diagnostics are restricted to the exact selected columns", () => {
  const code = "let first = 0, second = 0; if (first = 1) {} if (second = 2) {}";
  const text = "second = 2";
  const startColumn = code.indexOf(text) + 1;
  const result = localAnalysis(context(code, { text, startLine: 1, endLine: 1, startColumn, endColumn: startColumn + text.length }));
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].column, startColumn);
  assert.equal(result.problems[0].endColumn, startColumn + text.length);
});
test("selected function complexity ignores other functions and preserves meaningful scope", () => {
  const selected = "function linear(size) { for (let index = 0; index < size; index++) {} }";
  const other = "function quadratic(size) { for (let outer = 0; outer < size; outer++) { for (let inner = 0; inner < size; inner++) {} } }";
  const result = localAnalysis(context(`${other} ${selected}`, { text: selected, startLine: 1, endLine: 1, startColumn: other.length + 2, endColumn: other.length + 2 + selected.length }));
  assert.equal(result.complexity.time, "O(n)");
  assert.ok(result.complexity.explanation.includes("Scope: linear (selected code)"));
});
test("structured selection columns reject malformed or reversed ranges", () => {
  const input = context("const value = 1;", { text: "value", startLine: 1, endLine: 1, startColumn: 7, endColumn: 12 });
  assert.equal(validContext(input), true);
  for (const column of [0, -1, 2.5, "7", undefined]) { input.selection.startColumn = column; assert.equal(validContext(input), false); }
  input.selection.startColumn = 15;
  assert.equal(validContext(input), false);
});
