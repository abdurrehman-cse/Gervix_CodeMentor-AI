"use client";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { FileNode } from "../../lib/types";
import { parentPath, type OperationResult } from "../../lib/workspace-operations";
import InlineNameInput from "./InlineNameInput";
import DeleteDialog from "./DeleteDialog";
import "./explorer.css";

type Props = { files: FileNode[]; activeId: string; selectedId: string; closedIds: string[]; ready: boolean; onOpen: (id: string) => void; onSelect: (id: string) => void; onToggle: (id: string, expanded?: boolean) => void; onCreate: (parent: string, kind: "file" | "folder", name: string) => OperationResult; onRename: (id: string, name: string) => OperationResult; onDelete: (id: string) => OperationResult; search: boolean };
type Edit = { parent: string; kind: "file" | "folder"; id?: string; value: string; error: string };
type Menu = { node?: FileNode; x: number; y: number };
export type ExplorerHandle = { create: (parent: string, kind: "file" | "folder") => void };
function icon(file: FileNode, closed: boolean) { return file.kind === "folder" ? closed ? "▸" : "▾" : /\.tsx?$/.test(file.path) ? "TS" : /\.jsx?$/.test(file.path) ? "JS" : file.path.endsWith(".json") ? "{}" : file.path.endsWith(".md") ? "M↓" : "◇"; }
const Explorer = forwardRef<ExplorerHandle, Props>(function Explorer(props, ref) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState<Edit | null>(null);
  const [deleteId, setDeleteId] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const selected = props.files.find(file => file.id === props.selectedId);
  const deletion = props.files.find(file => file.id === deleteId);
  function focusRow(id?: string) { requestAnimationFrame(() => { const rows = treeRef.current?.querySelectorAll<HTMLButtonElement>("button[data-node-id]"); const row = Array.from(rows || []).find(row => row.dataset.nodeId === id); (row || treeRef.current?.querySelector<HTMLButtonElement>("button") || document.querySelector<HTMLButtonElement>(".explorer-heading button"))?.focus(); }); }
  function cancelEdit() { const id = editing?.id || props.selectedId; setEditing(null); focusRow(id); }
  function startCreate(parent: string, kind: "file" | "folder") {
    if (!props.ready || deleteId) return;
    props.files.filter(file => file.kind === "folder" && (file.path === parent || parent.startsWith(`${file.path}/`))).forEach(file => props.onToggle(file.id, true));
    submitted.current = false;
    setMenu(null);
    setEditing({ parent, kind, value: "", error: "" });
  }
  useImperativeHandle(ref, () => ({ create: startCreate }));
  function startRename(node: FileNode) {
    if (!props.ready || deleteId) return;
    submitted.current = false;
    props.onSelect(node.id);
    setMenu(null);
    setEditing({ id: node.id, parent: parentPath(node.path), kind: node.kind, value: node.path.split("/").at(-1)!, error: "" });
  }
  function submit() {
    if (!editing || submitted.current) return;
    submitted.current = true;
    try {
      const result = editing.id ? props.onRename(editing.id, editing.value) : props.onCreate(editing.parent, editing.kind, editing.value);
      if (result.ok) { setEditing(null); if (editing.kind === "folder" || editing.id) focusRow(result.node?.id); }
      else { submitted.current = false; setEditing({ ...editing, error: result.error }); }
    } catch { submitted.current = false; setEditing({ ...editing, error: "This operation could not be completed. Your workspace is unchanged; try again." }); }
  }
  function showMenu(node: FileNode | undefined, x: number, y: number) {
    if (!props.ready || deleteId) return;
    setEditing(null);
    if (node) props.onSelect(node.id);
    setMenu({ node, x, y });
  }
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.floor(Math.max(8, Math.min(menu.x, window.innerWidth - Math.ceil(rect.width) - 8)));
    const y = Math.floor(Math.max(8, Math.min(menu.y, window.innerHeight - Math.ceil(rect.height) - 8)));
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
    menuRef.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setMenu(null); focusRow(menu.node?.id); } };
    const reposition = () => setMenu(null);
    window.addEventListener("pointerdown", dismiss); window.addEventListener("keydown", key); window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", key); window.removeEventListener("resize", reposition); };
  }, [menu]);
  useEffect(() => { if (props.search) { setEditing(null); setMenu(null); } }, [props.search]);
  useEffect(() => { if (deleteId && !deletion) setDeleteId(""); }, [deleteId, deletion]);
  function input(depth: number) { return editing && <InlineNameInput key={editing.id || `${editing.parent}:${editing.kind}`} kind={editing.kind} renaming={!!editing.id} value={editing.value} error={editing.error} depth={depth} onChange={value => { submitted.current = false; setEditing({ ...editing, value, error: "" }); }} onSubmit={submit} onCancel={cancelEdit} onBlurCancel={() => setEditing(null)}/>; }
  function keyboard(event: React.KeyboardEvent<HTMLButtonElement>, node: FileNode) {
    const rows = Array.from(treeRef.current?.querySelectorAll<HTMLButtonElement>("button[data-node-id]") || []);
    const index = rows.indexOf(event.currentTarget);
    let target: HTMLButtonElement | undefined;
    if (event.key === "ArrowDown") target = rows[Math.min(index + 1, rows.length - 1)];
    if (event.key === "ArrowUp") target = rows[Math.max(index - 1, 0)];
    if (event.key === "Home") target = rows[0];
    if (event.key === "End") target = rows.at(-1);
    if (target) { event.preventDefault(); target.focus(); }
    if (event.key === "ArrowRight" && node.kind === "folder") { event.preventDefault(); if (props.closedIds.includes(node.id)) props.onToggle(node.id, true); else { const child = rows[index + 1]; if (props.files.some(file => file.id === child?.dataset.nodeId && parentPath(file.path) === node.path)) child?.focus(); } }
    if (event.key === "ArrowLeft") { event.preventDefault(); if (node.kind === "folder" && !props.closedIds.includes(node.id)) props.onToggle(node.id, false); else rows.find(row => props.files.find(file => file.id === row.dataset.nodeId)?.path === parentPath(node.path))?.focus(); }
    if (event.key === "F2") { event.preventDefault(); startRename(node); }
    if (event.key === "Delete") { event.preventDefault(); setEditing(null); setMenu(null); setDeleteId(node.id); }
    if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showMenu(node, rect.left, rect.bottom); }
  }
  const visible = props.files.filter(file => !props.files.some(folder => folder.kind === "folder" && props.closedIds.includes(folder.id) && file.path.startsWith(`${folder.path}/`)));
  const focusId = visible.some(file => file.id === props.selectedId) ? props.selectedId : visible[0]?.id;
  function tree(parent: string, depth = 0): React.ReactNode {
    return <>{editing && !editing.id && editing.parent === parent && input(depth)}{props.files.filter(file => parentPath(file.path) === parent).sort((left, right) => left.kind === right.kind ? left.path.localeCompare(right.path) : left.kind === "folder" ? -1 : 1).map(file => <div key={file.id} role="none">{editing?.id === file.id ? input(depth) : <button role="treeitem" aria-level={depth + 1} aria-label={file.path.split("/").at(-1)} aria-selected={props.selectedId === file.id} aria-expanded={file.kind === "folder" ? !props.closedIds.includes(file.id) : undefined} tabIndex={focusId === file.id ? 0 : -1} data-node-id={file.id} title={file.path} className={`tree-row ${props.activeId === file.id ? "file" : ""} ${props.selectedId === file.id ? "selected" : ""}`} style={{ paddingLeft: 8 + depth * 14 }} onFocus={() => props.onSelect(file.id)} onClick={() => { if (file.kind === "file") props.onOpen(file.id); else props.onToggle(file.id); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); showMenu(file, event.clientX, event.clientY); }} onKeyDown={event => keyboard(event, file)}><span aria-hidden="true" className={`icon-${/\.tsx?$/.test(file.path) ? "ts" : /\.jsx?$/.test(file.path) ? "js" : file.path.endsWith(".json") ? "json" : "md"}`}>{icon(file, props.closedIds.includes(file.id))}</span>{file.path.split("/").at(-1)}{file.content !== file.saved && " •"}</button>}{file.kind === "folder" && !props.closedIds.includes(file.id) && <div role="group">{tree(file.path, depth + 1)}</div>}</div>)}</>;
  }
  const parent = menu?.node?.kind === "folder" ? menu.node.path : menu?.node ? parentPath(menu.node.path) : "";
  return <aside className="explorer"><div className="explorer-heading"><p className="eyebrow">{props.search ? "SEARCH" : "EXPLORER"}</p><button disabled={!props.ready || !!deleteId || props.search} aria-label="New file or folder" onClick={event => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); if (menu) setMenu(null); else showMenu(selected, rect.left, rect.bottom); }}>+</button></div><button className="explorer-root" onContextMenu={event => { event.preventDefault(); showMenu(undefined, event.clientX, event.clientY); }} onClick={() => props.onSelect("")}>▾ LEARNING WORKSPACE</button>{props.search ? <><input autoFocus aria-label="Search workspace" placeholder="Search files and code" value={query} onChange={event => setQuery(event.target.value)} />{query && props.files.filter(file => file.kind === "file" && `${file.path}\n${file.content}`.toLowerCase().includes(query.toLowerCase())).map(file => <button className="tree-row" key={file.id} onClick={() => props.onOpen(file.id)}>{file.path}</button>)}</> : <div ref={treeRef} className="explorer-tree" role="tree" aria-label="Learning workspace files" onContextMenu={event => { event.preventDefault(); showMenu(undefined, event.clientX, event.clientY); }}>{tree("")}</div>}<div className="lesson"><span className="eyebrow">THE MENTOR APPROACH</span><p>Read the clue.<br/>Trace your code.<br/>Try your own fix.</p><small>Drafts persist on this device</small></div>{menu && <div ref={menuRef} className="context-menu" role="menu" aria-label="Explorer actions" style={{ left: menu.x, top: menu.y }} onKeyDown={event => { const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") || []); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus(); } }}>
    {menu.node?.kind === "file" && <button role="menuitem" onClick={() => { props.onOpen(menu.node!.id); setMenu(null); }}>Open</button>}{(["file", "folder"] as const).map(kind => <button role="menuitem" key={kind} onClick={() => startCreate(parent, kind)}>New {kind}</button>)}{menu.node?.kind === "folder" && <button role="menuitem" onClick={() => { props.onToggle(menu.node!.id); setMenu(null); }}>{props.closedIds.includes(menu.node.id) ? "Expand" : "Collapse"} folder</button>}{menu.node && <><button role="menuitem" className="menu-separator" onClick={() => startRename(menu.node!)}>Rename</button><button role="menuitem" onClick={() => { setEditing(null); setDeleteId(menu.node!.id); setMenu(null); }}>Delete</button></>}</div>}{deletion && <DeleteDialog node={deletion} files={props.files} onDelete={props.onDelete} onCancel={() => setDeleteId("")}/>}</aside>;
});
export default Explorer;
