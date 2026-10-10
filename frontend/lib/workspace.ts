import type { FileNode } from "./types";
export const initialCode = `function sum(numbers) {
  let total = 0;
  for (let i = 0; i <= numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}

console.log(sum([1, 2, 3]));`;
export const initialFiles: FileNode[] = [{ id: "demo", path: "solution.js", kind: "file", content: initialCode, saved: initialCode }];
export function language(path: string) { return /\.tsx?$/.test(path) ? "typescript" : /\.jsx?$/.test(path) ? "javascript" : path.endsWith(".json") ? "json" : path.endsWith(".md") ? "markdown" : "plaintext"; }
export function workspaceSignature(files: FileNode[]) { return JSON.stringify(files.map(({ id, path, kind, content }) => ({ id, path, kind, content }))); }
export function validPath(path: string) { return path.length < 200 && path.split("/").every(part => part.trim() === part && !!part && part !== "." && part !== ".." && !/[\\:*?"<>|\x00-\x1f]/.test(part)); }
export function restoreFiles(value: unknown): value is FileNode[] {
  return Array.isArray(value) && value.length <= 200 && value.every(file => file && typeof file.id === "string" && typeof file.path === "string" && validPath(file.path) && ["file", "folder"].includes(file.kind) && typeof file.content === "string" && typeof file.saved === "string") && new Set(value.map(file => file.path)).size === value.length && new Set(value.map(file => file.id)).size === value.length && value.every(file => { const parts = file.path.split("/"); return parts.slice(0, -1).every((_: string, index: number) => value.some(parent => parent.path === parts.slice(0, index + 1).join("/") && parent.kind === "folder")); });
}
