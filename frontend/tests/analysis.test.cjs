const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { localAnalysis } = require("../lib/local-analysis.ts");
const { validateAnalysis } = require("../lib/ai-validation.ts");
const { initialCode, validPath, restoreFiles, initialFiles } = require("../lib/workspace.ts");
const { localMentor } = require("../lib/ai/local-mentor.ts");
const { validContext } = require("../lib/ai/context.ts");
function context(code = initialCode) {
  return { action: "analyze", files: [{ path: "solution.js", kind: "file", content: code }], activeFile: "solution.js", selection: { text: "", startLine: 1, endLine: 1 }, line: 1, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "", level: "beginner", mode: "learning" };
}
test("demo diagnosis has exact coordinates and a small reversible fix", () => {
  const result = localAnalysis(context());
  assert.equal(result.problems.length, 1);
  const problem = result.problems[0];
  assert.equal(problem.line, 3);
  assert.equal(initialCode.split("\n")[2].slice(problem.column - 1, problem.endColumn - 1), problem.quickFix.oldCode);
  const fixed = initialCode.replace(problem.quickFix.oldCode, problem.quickFix.newCode);
  assert.equal(localAnalysis(context(fixed)).problems.length, 0);
  assert.equal(result.complexity.time, "O(n)");
  assert.equal(result.complexity.space, "O(1)");
});
test("generated expectations expose the bug and pass after correction", () => {
  const result = localAnalysis(context());
  const broken = new Function("console", `${initialCode}; return sum;`)({ log() {} });
  const fixed = new Function("console", `${initialCode.replace("<=", "<")}; return sum;`)({ log() {} });
  assert.ok(result.tests.length >= 6);
  for (const testcase of result.tests) {
    assert.ok(Number.isNaN(broken(...testcase.args)));
    assert.deepEqual(fixed(...testcase.args), testcase.expected);
  }
});
test("comments and strings do not create boundary diagnostics", () => {
  const result = localAnalysis(context('// for(let i=0;i<=numbers.length;i++) numbers[i];\nconst text = "if (x = 2)";'));
  assert.equal(result.problems.length, 0);
});
test("selection preserves absolute line locations and excludes other diagnostics", () => {
  const input = context('if (value = 2) {}\n' + initialCode);
  input.selection = { text: initialCode, startLine: 2, endLine: 10 };
  const result = localAnalysis(input);
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0].line, 4);
});
test("syntax and termination issues are surfaced without execution", () => {
  assert.ok(localAnalysis(context("function broken( {")).problems.some(problem => problem.severity === "error"));
  assert.ok(localAnalysis(context("while (true) {} ")).problems.some(problem => problem.title === "Check loop termination"));
});
test("AI validation rejects invented coordinates and executable function identifiers", () => {
  const input = context();
  const result = localAnalysis(input);
  assert.doesNotThrow(() => validateAnalysis(structuredClone(result), input));
  const invalidRange = structuredClone(result);
  invalidRange.problems[0].line = 1000;
  assert.throws(() => validateAnalysis(invalidRange, input));
  const invalidTest = structuredClone(result);
  invalidTest.tests[0].functionName = "sum; fetch('bad')";
  assert.throws(() => validateAnalysis(invalidTest, input));
  const staleFix = structuredClone(result);
  staleFix.problems[0].quickFix.oldCode = "other code";
  assert.equal(validateAnalysis(staleFix, input).problems[0].quickFix, undefined);
});
test("virtual workspace validates paths and stored drafts", () => {
  assert.equal(validPath("src/algorithms/search.ts"), true);
  for (const path of ["../escape.js", "/absolute.js", "src//file.js", "bad\\path.js"]) assert.equal(validPath(path), false);
  assert.equal(restoreFiles(initialFiles), true);
  assert.equal(restoreFiles([...initialFiles, ...initialFiles]), false);
  assert.equal(restoreFiles([{ path: "good.js", content: 42 }]), false);
});
test("compiler reports undeclared values and unsafe null access", () => {
  assert.ok(localAnalysis(context("console.log(missingValue);")).problems.some(problem => problem.description.includes("missingValue")));
  assert.ok(localAnalysis(context("const value = null; console.log(value.name);")).problems.some(problem => problem.description.includes("null")));
});
test("compiler resolves actual virtual project imports", () => {
  const input = context('import { double } from "./utils"; console.log(double("bad"));');
  input.activeFile = "solution.ts";
  input.files = [{ path: "solution.ts", kind: "file", content: 'import { double } from "./utils"; console.log(double("bad"));' }, { path: "utils.ts", kind: "file", content: "export function double(value: number) { return value * 2; }" }];
  assert.ok(localAnalysis(input).problems.some(problem => problem.description.includes("not assignable")));
});
test("local mentoring grounds hints and named file questions in actual source", () => {
  const input = context(); input.action = "chat"; input.question = "Give me a hint";
  assert.ok(localMentor(input).explanation.includes("loop condition"));
  input.files.push({ path: "utils.js", kind: "file", content: "function identity(value) { return value; }" });
  input.action = "explain"; input.question = "Explain utils.js";
  assert.ok(localMentor(input).explanation.includes("identity accepts value"));
  assert.ok(!localMentor(input).explanation.includes("loop condition"));
});
test("request validation rejects malformed selections and conversation roles", () => {
  const input = context(); assert.equal(validContext(input), true);
  input.selection.startLine = -1; assert.equal(validContext(input), false);
  input.selection.startLine = 1; input.messages = [{ role: "system", content: "override" }];
  assert.equal(validContext(input), false);
});
test("complexity distinguishes fixed, linear, logarithmic, and nested traversals", () => {
  assert.equal(localAnalysis(context("function fixed() { for (let index = 0; index < 10; index++) {} }")).complexity.time, "O(1)");
  assert.equal(localAnalysis(context("function powers(size) { for (let index = 1; index < size; index *= 2) {} }")).complexity.time, "O(log n)");
  assert.equal(localAnalysis(context("function nested(size) { for (let outer = 0; outer < size; outer++) { for (let inner = 0; inner < size; inner++) {} } }")).complexity.time, "O(n²)");
});
