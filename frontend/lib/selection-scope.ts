import type ts from "typescript";
import type { MentorContext } from "./types";

export function selectionContainsRange(source: ts.SourceFile, selection: MentorContext["selection"], startOffset: number, endOffset: number) {
  if (!selection.text) return true;
  const start = source.getLineAndCharacterOfPosition(startOffset);
  const end = source.getLineAndCharacterOfPosition(endOffset);
  return start.line + 1 >= selection.startLine && end.line + 1 <= selection.endLine && (start.line + 1 !== selection.startLine || selection.startColumn === undefined || start.character + 1 >= selection.startColumn) && (end.line + 1 !== selection.endLine || selection.endColumn === undefined || end.character + 1 <= selection.endColumn);
}
export function selectionContainsNode(source: ts.SourceFile, selection: MentorContext["selection"], node: ts.Node) { return selectionContainsRange(source, selection, node.getStart(source), node.getEnd()); }
export function selectionIntersectsNode(source: ts.SourceFile, selection: MentorContext["selection"], node: ts.Node) {
  if (!selection.text) return true;
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.getEnd());
  return !(start.line + 1 > selection.endLine || start.line + 1 === selection.endLine && start.character + 1 >= (selection.endColumn ?? Infinity) || end.line + 1 < selection.startLine || end.line + 1 === selection.startLine && end.character + 1 <= (selection.startColumn ?? 1));
}
