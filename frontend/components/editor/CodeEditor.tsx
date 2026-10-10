"use client";
import dynamic from "next/dynamic";
import { loader } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import type { editor, IDisposable, Position, Range } from "monaco-editor";
import type { FileNode, Problem } from "../../lib/types";
import { language } from "../../lib/workspace";
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
loader.config({ paths: { vs: "/monaco/vs" } });
type Props = { file: FileNode; problems: Problem[]; onChange: (code: string) => void; onSelection: (text: string, startLine: number, endLine: number, line: number) => void; onAction: (action: string, problem?: Problem) => void; onSave: () => void; onMount: (instance: editor.IStandaloneCodeEditor) => void };
export default function CodeEditor(props: Props) {
  const latest = useRef(props); latest.current = props;
  const instanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const disposables = useRef<IDisposable[]>([]);
  function markers() {
    const monaco = monacoRef.current, model = instanceRef.current?.getModel();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, "codementor", latest.current.problems.filter(problem => problem.file === latest.current.file.path).map(problem => ({ startLineNumber: problem.line, startColumn: problem.column, endLineNumber: problem.endLine, endColumn: problem.endColumn, message: `${problem.title}\n${problem.description}\n${problem.question}`, severity: problem.severity === "error" ? monaco.MarkerSeverity.Error : problem.severity === "warning" ? monaco.MarkerSeverity.Warning : problem.severity === "info" ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Hint })));
  }
  useEffect(markers, [props.problems, props.file.path]);
  useEffect(() => () => { disposables.current.forEach(item => item.dispose()); }, []);
  return <Editor path={`file:///codementor/${props.file.id}`} language={language(props.file.path)} value={props.file.content} theme="vs-dark" loading={<p>Loading editor…</p>} onChange={value => props.onChange(value || "")} onMount={(instance, monaco) => {
    instanceRef.current = instance; monacoRef.current = monaco; latest.current.onMount(instance);
    disposables.current.push(instance.onDidChangeModel(markers));
    disposables.current.push(instance.onDidChangeCursorSelection(event => { const model = instance.getModel(); latest.current.onSelection(model?.getValueInRange(event.selection) || "", event.selection.startLineNumber, event.selection.endLineNumber, event.selection.positionLineNumber); }));
    disposables.current.push(instance.addAction({ id: "codementor.save", label: "Save file", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => latest.current.onSave() }));
    disposables.current.push(instance.addAction({ id: "codementor.analyze-file", label: "Mentor: Analyze file", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: () => latest.current.onAction("analyze") }));
    disposables.current.push(instance.addAction({ id: "codementor.run-file", label: "Run current file", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter], run: () => latest.current.onAction("run") }));
    const commands = ["codementor.problem.view", "codementor.problem.hint", "codementor.problem.fix"];
    for (const [index, action] of ["view", "hint", "fix"].entries()) disposables.current.push(monaco.editor.registerCommand(commands[index], (_accessor: unknown, problemId?: string) => { const problem = latest.current.problems.find(item => item.id === problemId); if (problem) latest.current.onAction(action, problem); }));
    for (const [index, action] of ["explain", "analyze", "hint", "complexity", "tests", "optimize", "chat"].entries()) disposables.current.push(instance.addAction({ id: `codementor.${action}`, label: `Mentor: ${action === "analyze" ? "Find Bug" : action === "chat" ? "Ask Mentor" : action}`, contextMenuGroupId: "mentor", contextMenuOrder: index, precondition: "editorHasSelection", run: () => latest.current.onAction(action) }));
    for (const languageId of ["javascript", "typescript"]) disposables.current.push(monaco.languages.registerHoverProvider(languageId, { provideHover(model: editor.ITextModel, position: Position) {
      if (model !== instance.getModel()) return null;
      const problem = latest.current.problems.find(item => item.file === latest.current.file.path && position.lineNumber >= item.line && position.lineNumber <= item.endLine && (position.lineNumber !== item.line || position.column >= item.column) && (position.lineNumber !== item.endLine || position.column <= item.endColumn));
      if (!problem) return null;
      const escape = (text: string) => text.replace(/[\\`*_{}\[\]<>]/g, "\\$&");
      const argument = encodeURIComponent(JSON.stringify([problem.id]));
      return { range: new monaco.Range(problem.line, problem.column, problem.endLine, problem.endColumn), contents: [{ isTrusted: { enabledCommands: commands }, value: `**${escape(problem.title)}**\n\n${escape(problem.description)}\n\n${escape(problem.question)}\n\n[View Problem](command:${commands[0]}?${argument}) · [Hint](command:${commands[1]}?${argument})${problem.quickFix ? ` · [Quick Fix](command:${commands[2]}?${argument})` : ""}` }] };
    } }));
    for (const languageId of ["javascript", "typescript"]) disposables.current.push(monaco.languages.registerCodeActionProvider(languageId, { providedCodeActionKinds: ["quickfix"], provideCodeActions(model: editor.ITextModel, range: Range) {
      if (model !== instance.getModel()) return { actions: [], dispose() {} };
      return { actions: latest.current.problems.filter(problem => problem.file === latest.current.file.path && problem.quickFix && range.startLineNumber <= problem.endLine && range.endLineNumber >= problem.line).map(problem => ({ title: `Preview mentor fix: ${problem.title}`, kind: "quickfix", command: { id: commands[2], title: "Preview Quick Fix", arguments: [problem.id] } })), dispose() {} };
    } }));
    markers();
  }} options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, folding: true, bracketPairColorization: { enabled: true }, quickSuggestions: true, wordWrap: "off" }} />;
}
