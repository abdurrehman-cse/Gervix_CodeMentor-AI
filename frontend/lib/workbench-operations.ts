import type { WorkspaceState, WorkspaceResult } from "./workspace-operations";
import { createItem, deleteItem, parentPath } from "./workspace-operations";
import { validPath } from "./workspace";

export type WorkbenchOperation = { type: "write" | "edit" | "mkdir" | "delete" | "rename"; path: string; content?: string; target?: string; overwrite?: boolean };
export function workbenchOperation(state: WorkspaceState, operation: WorkbenchOperation): WorkspaceResult {
  const fail = (error: string): WorkspaceResult => ({ ok: false, state, error });
  const node = state.files.find(file => file.path === operation.path);
  if (!validPath(operation.path)) return fail("Invalid workspace path.");
  if (operation.type === "delete") return node ? deleteItem(state, node.id) : fail("This item no longer exists.");
  if (operation.type === "rename") {
    const target = operation.target || "";
    if (!node || !validPath(target)) return fail("Invalid rename destination.");
    if (target === node.path) return { ok: true, node, state };
    if (target.startsWith(`${node.path}/`)) return fail("Cannot move a folder inside itself.");
    const parent = parentPath(target);
    if (parent && !state.files.some(file => file.path === parent && file.kind === "folder")) return fail("Destination folder no longer exists.");
    const affected = state.files.filter(file => file.id === node.id || file.path.startsWith(`${node.path}/`));
    const paths = affected.map(file => target + file.path.slice(node.path.length));
    if (paths.some(path => !validPath(path)) || state.files.some(file => !affected.includes(file) && paths.some(path => path.toLowerCase() === file.path.toLowerCase()))) return fail("A file or folder already exists at the destination.");
    const files = state.files.map(file => affected.includes(file) ? { ...file, path: target + file.path.slice(node.path.length) } : file);
    return { ok: true, state: { ...state, files }, node: files.find(file => file.id === node.id) };
  }
  if (operation.type === "mkdir") return node ? node.kind === "folder" ? { ok: true, state, node } : fail("A file already has this name.") : createItem(state, parentPath(operation.path), "folder", operation.path.split("/").at(-1)!);
  if (node?.kind === "folder") return fail("This path belongs to a folder.");
  if (operation.type === "edit" && !node) return fail("This file no longer exists.");
  if (node && operation.type === "write" && operation.overwrite === false) return fail("A file already has this name.");
  const created = node ? { ok: true as const, state, node } : createItem(state, parentPath(operation.path), "file", operation.path.split("/").at(-1)!);
  if (!created.ok) return created;
  const content = operation.content || "";
  return { ok: true, node: created.node, state: { ...created.state, files: created.state.files.map(file => file.path === operation.path ? { ...file, content: operation.type === "write" && node ? file.content : content, saved: operation.type === "write" ? content : file.saved } : file) } };
}
