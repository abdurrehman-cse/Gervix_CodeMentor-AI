import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
export default defineConfig({ base: "/ide/", plugins: [{ name: "workbench-notices", generateBundle() { this.emitFile({ type: "asset", fileName: "THIRD_PARTY_NOTICES.md", source: readFileSync(new URL("./THIRD_PARTY_NOTICES.md", import.meta.url), "utf8") }); } }], build: { outDir: "../public/ide", emptyOutDir: true, target: "esnext", chunkSizeWarningLimit: 2500 }, worker: { format: "es" } });
