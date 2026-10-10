"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FileNode } from "../../lib/types";
import { descendants, type OperationResult } from "../../lib/workspace-operations";

type Props = { node: FileNode; files: FileNode[]; onDelete: (id: string) => OperationResult; onCancel: () => void };
export default function DeleteDialog({ node, files, onDelete, onCancel }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const deleting = useRef(false);
  const [error, setError] = useState("");
  const affected = descendants(files, node);
  const unsaved = affected.filter(file => file.kind === "file" && file.content !== file.saved).length;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); else document.querySelector<HTMLButtonElement>(".explorer-heading button")?.focus(); };
  }, []);
  return createPortal(<div className="overlay explorer-delete-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    if (event.key === "Tab") {
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0];
      if (document.activeElement === (event.shiftKey ? buttons[0] : buttons[buttons.length - 1])) { event.preventDefault(); target.focus(); }
    }
  }}><section ref={dialog} className="explorer-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><h2 id="delete-title">Delete {node.kind}?</h2><p id="delete-description">Delete <strong>{node.path}</strong>{node.kind === "folder" && affected.length > 1 ? ` and all ${affected.length - 1} items inside it` : ""}? This cannot be undone.</p>{unsaved > 0 && <p className="delete-warning" role="alert">{unsaved} {unsaved === 1 ? "file has" : "files have"} unsaved changes. Deleting will permanently discard these edits.</p>}{error && <p role="alert">{error}</p>}<div className="inline-actions"><button onClick={onCancel}>Cancel</button><button className="delete-confirm" onClick={() => { if (deleting.current) return; deleting.current = true; const result = onDelete(node.id); if (result.ok) onCancel(); else { setError(result.error); deleting.current = false; } }}>Delete</button></div></section></div>, document.body);
}
