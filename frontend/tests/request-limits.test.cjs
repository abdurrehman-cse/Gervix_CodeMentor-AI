const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { acquireMentorRequest } = require("../lib/ai/request-limits.ts");
test("public mentor limits concurrency and request bursts and releases safely", () => {
  const now = 60000;
  const releases = Array.from({ length: 4 }, () => acquireMentorRequest(now));
  assert.ok(releases.every(Boolean));
  assert.equal(acquireMentorRequest(now), null);
  for (const release of releases) { release(); release(); }
  for (let count = 4; count < 30; count += 1) {
    const release = acquireMentorRequest(now);
    assert.ok(release);
    release();
  }
  assert.equal(acquireMentorRequest(now), null);
  const release = acquireMentorRequest(now + 60000);
  assert.ok(release);
  release();
});
