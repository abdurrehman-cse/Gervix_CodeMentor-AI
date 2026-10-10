const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { getMentorAnalysis } = require("../lib/ai/provider.ts");
const { initialCode } = require("../lib/workspace.ts");
const input = { action: "chat", files: [{ path: "solution.js", kind: "file", content: initialCode }], activeFile: "solution.js", selection: { text: "", startLine: 1, endLine: 1 }, line: 3, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "Why is this failing?", level: "beginner", mode: "learning" };
test("provider transmits workspace context and validates response without exposing credentials", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.AI_API_KEY, url: process.env.AI_API_URL, model: process.env.AI_MODEL };
  process.env.AI_API_KEY = "test-secret"; process.env.AI_API_URL = "https://provider.invalid/chat/completions"; process.env.AI_MODEL = "test-model";
  let content = JSON.stringify({ problems: [], tests: [], complexity: null, explanation: "Trace the loop's final index." });
  global.fetch = async (url, options) => {
    assert.equal(url, process.env.AI_API_URL);
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "test-model");
    assert.equal(JSON.parse(body.messages[1].content).files[0].content, initialCode);
    assert.equal(JSON.parse(body.messages[1].content).line, 3);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  };
  try {
    const result = await getMentorAnalysis(input);
    assert.equal(result.provider, "AI provider");
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
    content = "invalid JSON";
    await assert.rejects(getMentorAnalysis(input));
    global.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(getMentorAnalysis(input), /could not complete/);
    global.fetch = async (_, options) => { assert.equal(options.signal.aborted, true); throw options.signal.reason; };
    const controller = new AbortController(); controller.abort();
    await assert.rejects(getMentorAnalysis(input, controller.signal), { name: "AbortError" });
  } finally {
    global.fetch = previousFetch;
    for (const [name, value] of Object.entries({ AI_API_KEY: previous.key, AI_API_URL: previous.url, AI_MODEL: previous.model })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
