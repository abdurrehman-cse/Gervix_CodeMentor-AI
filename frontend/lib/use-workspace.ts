"use client";
import { useEffect, useRef, useState } from "react";
import { initialFiles, restoreFiles, validPath } from "./workspace";
import type { FileNode } from "./types";
export function useWorkspace() {
  const [files, setFiles] = useState<FileNode[]>(initialFiles);
  const [activeId, setActiveId] = useState("demo");
  const [tabs, setTabs] = useState(["demo"]);
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const snapshot = useRef({ files, tabs, activeId, collapsed });
  snapshot.current = { files, tabs, activeId, collapsed };
  useEffect(() => {
    try {
      const saved = localStorage.getItem("codementor-workspace-v1");
      if (saved) {
        const data = JSON.parse(saved);
        if (!restoreFiles(data.files)) throw new Error();
        setFiles(data.files);
        const validTabs = Array.isArray(data.tabs) ? data.tabs.filter((id: string) => data.files.some((file: FileNode) => file.id === id && file.kind === "file")) : [];
        setTabs(validTabs);
        setActiveId(validTabs.includes(data.activeId) ? data.activeId : validTabs[0] || "");
        setCollapsed(data.collapsed === true);
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
    const timer = setTimeout(persist, 250);
    window.addEventListener("pagehide", persist);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", persist); };
  }, [files, tabs, activeId, collapsed, ready]);
  function open(id: string) { setTabs(current => current.includes(id) ? current : [...current, id]); setActiveId(id); }
  function close(id: string) { const remaining = tabs.filter(tab => tab !== id); setTabs(remaining); if (id === activeId) setActiveId(remaining.at(-1) || ""); }
  function create(parent: string, kind: "file" | "folder") {
    const name = window.prompt(`New ${kind} name (nested paths are supported)`);
    if (!name) return;
    const path = parent ? `${parent}/${name}` : name;
    if (!validPath(path) || files.some(file => file.path === path)) { window.alert("Choose a valid, unique path."); return; }
    const parts = path.split("/");
    const parents = parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
    if (parents.some(parentPath => files.some(file => file.path === parentPath && file.kind === "file"))) { window.alert("A file cannot contain another file."); return; }
    const additions: FileNode[] = parents.filter(parentPath => !files.some(file => file.path === parentPath)).map(parentPath => ({ id: crypto.randomUUID(), path: parentPath, kind: "folder", content: "", saved: "" }));
    const node: FileNode = { id: crypto.randomUUID(), path, kind, content: "", saved: "" };
    setFiles(current => [...current, ...additions, node]);
    if (kind === "file") open(node.id);
  }
  function rename(node: FileNode) {
    const name = window.prompt("New name", node.path.split("/").at(-1));
    if (!name || name.includes("/")) return;
    const parent = node.path.split("/").slice(0, -1).join("/");
    const path = parent ? `${parent}/${name}` : name;
    if (path === node.path) return;
    if (!validPath(path) || files.some(file => file.path === path)) { window.alert("Choose a valid, unique name."); return; }
    setFiles(current => current.map(file => file.id === node.id || file.path.startsWith(`${node.path}/`) ? { ...file, path: path + file.path.slice(node.path.length) } : file));
  }
  function remove(node: FileNode) {
    if (!window.confirm(`Delete ${node.path}${node.kind === "folder" ? " and everything inside it" : ""}? This cannot be undone.`)) return;
    const removed = files.filter(file => file.id === node.id || file.path.startsWith(`${node.path}/`)).map(file => file.id);
    setFiles(current => current.filter(file => !removed.includes(file.id)));
    const remaining = tabs.filter(id => !removed.includes(id)); setTabs(remaining);
    if (removed.includes(activeId)) setActiveId(remaining[0] || "");
  }
  const active = files.find(file => file.id === activeId);
  function edit(content: string) { setFiles(current => current.map(file => file.id === activeId ? { ...file, content } : file)); }
  function save() { setFiles(current => current.map(file => file.id === activeId ? { ...file, saved: file.content } : file)); }
  function download() {
    if (!active) return;
    const url = URL.createObjectURL(new Blob([active.content], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = active.path.split("/").at(-1)!; link.click(); URL.revokeObjectURL(url);
  }
  return { files, active, activeId, tabs, collapsed, ready, storageError, setCollapsed, open, close, create, rename, remove, edit, save, download };
}
