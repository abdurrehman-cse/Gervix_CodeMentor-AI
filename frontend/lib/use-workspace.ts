"use client";
import { useEffect, useRef, useState } from "react";
import type { FileNode } from "./types";
import { createItem, deleteItem, initialWorkspace, renameItem, restoreWorkspace, type WorkspaceResult, type WorkspaceState } from "./workspace-operations";

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [modelGeneration, setModelGeneration] = useState(0);
  const snapshot = useRef(state);
  function update(next: WorkspaceState) { snapshot.current = next; setState(next); }
  useEffect(() => {
    try {
      const saved = localStorage.getItem("codementor-workspace-v1");
      if (saved) {
        const restored = restoreWorkspace(JSON.parse(saved));
        if (!restored) throw new Error();
        snapshot.current = restored;
        setState(restored);
      }
    } catch { setStorageError("Saved workspace could not be restored. Export your code before closing if storage is unavailable."); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const persist = () => {
      try { localStorage.setItem("codementor-workspace-v1", JSON.stringify(snapshot.current)); }
      catch { setStorageError("Browser storage is full or unavailable. Download your files to keep a copy."); }
    };
    persist();
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [state, ready]);
  function operation(result: WorkspaceResult) { if (result.ok) update(result.state); return result; }
  function open(id: string) {
    const current = snapshot.current;
    if (!current.files.some(file => file.id === id && file.kind === "file")) return;
    update({ ...current, tabs: current.tabs.includes(id) ? current.tabs : [...current.tabs, id], activeId: id, selectedId: id });
  }
  function close(id: string) {
    const current = snapshot.current;
    const tabs = current.tabs.filter(tab => tab !== id);
    const activeId = id === current.activeId ? tabs[Math.min(current.tabs.indexOf(id), tabs.length - 1)] || "" : current.activeId;
    update({ ...current, tabs, activeId });
  }
  function select(id: string) {
    const current = snapshot.current;
    if (current.selectedId !== id && (!id || current.files.some(file => file.id === id))) update({ ...current, selectedId: id });
  }
  function toggleFolder(id: string, expanded?: boolean) {
    const current = snapshot.current;
    if (!current.files.some(file => file.id === id && file.kind === "folder")) return;
    const close = expanded === undefined ? !current.closedIds.includes(id) : !expanded;
    update({ ...current, closedIds: close ? [...new Set([...current.closedIds, id])] : current.closedIds.filter(folder => folder !== id), selectedId: id });
  }
  function create(parent: string, kind: "file" | "folder", name: string) { return operation(createItem(snapshot.current, parent, kind, name)); }
  function rename(id: string, name: string) { return operation(renameItem(snapshot.current, id, name)); }
  function remove(id: string) { return operation(deleteItem(snapshot.current, id)); }
  function edit(content: string) { const current = snapshot.current; if (!current.files.some(file => file.id === current.activeId && file.content !== content)) return false; update({ ...current, files: current.files.map(file => file.id === current.activeId ? { ...file, content } : file) }); return true; }
  function save() { const current = snapshot.current; update({ ...current, files: current.files.map(file => file.id === current.activeId ? { ...file, saved: file.content } : file) }); }
  function setCollapsed(collapsed: boolean) { update({ ...snapshot.current, collapsed }); }
  function replaceFiles(files: FileNode[], activePath: string) {
    const copied = files.map(file => ({ ...file }));
    const activeId = copied.find(file => file.kind === "file" && file.path === activePath)?.id || copied.find(file => file.kind === "file")?.id || "";
    const next = restoreWorkspace({ ...snapshot.current, files: copied, activeId, tabs: activeId ? [activeId] : [], selectedId: activeId, closedIds: [] });
    if (!next) throw new Error("The saved workspace could not be restored.");
    update(next);
    setModelGeneration(current => current + 1);
  }
  const active = state.files.find(file => file.id === state.activeId && file.kind === "file");
  function download() {
    if (!active) return;
    const url = URL.createObjectURL(new Blob([active.content], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = active.path.split("/").at(-1)!; link.click(); URL.revokeObjectURL(url);
  }
  return { ...state, active, ready, storageError, modelGeneration, setCollapsed, open, close, select, toggleFolder, create, rename, remove, edit, save, download, replaceFiles, getSnapshot: () => snapshot.current };
}
