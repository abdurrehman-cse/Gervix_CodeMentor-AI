import type { FileNode } from "./types";
import { initialFiles, restoreFiles, validPath } from "./workspace";

export type WorkspaceState = { files: FileNode[]; tabs: string[]; activeId: string; collapsed: boolean; closedIds: string[]; selectedId: string };
export type OperationResult = { ok: true; node?: FileNode } | { ok: false; error: string };
export type WorkspaceResult = OperationResult & { state: WorkspaceState };
export const initialWorkspace: WorkspaceState = { files: initialFiles, tabs: ["demo"], activeId: "demo", collapsed: false, closedIds: [], selectedId: "demo" };
export function parentPath(path: string) { return path.split("/").slice(0, -1).join("/"); }
export function descendants(files: FileNode[], node: FileNode) { return files.filter(file => file.id === node.id || file.path.startsWith(`${node.path}/`)); }
function fail(state: WorkspaceState, error: string): WorkspaceResult { return { ok: false, error, state }; }
function namingError(name: string, nested: boolean) {
  if (!name) return "Enter a name.";
  if (!nested && name.includes("/")) return "Rename accepts a name, not a path.";
  if (!validPath(name)) return "Use a valid name without reserved names, trailing dots, or invalid path characters. Traversal is not allowed.";
  return "";
}
function expandPath(state: WorkspaceState, path: string, files: FileNode[]) {
  return state.closedIds.filter(id => !files.some(file => file.id === id && file.kind === "folder" && (path === file.path || path.startsWith(`${file.path}/`))));
}
export function createItem(state: WorkspaceState, parent: string, kind: "file" | "folder", input: string): WorkspaceResult {
  const name = input.trim();
  const error = namingError(name, true);
  if (error) return fail(state, error);
  if (parent && !state.files.some(file => file.path === parent && file.kind === "folder")) return fail(state, "The destination folder no longer exists.");
  const path = parent ? `${parent}/${name}` : name;
  if (!validPath(path)) return fail(state, "The resulting path is too long or invalid.");
  if (state.files.some(file => file.path.toLowerCase() === path.toLowerCase())) return fail(state, "A file or folder with this name already exists here.");
  const parts = path.split("/");
  const additions: FileNode[] = [];
  for (let index = 1; index < parts.length; index++) {
    const ancestorPath = parts.slice(0, index).join("/");
    const existing = state.files.find(file => file.path.toLowerCase() === ancestorPath.toLowerCase());
    if (existing && (existing.kind !== "folder" || existing.path !== ancestorPath)) return fail(state, "A path segment conflicts with an existing file or folder. Use its exact folder name.");
    if (!existing) additions.push({ id: crypto.randomUUID(), path: ancestorPath, kind: "folder", content: "", saved: "" });
  }
  if (state.files.length + additions.length + 1 > 200) return fail(state, "This workspace supports up to 200 files and folders.");
  const node: FileNode = { id: crypto.randomUUID(), path, kind, content: "", saved: "" };
  const files = [...state.files, ...additions, node];
  return { ok: true, node, state: { ...state, files, selectedId: node.id, closedIds: expandPath(state, path, files), tabs: kind === "file" ? [...state.tabs, node.id] : state.tabs, activeId: kind === "file" ? node.id : state.activeId } };
}
export function renameItem(state: WorkspaceState, id: string, input: string): WorkspaceResult {
  const node = state.files.find(file => file.id === id);
  if (!node) return fail(state, "This item no longer exists.");
  const name = input.trim();
  const error = namingError(name, false);
  if (error) return fail(state, error);
  const parent = parentPath(node.path);
  const path = parent ? `${parent}/${name}` : name;
  if (path === node.path) return { ok: true, node, state };
  const affected = descendants(state.files, node);
  const paths = affected.map(file => path + file.path.slice(node.path.length));
  if (paths.some(next => !validPath(next))) return fail(state, "The resulting path is too long or invalid.");
  if (state.files.some(file => !affected.includes(file) && paths.some(next => next.toLowerCase() === file.path.toLowerCase()))) return fail(state, "A file or folder with this name already exists here.");
  const files = state.files.map(file => affected.includes(file) ? { ...file, path: path + file.path.slice(node.path.length) } : file);
  return { ok: true, node: files.find(file => file.id === id), state: { ...state, files } };
}
export function deleteItem(state: WorkspaceState, id: string): WorkspaceResult {
  const node = state.files.find(file => file.id === id);
  if (!node) return fail(state, "This item no longer exists.");
  const removed = new Set(descendants(state.files, node).map(file => file.id));
  const files = state.files.filter(file => !removed.has(file.id));
  const tabs = state.tabs.filter(tab => !removed.has(tab));
  let activeId = state.activeId;
  if (removed.has(activeId)) {
    activeId = tabs[Math.min(state.tabs.indexOf(activeId), tabs.length - 1)] || files.find(file => file.kind === "file")?.id || "";
    if (activeId && !tabs.includes(activeId)) tabs.push(activeId);
  }
  const selectedId = removed.has(state.selectedId) ? files.find(file => file.path === parentPath(node.path))?.id || activeId : state.selectedId;
  return { ok: true, state: { ...state, files, tabs, activeId, selectedId, closedIds: state.closedIds.filter(folder => !removed.has(folder)) } };
}
export function restoreWorkspace(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<WorkspaceState>;
  if (!restoreFiles(data.files)) return null;
  const files = data.files;
  const tabs = Array.isArray(data.tabs) ? [...new Set(data.tabs.filter(id => typeof id === "string" && files.some(file => file.id === id && file.kind === "file")))] : [];
  const activeId = typeof data.activeId === "string" && tabs.includes(data.activeId) ? data.activeId : tabs[0] || "";
  const closedIds = Array.isArray(data.closedIds) ? [...new Set(data.closedIds.filter(id => files.some(file => file.id === id && file.kind === "folder")))] : [];
  const selectedId = typeof data.selectedId === "string" && files.some(file => file.id === data.selectedId) ? data.selectedId : activeId;
  return { files, tabs, activeId, collapsed: data.collapsed === true, closedIds, selectedId };
}
