const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.CODEMENTOR_PLAYWRIGHT || "playwright");
process.env.PATH = `${process.env.SystemRoot || "C:\\Windows"}\\System32;${process.env.PATH || ""}`;
async function readAnalysis(pending) {
  const response = await pending;
  const text = await response.text();
  assert.ok(response.ok() && response.headers()["content-type"]?.includes("application/json"), `Mentor HTTP ${response.status()}: ${text.slice(0, 160)}`);
  return JSON.parse(text);
}
async function main() {
  const url = process.env.CODEMENTOR_URL;
  assert.ok(url, "Set CODEMENTOR_URL to the public HTTPS tunnel URL.");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1560, height: 1050 } });
    page.setDefaultTimeout(90000);
    const errors = [];
    fs.mkdirSync("test-artifacts", { recursive: true });
    page.on("request", request => {
      if (request.url().endsWith("/api/mentor") && request.method() === "POST") fs.writeFileSync("test-artifacts/cloud-request.json", request.postData() || "");
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", async dialog => { errors.push(`Native dialog: ${dialog.type()}`); await dialog.dismiss(); });
    await page.goto(url);
    await page.getByRole("button", { name: "Beginner", exact: false }).click();
    await page.waitForFunction(() => document.querySelector(".real-workbench")?.contentWindow?.codeMentorWorkbench, undefined, { timeout: 120000 });
    const frame = page.frames().find(item => item.url().endsWith("/ide/index.html"));
    assert.ok(frame);
    assert.equal(await frame.locator(".part.sidebar").count(), 1);
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
    console.log("PASS public workbench and isolated extension workers loaded");
    let response = page.waitForResponse(result => result.url().endsWith("/api/mentor") && result.request().method() === "POST");
    await frame.getByRole("button", { name: "Submit for Review", exact: true }).click();
    let result = await readAnalysis(response);
    assert.ok(["OpenAI", "Gemini", "AI provider", "Gemma 4 (free)", "Groq"].includes(result.provider) || process.env.CODEMENTOR_ALLOW_LOCAL_FALLBACK === "1" && result.provider === "Local checks · cloud AI unavailable", JSON.stringify(result));
    if (process.env.CODEMENTOR_REQUIRE_FREE === "1") assert.ok(["Gemma 4 (free)", "Groq", "Local checks · cloud AI unavailable"].includes(result.provider), "A paid provider must not be used in free-only mode");
    assert.ok(result.problems.some(problem => problem.line === 3));
    assert.equal(result.provenance.version, 1);
    await frame.locator(".review-status").getByText("Analysis current · v1", { exact: true }).waitFor();
    console.log(`PASS ${result.provider} versioned boundary diagnosis`);
    const quickFix = frame.getByRole("button", { name: "Quick Fix", exact: true });
    let correction = "previewed quick fix";
    if (await quickFix.count()) {
      await quickFix.click();
      await page.getByRole("button", { name: "Apply Fix", exact: true }).click();
    } else {
      correction = "student boundary correction (no safe AI fix supplied)";
      await frame.evaluate(() => {
        const editor = window.codeMentorWorkbench.editor();
        const model = editor.getModel();
        const index = model.getValue().indexOf("<=");
        if (index < 0) throw new Error("The expected sample boundary condition is missing");
        const start = model.getPositionAt(index), end = model.getPositionAt(index + 2);
        editor.pushUndoStop();
        editor.executeEdits("student-correction", [{ range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }, text: "<" }]);
        editor.pushUndoStop();
      });
    }
    response = page.waitForResponse(item => item.url().endsWith("/api/mentor") && item.request().method() === "POST");
    await frame.locator(".mentor .coming").getByRole("button", { name: "Generate Test Cases", exact: false }).click();
    result = await readAnalysis(response);
    if (process.env.CODEMENTOR_REQUIRE_FREE === "1") assert.ok(["Gemma 4 (free)", "Groq", "Local checks · cloud AI unavailable"].includes(result.provider), "Paid test generation is disabled in free-only mode");
    assert.ok(result.tests.length > 0, JSON.stringify(result));
    assert.equal(result.provenance.version, 2);
    await frame.getByRole("button", { name: "Run Tests", exact: true }).click();
    const summary = frame.locator(".panel-body").getByText(/\d+ \/ \d+ passed/);
    await summary.waitFor();
    const counts = (await summary.innerText()).match(/(\d+) \/ (\d+)/);
    assert.equal(counts[1], counts[2]);
    fs.mkdirSync("test-artifacts", { recursive: true });
    await page.screenshot({ path: "test-artifacts/cloud-workbench.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS public workbench, isolated workers, ${result.provider} analysis, versioned ${correction}, ${counts[2]} actual sandbox tests`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
