const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.CODEMENTOR_PLAYWRIGHT || "playwright");
process.env.PATH = `${process.env.SystemRoot || "C:\\Windows"}\\System32;${process.env.PATH || ""}`;
const deadline = setTimeout(() => process.exit(2), 240000);
deadline.unref();
async function main() {
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: "msedge" }); }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  const requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().endsWith("/api/mentor") && request.method() === "POST") requests.push(request.postDataJSON()); });
  async function state() {
    return page.evaluate(() => new Promise(resolve => window.require(["vs/editor/editor.main"], monaco => {
      const instance = monaco.editor.getEditors().find(editor => editor.getDomNode()?.isConnected);
      window.editorSmokeInstance ||= instance;
      const range = instance.getSelection();
      const model = instance.getModel();
      const rect = instance.getDomNode().getBoundingClientRect();
      resolve({ sameInstance: window.editorSmokeInstance === instance, code: instance.getValue(), selected: model.getValueInRange(range), range: { startLine: range.startLineNumber, startColumn: range.startColumn, endLine: range.endLineNumber, endColumn: range.endColumn }, scroll: instance.getScrollTop(), uri: model.uri.toString(), top: rect.top, height: rect.height, lines: model.getLineCount(), visibleEnd: Math.max(...instance.getVisibleRanges().map(range => range.endLineNumber)), position: instance.getPosition() });
    })));
  }
  async function waitForEditor(predicate, message, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const current = await state();
      if (predicate(current)) return current;
      await page.waitForTimeout(50);
    }
    assert.fail(message);
  }
  async function point(line, column) {
    return page.evaluate(({ line, column }) => new Promise(resolve => window.require(["vs/editor/editor.main"], monaco => {
      const instance = monaco.editor.getEditors().find(editor => editor.getDomNode()?.isConnected);
      const rect = instance.getDomNode().getBoundingClientRect();
      const position = instance.getScrolledVisiblePosition({ lineNumber: line, column });
      resolve({ x: rect.left + position.left + 1, y: rect.top + position.top + position.height / 2, bottom: rect.bottom });
    })), { line, column });
  }
  async function focus() { await page.locator(".monaco-editor .view-lines").waitFor(); await page.locator(".monaco-editor").click({ position: { x: 160, y: 50 } }); }
  async function write(code) { await focus(); await page.keyboard.press("Control+KeyA"); await page.evaluate(code => navigator.clipboard.writeText(code), code); await page.keyboard.press("Control+KeyV"); await page.keyboard.press("Control+Home"); await page.waitForTimeout(200); assert.equal((await state()).code.replace(/\r\n/g, "\n"), code); }
  async function dragAll() {
    const before = await state();
    const start = await point(1, 1);
    const end = await point(before.lines, before.code.split("\n").at(-1).length + 1);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 30 }); await page.mouse.up();
    const after = await state();
    assert.equal(after.top, before.top, "Selecting text must not move the editor");
    assert.equal(after.height, before.height, "Selecting text must not resize Monaco and cancel its drag operation");
    assert.equal(after.selected, before.code, "Dragging across the function must select its entire body and final line");
    return after;
  }
  async function menu(name) { await page.getByRole("button", { name: "Editor actions", exact: true }).click(); await page.getByRole("menuitem", { name, exact: false }).click(); }
  try {
    await page.goto(process.env.CODEMENTOR_URL || "http://localhost:3000", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Beginner", exact: false }).click();
    await page.locator(".monaco-editor .view-lines").waitFor();
    const code = ["function runTests() {", "  const results = [];", "", "  " + "/" + "/ Trace every iteration, including the boundary.", ...Array.from({ length: 15 }, (_, index) => `  results.push(${index});`), "", "  return results;", "}"].join("\n");
    await write(code);
    await dragAll();
    console.log("PASS: real mouse drag selects an entire function across comments, blank lines, indentation and final line without layout changes");
    await page.keyboard.press("Control+KeyC");
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"), code);
    await page.keyboard.press("Control+KeyX"); await waitForEditor(current => current.code === "", "Cut must remove selected code");
    await page.keyboard.press("Control+KeyV"); await waitForEditor(current => current.code === code, "Paste must restore the clipboard content");
    await page.keyboard.press("Control+KeyZ"); await waitForEditor(current => current.code === "", "Undo must reverse the paste");
    await page.keyboard.press("Control+KeyY"); await waitForEditor(current => current.code === code, "Redo must restore the paste");
    await page.keyboard.press("Control+KeyA"); assert.equal((await state()).selected, code);
    console.log("PASS: Ctrl+A, real clipboard copy/cut/paste, undo and redo");
    await page.keyboard.press("Control+Home");
    const word = await point(1, 12);
    await page.mouse.click(word.x, word.y, { clickCount: 2 }); assert.equal((await state()).selected, "runTests");
    await page.waitForTimeout(550);
    await page.mouse.click(word.x, word.y, { clickCount: 3 }); assert.equal((await state()).selected, "function runTests() {\n");
    await page.waitForTimeout(550);
    const start = await point(1, 1); const end = await point(4, 12);
    await page.mouse.click(start.x, start.y);
    await page.keyboard.down("Shift"); await page.mouse.click(end.x, end.y); await page.keyboard.up("Shift");
    assert.deepEqual((await state()).range, { startLine: 1, startColumn: 1, endLine: 4, endColumn: 12 });
    console.log("PASS: double-click words, triple-click lines, Shift+click and standard keyboard navigation");
    await page.keyboard.press("Control+Home");
    const selected = await dragAll();
    await page.getByRole("toolbar", { name: "Selected code actions" }).getByRole("button", { name: "Explain", exact: true }).click();
    await page.getByRole("button", { name: "Analyze my code", exact: false }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !Array.from(document.querySelectorAll(".mentor button")).some(button => button.textContent.includes("Cancel explain")));
    assert.equal(requests.at(-1).selection.text, code);
    assert.equal(requests.at(-1).selection.startColumn, 1);
    assert.equal(requests.at(-1).selection.endColumn, 2);
    assert.equal(requests.at(-1).files.find(file => file.path === requests.at(-1).activeFile).content, code);
    assert.equal((await state()).selected, code);
    await page.getByRole("button", { name: "Analyze my code", exact: false }).click();
    await page.locator(".provider-label").waitFor();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll(".mentor button")).some(button => button.textContent.includes("Cancel analyze")));
    assert.equal((await state()).selected, code);
    for (const tab of ["Output", "Tests", "Complexity", "Problems"]) await page.locator(".panel-tabs").getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    const afterPanels = await state();
    assert.equal(afterPanels.selected, code); assert.equal(afterPanels.uri, selected.uri); assert.equal(afterPanels.scroll, selected.scroll); assert.equal(afterPanels.sameInstance, true);
    await page.getByRole("toolbar").getByRole("button", { name: "Ask Mentor", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Ask the mentor" }).evaluate(element => element === document.activeElement), true);
    assert.equal((await state()).selected, code);
    console.log("PASS: contextual actions send exact selected text and workspace context; AI responses/panel updates preserve model, cursor, scroll and selection");
    await page.getByRole("button", { name: "New file or folder" }).click();
    await page.getByRole("menuitem", { name: "New file", exact: true }).click();
    await page.getByRole("textbox", { name: "New file name", exact: true }).fill("other.ts");
    await page.getByRole("textbox", { name: "New file name", exact: true }).press("Enter");
    await write("const unsaved = 7;");
    await page.getByRole("tab", { name: "solution.js •", exact: true }).click();
    assert.equal((await state()).code, code); assert.equal((await state()).selected, code);
    await page.getByRole("tab", { name: "other.ts •", exact: true }).click();
    assert.equal((await state()).code, "const unsaved = 7;");
    await page.getByRole("tab", { name: "solution.js •", exact: true }).click();
    assert.equal((await state()).sameInstance, true);
    console.log("PASS: switching tabs preserves each file's unsaved code and view state without remounting the editor");
    await write("function compact(){let answer=1;return answer;}\nconsole.log(compact());");
    await focus(); await page.keyboard.press("Control+KeyF");
    const find = page.locator('.find-widget textarea[aria-label="Find"]');
    await find.waitFor(); await find.fill("answer");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+KeyH");
    const replace = page.locator('.find-widget input[aria-label="Replace"], .find-widget textarea[aria-label="Replace"]');
    await replace.waitFor(); await find.fill("answer"); await replace.fill("result");
    await replace.press("Control+Alt+Enter");
    await page.waitForFunction(() => document.querySelector(".monaco-editor .view-lines")?.textContent.includes("result"));
    await page.keyboard.press("Escape");
    assert.ok((await state()).code.includes("let result=1"));
    assert.ok(!(await state()).code.includes("answer"));
    await menu("Go to Line");
    const quickInput = page.locator(".quick-input-widget input:visible").first();
    await quickInput.fill(":2"); await page.waitForTimeout(150); await quickInput.press("Enter"); assert.equal((await state()).position.lineNumber, 2);
    await menu("Format Document");
    const formatted = await waitForEditor(current => current.code.includes("let result = 1"), "Formatting must update the actual model");
    assert.ok(formatted.code.includes("let result = 1"), `Formatted source: ${JSON.stringify(formatted.code)}`);
    assert.equal(await page.evaluate(() => { const workspace = JSON.parse(localStorage.getItem("codementor-workspace-v1")); return workspace.files.find(file => file.id === workspace.activeId).content; }), formatted.code);
    await focus(); await page.keyboard.press("Control+Shift+KeyP"); await quickInput.waitFor();
    await quickInput.fill(">Go to Line"); await page.locator(".quick-input-list .monaco-list-row").filter({ hasText: "Go to Line/Column" }).first().waitFor(); await quickInput.press("Enter"); await quickInput.fill(":1"); await page.waitForTimeout(150); await quickInput.press("Enter"); assert.equal((await state()).position.lineNumber, 1);
    console.log("PASS: Find/Replace shortcuts, Go to Line, Format Document and command palette execute Monaco's real commands");
    await write("function sum(numbers) {\n  let total = 0;\n  for (let index = 0; index <= numbers.length; index++) {\n    total += numbers[index];\n  }\n  return total;\n}");
    await page.getByRole("button", { name: "Analyze my code", exact: false }).click();
    await page.locator(".squiggly-warning").first().waitFor();
    await focus(); await page.keyboard.press("Control+Home"); await page.keyboard.press("F8");
    assert.equal((await state()).position.lineNumber, 3);
    await page.keyboard.press("Escape");
    await menu("Previous Problem"); assert.equal((await state()).position.lineNumber, 3);
    await page.keyboard.press("Escape"); await page.keyboard.press("Control+Home");
    await dragAll();
    console.log("PASS: real diagnostic navigation works and diagnostic decorations do not intercept drag selection");
    const longCode = ["function runTests() {", ...Array.from({ length: 90 }, (_, index) => `  console.log(${index});`), "}"].join("\n");
    await write(longCode);
    const longStart = await point(1, 1);
    await page.mouse.move(longStart.x, longStart.y); await page.mouse.down(); await page.mouse.move(longStart.x + 30, longStart.bottom + 40, { steps: 15 });
    await waitForEditor(current => current.visibleEnd === current.lines, "Dragging below the editor must scroll to the final line");
    const longEnd = await point(longCode.split("\n").length, 2);
    await page.mouse.move(longEnd.x, longEnd.y); await page.mouse.up();
    assert.equal((await state()).selected, longCode);
    console.log("PASS: native Monaco drag auto-scroll selects a large function through the final line");
    assert.deepEqual(errors, []);
    fs.mkdirSync(path.join(__dirname, "../test-artifacts"), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, "../test-artifacts/editor.png"), fullPage: true });
  } catch (error) {
    fs.mkdirSync(path.join(__dirname, "../test-artifacts"), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, "../test-artifacts/editor-failure.png"), fullPage: true }).catch(() => {});
    console.error("Browser runtime errors:", errors);
    throw error;
  } finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
