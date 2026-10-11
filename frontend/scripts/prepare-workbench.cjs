const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const cwd = path.resolve(__dirname, "../workbench");
const output = path.resolve(cwd, "../public/ide");
function run(args) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status || 1);
}
const lock = JSON.parse(readFileSync(path.join(cwd, "package-lock.json"), "utf8"));
const metadata = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
const packages = Object.keys({ ...metadata.dependencies, ...metadata.devDependencies });
if (packages.some(name => {
  try { return JSON.parse(readFileSync(path.join(cwd, "node_modules", name, "package.json"), "utf8")).version !== lock.packages[`node_modules/${name}`].version; }
  catch { return true; }
})) run(["ci", "--no-audit", "--no-fund"]);
function sources(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => { const file = path.join(directory, entry.name); return entry.isDirectory() ? sources(file) : [file]; }); }
const inputs = [...sources(path.join(cwd, "src")), ...["index.html", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "THIRD_PARTY_NOTICES.md"].map(file => path.join(cwd, file))].sort();
const hash = createHash("sha256");
for (const file of inputs) { hash.update(path.relative(cwd, file)); hash.update(readFileSync(file)); }
const digest = hash.digest("hex");
const marker = path.join(output, ".build-hash");
if (existsSync(path.join(output, "index.html")) && existsSync(marker) && readFileSync(marker, "utf8") === digest) process.exit(0);
run(["run", "build"]);
writeFileSync(marker, digest);
