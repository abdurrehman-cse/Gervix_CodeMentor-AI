"use client";
import { useEffect, useRef } from "react";

type Props = { kind: "file" | "folder"; renaming: boolean; value: string; error: string; depth: number; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void; onBlurCancel: () => void };
export default function InlineNameInput(props: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const extension = props.kind === "file" ? props.value.lastIndexOf(".") : -1;
    input.current?.setSelectionRange(0, extension > 0 ? extension : props.value.length);
  }, []);
  const label = props.renaming ? `Rename ${props.kind}` : `New ${props.kind} name`;
  return <div className="tree-inline" style={{ paddingLeft: 8 + props.depth * 14, minWidth: 160 + props.depth * 14 }}>
    <div className="tree-inline-field"><span aria-hidden="true">{props.kind === "folder" ? "▾" : "◇"}</span><input ref={input} aria-label={label} aria-invalid={!!props.error} aria-describedby={props.error ? "explorer-name-error" : "explorer-name-help"} value={props.value} placeholder={props.kind === "file" ? "filename.ts" : "folder"} spellCheck={false} onChange={event => props.onChange(event.target.value)} onKeyDown={event => { event.stopPropagation(); if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); props.onSubmit(); } if (event.key === "Escape") { event.preventDefault(); props.onCancel(); } }} onBlur={() => { if (!props.error) props.onBlurCancel(); }}/></div>
    {props.error ? <p id="explorer-name-error" className="tree-inline-error" role="alert">{props.error}</p> : <small id="explorer-name-help">{props.renaming ? "Enter to rename · Esc to cancel" : "Enter to create · / creates nested folders"}</small>}
  </div>;
}
