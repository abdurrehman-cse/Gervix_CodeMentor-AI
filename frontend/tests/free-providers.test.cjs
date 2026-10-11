const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { configuredProviders } = require("../lib/ai/providers.ts");
const { getMentorAnalysis } = require("../lib/ai/provider.ts");
const { initialCode } = require("../lib/workspace.ts");
test("free-only routing reuses the Google key for free-only Gemma and excludes paid fallbacks", () => {
  const providers = configuredProviders({ AI_FREE_ONLY: "true", GEMINI_API_KEY: "google-test", OPENAI_API_KEY: "paid-test", AI_API_KEY: "custom-test", AI_API_URL: "https://paid.invalid", AI_MODEL: "paid-model", GROQ_API_KEY: "groq-test" });
  assert.deepEqual(providers.map(provider => provider.name), ["Gemma 4 (free)", "Groq"]);
  assert.equal(providers[0].model, "gemma-4-26b-a4b-it");
  assert.equal(providers[0].key, "google-test");
  assert.equal(providers[1].model, "openai/gpt-oss-20b");
  assert.deepEqual(configuredProviders({ AI_FREE_ONLY: "true", OPENAI_API_KEY: "paid-test" }), []);
});
test("free-only routing rejects unsafe model overrides and mistyped cost-policy flags", () => {
  assert.throws(() => configuredProviders({ AI_FREE_ONLY: "true", GEMINI_API_KEY: "test", GEMMA_MODEL: "gemini-pro" }), /free-only Gemma/);
  assert.throws(() => configuredProviders({ AI_FREE_ONLY: "true", GROQ_API_KEY: "test", GROQ_MODEL: "unverified-model" }), /free-plan model/);
  assert.throws(() => configuredProviders({ AI_FREE_ONLY: "tru", OPENAI_API_KEY: "test" }), /true or false/);
});
test("explicit paid opt-in retains existing custom and cloud integrations", () => {
  const providers = configuredProviders({ AI_FREE_ONLY: "false", AI_API_KEY: "custom", AI_API_URL: "https://custom.invalid", AI_MODEL: "custom-model", OPENAI_API_KEY: "openai", GEMINI_API_KEY: "google" });
  assert.deepEqual(providers.map(provider => provider.name), ["AI provider", "OpenAI", "Gemini"]);
  assert.throws(() => configuredProviders({ AI_API_KEY: "custom" }), /configuration is incomplete/);
});
test("native Gemma sends immutable source context and validates final JSON without exposing thoughts or keys", async () => {
  const names = ["AI_FREE_ONLY", "GEMINI_API_KEY", "GEMMA_MODEL", "GROQ_API_KEY", "AI_LOCAL_FALLBACK"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, { AI_FREE_ONLY: "true", GEMINI_API_KEY: "google-test", AI_LOCAL_FALLBACK: "false" });
  delete process.env.GEMMA_MODEL; delete process.env.GROQ_API_KEY;
  const context = { action: "explain", files: [{ path: "solution.js", kind: "file", content: initialCode }], activeFile: "solution.js", selection: { text: "", startLine: 1, endLine: 1 }, line: 1, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "Explain this loop", level: "beginner", mode: "learning" };
  let invalid = false;
  global.fetch = async (url, options) => {
    assert.ok(url.endsWith("/gemma-4-26b-a4b-it:generateContent"));
    assert.equal(options.headers["X-goog-api-key"], "google-test");
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.maxOutputTokens, 4096);
    assert.equal(JSON.parse(body.contents[0].parts[0].text).files[0].content, initialCode);
    assert.match(body.systemInstruction.parts[0].text, /untrusted task data/);
    const text = invalid ? "invalid JSON" : JSON.stringify({ problems: [], tests: [], complexity: null, explanation: "Trace the condition before each iteration." });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: "private reasoning" }, { text }] } }] }));
  };
  try {
    const result = await getMentorAnalysis(context);
    assert.equal(result.provider, "Gemma 4 (free)");
    assert.equal(JSON.stringify(result).includes("private reasoning"), false);
    assert.equal(JSON.stringify(result).includes("google-test"), false);
    invalid = true;
    await assert.rejects(getMentorAnalysis(context), /All configured providers failed/);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});
test("Gemma quota failure falls back to validated Groq JSON without calling paid APIs", async () => {
  const names = ["AI_FREE_ONLY", "GEMINI_API_KEY", "GEMMA_MODEL", "GROQ_API_KEY", "GROQ_MODEL", "OPENAI_API_KEY", "AI_API_KEY", "AI_LOCAL_FALLBACK"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, { AI_FREE_ONLY: "true", GEMINI_API_KEY: "google-test", GROQ_API_KEY: "groq-test", OPENAI_API_KEY: "paid-test", AI_API_KEY: "paid-custom", AI_LOCAL_FALLBACK: "false" });
  delete process.env.GEMMA_MODEL; delete process.env.GROQ_MODEL;
  const context = { action: "analyze", files: [{ path: "solution.js", kind: "file", content: initialCode }], activeFile: "solution.js", selection: { text: "", startLine: 1, endLine: 1 }, line: 1, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "Explain the loop", level: "beginner", mode: "learning" };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url.includes("googleapis.com")) return new Response("Quota reached", { status: 429 });
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer groq-test");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "openai/gpt-oss-20b");
    assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.response_format.type, "json_object");
    assert.equal(JSON.parse(body.messages[1].content).files[0].content, initialCode);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ problems: [], tests: [], complexity: null, explanation: "Trace the last index against the array length." }) } }] }));
  };
  try {
    const result = await getMentorAnalysis(context);
    assert.equal(result.provider, "Groq");
    assert.equal(calls.length, 2);
    assert.equal(JSON.stringify(result).includes("groq-test"), false);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});
