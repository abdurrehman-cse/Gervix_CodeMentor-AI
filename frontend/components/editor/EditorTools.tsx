"use client";
import { useEffect, useRef, useState } from "react";

const tools = [{ id: "actions.find", name: "Find", shortcut: "Ctrl/Cmd+F" }, { id: "editor.action.startFindReplaceAction", name: "Replace", shortcut: "Ctrl/Cmd+H" }, { id: "editor.action.gotoLine", name: "Go to Line", shortcut: "Ctrl/Cmd+G" }, { id: "editor.action.formatDocument", name: "Format Document", shortcut: "Shift+Alt+F" }, { id: "editor.action.quickCommand", name: "Command Palette", shortcut: "F1 / Ctrl/Cmd+Shift+P" }, { id: "editor.action.marker.nextInFiles", name: "Next Problem", shortcut: "F8" }, { id: "editor.action.marker.prevInFiles", name: "Previous Problem", shortcut: "Shift+F8" }];
type Props = { disabled: boolean; onCommand: (command: string) => void };
export default function EditorTools({ disabled, onCommand }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div className="editor-tools" ref={container}><button ref={trigger} disabled={disabled} aria-label="Editor actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Editor ▾</button>{open && <div className="editor-tools-menu" role="menu" aria-label="Editor commands" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = Array.from(container.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") || []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const target = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length;
      buttons[target]?.focus();
    }
  }}>{tools.map(tool => <button key={tool.id} role="menuitem" onClick={() => { setOpen(false); onCommand(tool.id); }}><span>{tool.name}</span><small>{tool.shortcut}</small></button>)}</div>}</div>;
}
