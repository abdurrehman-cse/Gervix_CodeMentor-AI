const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { createSubmission, contentHash, canonicalFiles, detectChanges, provenanceFor, provenanceMatches, attachProvenance, validateHistory, sameProvenance } = require("../lib/versions/snapshots.ts");
const { relevantPaths } = require("../lib/versions/dependencies.ts");
const { lineDiff } = require("../lib/versions/diff.ts");
const { resultIsCurrent, canApplySnapshotFix } = require("../lib/versions/guards.ts");
const { localAnalysis } = require("../lib/local-analysis.ts");
const { initialFiles, initialCode } = require("../lib/workspace.ts");
const { validContext } = require("../lib/ai/context.ts");
const { validateAnalysis } = require("../lib/ai-validation.ts");
const files = code => [{ ...initialFiles[0], content: code }];
function context(code) { return { action: "analyze", files: files(code), activeFile: "solution.js", selection: { text: "", startLine: 1, endLine: 1 }, line: 1, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "", level: "beginner", mode: "learning" }; }

test("snapshots are immutable, uniquely identified, ordered and hashed independently of saved flags", async () => {
  const working = files(initialCode);
  const first = await createSubmission([], working, "solution.js");
  working[0].content = "changed later";
  assert.equal(first.files[0].content, initialCode);
  assert.equal(first.version, 1);
  assert.equal(first.files[0].version, 1);
  assert.equal(first.contentHash, await contentHash(canonicalFiles(files(initialCode))));
  assert.equal(Object.isFrozen(first.files[0]), true);
  const second = await createSubmission([first], working, "solution.js");
  assert.equal(second.version, 2);
  assert.equal(second.files[0].version, 2);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.contentHash, second.contentHash);
  assert.equal(await createSubmission([first], [{ ...files(initialCode)[0], saved: "different" }], "solution.js"), first);
});
test("unchanged submits are deduplicated unless explicitly forced, including after refresh", async () => {
  const first = await createSubmission([], files(initialCode), "solution.js");
  const restored = await validateHistory(JSON.parse(JSON.stringify([first])));
  assert.equal((await createSubmission(restored, files(initialCode), "solution.js")).id, first.id);
  const repeated = await createSubmission(restored, files(initialCode), "solution.js", "review", true);
  assert.equal(repeated.version, 2);
  assert.equal(repeated.files[0].version, 1);
  assert.match(repeated.summary, /unchanged/);
});
test("change detection distinguishes additions, modifications, renames and deletions", () => {
  const before = [{ id: "one", path: "one.js", kind: "file", content: "1", saved: "1" }, { id: "gone", path: "gone.js", kind: "file", content: "", saved: "" }];
  const next = [{ ...before[0], path: "renamed.js", content: "2" }, { id: "new", path: "new.js", kind: "file", content: "", saved: "" }];
  assert.deepEqual(detectChanges(before, next).map(change => change.kind), ["renamed", "modified", "added", "deleted"]);
});
test("line diffs accurately preserve context and added/removed lines, with bounded large input", () => {
  const diff = lineDiff("before\nkeep\n", "after\nkeep\nadded");
  assert.deepEqual(diff.filter(line => line.kind !== "added").map(line => line.text), ["before", "keep", ""]);
  assert.deepEqual(diff.filter(line => line.kind !== "removed").map(line => line.text), ["after", "keep", "added"]);
  assert.equal(lineDiff("", "new")[0].kind, "added");
  assert.equal(lineDiff("gone", "")[0].kind, "removed");
  assert.equal(lineDiff("a\n".repeat(600), "b\n".repeat(600)).length, 1202);
});
test("dependency changes invalidate results while unrelated changes do not", async () => {
  const working = [{ id: "main", path: "main.js", kind: "file", content: 'import { value } from "./utils"; console.log(value);', saved: "" }, { id: "utils", path: "utils.js", kind: "file", content: "export const value = 1;", saved: "" }, { id: "readme", path: "README.md", kind: "file", content: "notes", saved: "" }];
  const submission = await createSubmission([], working, "main.js");
  const provenance = provenanceFor(submission, relevantPaths(working, "main.js"), "main.js");
  assert.deepEqual(Object.keys(provenance.files), ["main.js", "utils.js"]);
  assert.equal(provenanceMatches(provenance, submission, working.map(file => file.path === "README.md" ? { ...file, content: "unrelated" } : file)), true);
  assert.equal(provenanceMatches(provenance, submission, working.map(file => file.path === "utils.js" ? { ...file, content: "new" } : file)), false);
  assert.equal(provenanceMatches(provenance, submission, working.filter(file => file.path !== "utils.js")), false);
  assert.ok(relevantPaths(working, "main.js", "compare README.md").includes("README.md"));
});
test("newly resolved missing dependencies invalidate previous analysis", async () => {
  const working = [{ ...files('import "./helper.js";')[0] }];
  const submission = await createSubmission([], working, "solution.js");
  const provenance = provenanceFor(submission, ["solution.js"], "solution.js");
  assert.equal(provenanceMatches(provenance, submission, [...working, { id: "helper", path: "helper.js", kind: "file", content: "", saved: "" }]), false);
});
test("slower older requests, aborted requests and changed revisions cannot replace current results", async () => {
  const submission = await createSubmission([], files(initialCode), "solution.js");
  const provenance = provenanceFor(submission, ["solution.js"], "solution.js");
  assert.equal(resultIsCurrent(provenance, submission, files(initialCode), 2, 2, 3, 3, false), true);
  assert.equal(resultIsCurrent(provenance, submission, files(initialCode), 1, 2, 3, 3, false), false);
  assert.equal(resultIsCurrent(provenance, submission, files(initialCode), 2, 2, 2, 3, false), false);
  assert.equal(resultIsCurrent(provenance, submission, files(initialCode), 2, 2, 3, 3, true), false);
});
test("outdated fixes cannot modify a newer file even if their small target range is unchanged", async () => {
  const submission = await createSubmission([], files(initialCode), "solution.js");
  const provenance = provenanceFor(submission, ["solution.js"], "solution.js");
  const problem = attachProvenance(localAnalysis(context(initialCode)), provenance).problems[0];
  assert.equal(canApplySnapshotFix(problem, submission, files(initialCode), initialCode), true);
  const changed = initialCode.replace("let total = 0", "let total = 10");
  assert.ok(changed.includes(problem.quickFix.oldCode));
  assert.equal(canApplySnapshotFix(problem, submission, files(changed), changed), false);
  assert.equal(canApplySnapshotFix(problem, submission, files(initialCode), changed), false);
});
test("provenance is attached to every problem, hint container, test and complexity report", async () => {
  const submission = await createSubmission([], files(initialCode), "solution.js");
  const provenance = provenanceFor(submission, ["solution.js"], "solution.js");
  const analysis = attachProvenance(localAnalysis(context(initialCode)), provenance);
  for (const artifact of [analysis, ...analysis.problems, ...analysis.tests, analysis.complexity]) assert.equal(sameProvenance(artifact.provenance, provenance), true);
  const restored = await validateHistory(JSON.parse(JSON.stringify([{ ...submission, reviews: [{ requestId: "one", action: "analyze", activeFile: "solution.js", status: "complete", analysis }] }])));
  assert.equal(restored[0].reviews[0].analysis.tests.length, analysis.tests.length);
  assert.equal(restored[0].reviews[0].status, "complete");
});
test("history rejects corrupted checksums and invented results and repairs interrupted status", async () => {
  const submission = await createSubmission([], files(initialCode), "solution.js");
  const corrupt = JSON.parse(JSON.stringify([submission])); corrupt[0].files[0].content = "tampered";
  await assert.rejects(validateHistory(corrupt), /checksum/);
  await assert.rejects(validateHistory([{ ...submission, version: 0 }]), /Invalid/);
  const resumed = await validateHistory([{ ...submission, reviews: [{ requestId: "one", action: "analyze", activeFile: "solution.js", status: "running" }] }]);
  assert.equal(resumed[0].reviews[0].status, "cancelled");
  const analysis = attachProvenance(localAnalysis(context(initialCode)), provenanceFor(submission, ["solution.js"], "solution.js"));
  await assert.rejects(validateHistory([{ ...submission, reviews: [{ requestId: "one", action: "tests", activeFile: "solution.js", status: "complete", analysis, results: [{ id: "fake", passed: true, received: "0" }] }] }]), /Invalid saved execution/);
});
test("three real demo versions generate fresh diagnostics, hints, tests and complexity", async () => {
  const first = await createSubmission([], files(initialCode), "solution.js");
  const secondCode = initialCode.replace("<=", "<").replace(/\bi\b/g, "index");
  const second = await createSubmission([first], files(secondCode), "solution.js");
  const thirdCode = "function sum(numbers) {\n  if (numbers.length === 0) return 0;\n  let total = 0;\n  for (const number of numbers) { total += number; }\n  return total;\n}\nconsole.log(sum([1, 2, 3]));";
  const third = await createSubmission([first, second], files(thirdCode), "solution.js");
  assert.deepEqual([first.version, second.version, third.version], [1, 2, 3]);
  assert.equal(localAnalysis(context(initialCode)).problems[0].hints.length, 3);
  assert.equal(localAnalysis(context(secondCode)).problems.length, 0);
  const latest = attachProvenance(localAnalysis(context(thirdCode)), provenanceFor(third, ["solution.js"], "solution.js"));
  assert.ok(latest.tests.length >= 6);
  assert.equal(latest.complexity.time, "O(n)");
  assert.ok(latest.tests.every(test => test.provenance.version === 3));
});
test("malformed request provenance is rejected", async () => {
  const submission = await createSubmission([], files(initialCode), "solution.js");
  const request = { ...context(initialCode), provenance: provenanceFor(submission, ["solution.js"], "solution.js") };
  assert.equal(validContext(request), true);
  for (const bad of [{ ...request.provenance, version: 0 }, { ...request.provenance, contentHash: "fake" }, { ...request.provenance, files: { "../oops": "bad" } }]) assert.equal(validContext({ ...request, provenance: bad }), false);
});
test("generated tests are validated against required, optional and rest parameters", () => {
  const input = context("function sum(first, second = 1, ...remaining) { return first + second; }");
  const result = { problems: [], complexity: null, explanation: "Test contract", tests: [{ name: "Normal", category: "normal", functionName: "sum", args: [], expected: 0, reason: "Checks the declared contract", line: 1 }] };
  assert.throws(() => validateAnalysis(result, input), /signature/);
  result.tests[0].args = [1, 2, 3, 4];
  assert.equal(validateAnalysis(result, input).tests.length, 1);
  result.tests[0].args = [];
  result.tests[0].category = "invalid";
  assert.equal(validateAnalysis(result, input).tests.length, 1);
  result.tests[0].args = [1, 2];
  assert.throws(() => validateAnalysis(result, context("function sum(first) { return first; }")), /signature/);
  result.tests[0].category = "normal";
  result.tests[0].args = [1];
  assert.throws(() => validateAnalysis(result, context("function sum(first = 0, second) { return first + second; }")), /signature/);
  assert.equal(validateAnalysis(result, context("function sum(this: void, first: number) { return first; }")).tests.length, 1);
});
