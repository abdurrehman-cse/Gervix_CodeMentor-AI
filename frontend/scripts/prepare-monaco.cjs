const fs = require("node:fs");
const path = require("node:path");
const source = path.resolve(__dirname, "../node_modules/monaco-editor");
const destination = path.join(__dirname, "../public/monaco/vs");
const version = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).version;
const stamp = path.join(destination, ".version");
if (!fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8") !== version) {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(path.join(source, "min/vs"), destination, { recursive: true });
  fs.writeFileSync(stamp, version);
}
