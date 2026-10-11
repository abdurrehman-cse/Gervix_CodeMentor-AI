const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { workbenchOperation } = require("../lib/workbench-operations.ts");
const { initialWorkspace, restoreWorkspace } = require("../lib/workspace-operations.ts");
const initial = () => structuredClone(initialWorkspace);
function apply(state, operation) { const result = workbenchOperation(state, operation); assert.equal(result.ok, true, result.error); assert.deepEqual(restoreWorkspace(result.state), result.state); return result.state; }
test("native saves and edits target the specified file without switching the active editor", () => {
  let state = apply(initial(), { type: "write", path: "utils.ts", content: "export const value = 1;", overwrite: false });
  state.activeId = "demo";
  state = apply(state, { type: "edit", path: "utils.ts", content: "export const value = 2;" });
  const file = state.files.find(file => file.path === "utils.ts");
  assert.equal(file.saved, "export const value = 1;");
  assert.equal(file.content, "export const value = 2;");
  assert.equal(state.activeId, "demo");
  state = apply(state, { type: "write", path: "utils.ts", content: file.content, overwrite: true });
  assert.equal(state.files.find(file => file.path === "utils.ts").saved, file.content);
});
test("native nested folder moves preserve stable identities, unsaved drafts, and tabs", () => {
  let state = apply(initial(), { type: "mkdir", path: "src" });
  state = apply(state, { type: "write", path: "src/index.test.ts", content: "saved" });
  state = apply(state, { type: "edit", path: "src/index.test.ts", content: "draft" });
  state = apply(state, { type: "mkdir", path: "lib" });
  const file = state.files.find(file => file.path === "src/index.test.ts");
  const tabs = [...state.tabs];
  state = apply(state, { type: "rename", path: "src", target: "lib/algorithms" });
  assert.deepEqual(state.tabs, tabs);
  assert.deepEqual(state.files.find(item => item.id === file.id), { ...file, path: "lib/algorithms/index.test.ts" });
  state = apply(state, { type: "delete", path: "lib" });
  assert.ok(!state.files.some(item => item.path.startsWith("lib")));
  assert.ok(!state.tabs.includes(file.id));
});
test("a delayed disk write cannot overwrite a newer working draft", () => {
  let state = apply(initial(), { type: "edit", path: "solution.js", content: "newer draft" });
  state = apply(state, { type: "write", path: "solution.js", content: "older save", overwrite: true });
  const file = state.files.find(file => file.path === "solution.js");
  assert.equal(file.content, "newer draft");
  assert.equal(file.saved, "older save");
});
test("native operations reject traversal, collisions, stale files, and recursive moves atomically", () => {
  let state = apply(initial(), { type: "mkdir", path: "src" });
  state = apply(state, { type: "write", path: "src/index.js", content: "source" });
  for (const operation of [{ type: "write", path: "../escape.js" }, { type: "write", path: "solution.js", overwrite: false }, { type: "mkdir", path: "SOLUTION.js" }, { type: "edit", path: "missing.js", content: "draft" }, { type: "rename", path: "src", target: "src/child" }, { type: "rename", path: "src/index.js", target: "solution.js", overwrite: true }, { type: "rename", path: "src/index.js", target: "missing/index.js" }]) {
    const result = workbenchOperation(state, operation);
    assert.equal(result.ok, false, JSON.stringify(operation));
    assert.equal(result.state, state);
  }
});
