import type { FileNode } from "../types";
export function relevantPaths(files: FileNode[], activeFile: string, question = ""): string[] {
  const found = new Set<string>();
  function visit(path: string) {
    if (found.has(path)) return;
    const file = files.find(item => item.kind === "file" && item.path === path);
    if (!file) return;
    found.add(path);
    const imports = [...file.content.matchAll(/(?:from\s*|import\s*\(|require\s*\(|import\s*)["']([^"']+)["']/g)];
    for (const match of imports) {
      if (!match[1].startsWith(".")) continue;
      const parts = path.split("/").slice(0, -1);
      for (const part of match[1].split("/")) { if (part === "..") parts.pop(); else if (part !== ".") parts.push(part); }
      const base = parts.join("/");
      const target = files.find(item => [base, `${base}.js`, `${base}.ts`, `${base}.jsx`, `${base}.tsx`, `${base}/index.js`, `${base}/index.ts`].includes(item.path));
      if (target) visit(target.path);
    }
  }
  visit(activeFile);
  for (const file of files) if (question.includes(file.path) || question.includes(file.path.split("/").at(-1)!)) visit(file.path);
  if (/\b(import|require)\s*\(\s*[^"'\s]/.test(files.find(file => file.path === activeFile)?.content || "")) for (const file of files) if (file.kind === "file") visit(file.path);
  return [...found].sort();
}
