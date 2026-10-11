"use client";

const actions = [{ id: "explain", label: "Explain" }, { id: "analyze", label: "Find Bug" }, { id: "hint", label: "Give Hint" }, { id: "complexity", label: "Analyze Complexity" }, { id: "tests", label: "Generate Tests" }, { id: "chat", label: "Ask Mentor" }, { id: "optimize", label: "Optimize" }];
type Props = { selection: { text: string; startLine: number; endLine: number }; disabled: boolean; onAction: (action: string) => void };
export default function SelectionToolbar({ selection, disabled, onAction }: Props) {
  return <div className="selection-actions selection-toolbar" role="toolbar" aria-label="Selected code actions"><small>{selection.text ? `Lines ${selection.startLine}–${selection.endLine}` : "Select code for guidance"}</small>{actions.map(action => <button key={action.id} disabled={disabled || !selection.text} onMouseDown={event => { if (event.button === 0) event.preventDefault(); }} onClick={() => onAction(action.id)}>{action.label}</button>)}</div>;
}
