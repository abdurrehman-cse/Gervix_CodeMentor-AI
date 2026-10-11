import type { editor } from "monaco-editor";

export type CodeSelection = { text: string; startLine: number; endLine: number; startColumn: number; endColumn: number };
export const emptySelection: CodeSelection = { text: "", startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 };
export function readEditorSelection(instance: editor.IStandaloneCodeEditor | null): { selection: CodeSelection; line: number } {
  const model = instance?.getModel();
  const range = instance?.getSelection();
  if (!model || !range) return { selection: emptySelection, line: 1 };
  return { selection: { text: model.getValueInRange(range), startLine: range.startLineNumber, endLine: range.endLineNumber, startColumn: range.startColumn, endColumn: range.endColumn }, line: range.positionLineNumber };
}
