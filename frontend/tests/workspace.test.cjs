const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { createItem, renameItem, deleteItem, restoreWorkspace, initialWorkspace } = require("../lib/workspace-operations.ts");
function initial() { return structuredClone(initialWorkspace); }
function create(state, parent, kind, name) { const result = createItem(state, parent, kind, name); assert.equal(result.ok, true, result.error); return result.state; }

test("creation trims names, opens files, and atomically creates explicit nested paths", () => {
  const state = create(initial(), "", "file", " src/algorithms/index.test.ts ");
  assert.deepEqual(state.files.map(file => file.path), ["solution.js", "src", "src/algorithms", "src/algorithms/index.test.ts"]);
  assert.equal(state.files.at(-1).id, state.activeId);
  assert.ok(state.tabs.includes(state.activeId));
  assert.equal(state.selectedId, state.activeId);
  assert.deepEqual(restoreWorkspace(state), state);
});
test("invalid and empty names cannot mutate the workspace", () => {
  const state = initial();
  for (const name of ["", "  ", "../escape.ts", "src/../escape.ts", "src//test.ts", "bad\\file", "bad:name", "name.", "NUL.ts", "COM1", "/absolute.ts", "bad\u0000name"]) {
    const result = createItem(state, "", "file", name);
    assert.equal(result.ok, false, name);
    assert.equal(result.state, state);
  }
});
test("sibling duplicates, repeated submits, and file-folder conflicts are rejected", () => {
  let state = create(initial(), "", "file", "utils.ts");
  for (const kind of ["file", "folder"]) for (const name of ["utils.ts", "UTILS.ts"]) assert.equal(createItem(state, "", kind, name).ok, false);
  assert.equal(createItem(state, "", "file", "utils.ts/child.ts").ok, false);
  state = create(state, "", "folder", "src");
  state = create(state, "src", "file", "utils.ts");
  assert.equal(state.files.filter(file => file.path.endsWith("utils.ts")).length, 2);
  assert.equal(createItem(state, "missing", "file", "child.ts").ok, false);
});
test("new folder is selected and its ancestors are expanded without changing the editor", () => {
  let state = create(initial(), "", "folder", "src");
  const parent = state.files.find(file => file.path === "src");
  state.closedIds = [parent.id];
  state = create(state, "src", "folder", "deep/child");
  assert.equal(state.files.find(file => file.id === state.selectedId).path, "src/deep/child");
  assert.equal(state.activeId, "demo");
  assert.deepEqual(state.closedIds, []);
});
test("renaming folders preserves identities, drafts, tabs, and tree state", () => {
  const state = create(initial(), "", "file", "src/deep/index.test.ts");
  const node = state.files.find(file => file.path === "src");
  const active = state.files.find(file => file.id === state.activeId);
  active.content = "unsaved source";
  state.closedIds = [node.id];
  const result = renameItem(state, node.id, " lib ");
  assert.equal(result.ok, true);
  assert.equal(result.state.files.find(file => file.id === active.id).path, "lib/deep/index.test.ts");
  assert.equal(result.state.files.find(file => file.id === active.id).content, "unsaved source");
  assert.equal(result.state.files.find(file => file.id === active.id).saved, "");
  assert.deepEqual(result.state.tabs, state.tabs);
  assert.deepEqual(result.state.closedIds, state.closedIds);
  assert.equal(result.state.activeId, state.activeId);
});
test("rename no-op, conflicts, missing nodes, and path traversal are safe", () => {
  const state = create(initial(), "", "folder", "src");
  assert.equal(renameItem(state, "demo", "solution.js").state, state);
  for (const name of ["src", "../solution.js", "new/path.js", "", "CON"]) assert.equal(renameItem(state, "demo", name).ok, false);
  assert.equal(renameItem(state, "gone", "name.js").ok, false);
  assert.equal(renameItem(state, "demo", "solution.ts").state.files[0].path, "solution.ts");
});
test("deleting nested contents removes tabs and selects a remaining file", () => {
  const state = create(initial(), "", "file", "src/deep/new.ts");
  const folder = state.files.find(file => file.path === "src");
  state.closedIds = [folder.id];
  const result = deleteItem(state, folder.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.files, initial().files);
  assert.deepEqual(result.state.tabs, ["demo"]);
  assert.equal(result.state.activeId, "demo");
  assert.equal(result.state.selectedId, "demo");
  assert.deepEqual(result.state.closedIds, []);
  assert.equal(deleteItem(result.state, folder.id).ok, false);
});
test("deleting the last file leaves a valid empty workspace", () => {
  const state = deleteItem(initial(), "demo").state;
  assert.deepEqual(state.files, []);
  assert.deepEqual(state.tabs, []);
  assert.equal(state.activeId, "");
  assert.ok(restoreWorkspace(state));
});
test("restore repairs stale tabs and selections, migrates old data, and rejects corrupt trees", () => {
  const state = initial();
  state.tabs = ["gone", "demo", "demo"];
  state.activeId = "gone";
  state.selectedId = "gone";
  state.closedIds = ["gone", "demo"];
  const restored = restoreWorkspace(state);
  assert.deepEqual(restored.tabs, ["demo"]);
  assert.equal(restored.activeId, "demo");
  assert.equal(restored.selectedId, "demo");
  assert.deepEqual(restored.closedIds, []);
  assert.ok(restoreWorkspace({ files: initial().files, tabs: ["demo"], activeId: "demo", collapsed: true }));
  for (const value of [null, {}, { files: [{ id: "orphan", path: "missing/file.ts", kind: "file", content: "", saved: "" }] }, { files: [...initial().files, { ...initial().files[0], id: "other", path: "SOLUTION.js" }] }]) assert.equal(restoreWorkspace(value), null);
});
test("capacity and descendant path limits fail without partial intermediate folders", () => {
  const state = initial();
  while (state.files.length < 200) state.files.push({ id: `id-${state.files.length}`, path: `file-${state.files.length}.ts`, kind: "file", content: "", saved: "" });
  const result = createItem(state, "", "file", "new/deep/file.ts");
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  const nested = create(initial(), "", "file", `src/${"x".repeat(185)}.ts`);
  assert.equal(renameItem(nested, nested.files.find(file => file.path === "src").id, "longer-folder-name").ok, false);
});
