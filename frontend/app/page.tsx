"use client";
import { useEffect, useRef, useState } from "react";
import "./workspace.css";
import type { editor } from "monaco-editor";
import Explorer, { type ExplorerHandle } from "../components/explorer/Explorer";
import CodeEditor from "../components/editor/CodeEditor";
import SelectionToolbar from "../components/editor/SelectionToolbar";
import EditorTools from "../components/editor/EditorTools";
import "../components/editor/editor.css";
import { emptySelection, readEditorSelection } from "../lib/editor-selection";
import BottomPanel, { type PanelTab } from "../components/editor/BottomPanel";
import MentorPanel from "../components/mentor/MentorPanel";
import { useWorkspace } from "../lib/use-workspace";
import { ExecutionError, runCode } from "../lib/runner";
import { language, workspaceSignature } from "../lib/workspace";
import type { AIAnalysis, ChatMessage, Level, MentorContext, Problem, TestResult } from "../lib/types";
type FileSession = { code: string; path: string; analysis: AIAnalysis; results: TestResult[]; output: string[]; analysisSnapshot?: string };
export default function Home() {
  const workspace = useWorkspace();
  const explorerRef = useRef<ExplorerHandle>(null);
  function createFile() { workspace.setCollapsed(false); setSearch(false); explorerRef.current?.create("", "file"); }
  const { active } = workspace;
  const [level, setLevel] = useState<Level | null>(null);
  const [mode, setMode] = useState<"learning" | "direct">("learning");
  const [sessions, setSessions] = useState<Record<string, FileSession>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState(false);
  const [tab, setTab] = useState<PanelTab>("Problems");
  const [selection, setSelection] = useState(emptySelection);
  const [line, setLine] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [hintCounts, setHintCounts] = useState<Record<string, number>>({});
  const [solution, setSolution] = useState(false);
  const [fix, setFix] = useState<Problem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const busyRef = useRef(false);
  const pendingJump = useRef<Problem | null>(null);
  const latestFiles = useRef(workspace.files); latestFiles.current = workspace.files;
  const session = active ? sessions[active.id] : undefined;
  const fresh = session?.code === active?.content && session?.path === active?.path;
  const signature = workspaceSignature(workspace.files);
  const analysis = session ? fresh && session.analysisSnapshot === signature ? session.analysis : { ...session.analysis, problems: [], complexity: null, explanation: "Workspace changed. Analyze again to refresh diagnostics and complexity. Existing test expectations are retained; rerun them.", tests: session.analysis.tests } : null;
  const problem = analysis?.problems.find(item => item.id === selectedId) || analysis?.problems[0] || null;
  const hintKey = `${active?.id}:${active?.content}:${problem?.id}`;
  const hintCount = hintCounts[hintKey] || 0;
  const results = fresh ? session?.results || [] : [];
  const supported = !!active && ["javascript", "typescript"].includes(language(active.path));
  useEffect(() => {
    try { const saved = localStorage.getItem("codementor-level"); if (["beginner", "intermediate", "advanced"].includes(saved || "")) setLevel(saved as Level); const savedMode = localStorage.getItem("codementor-mode"); if (savedMode === "direct") setMode("direct"); } catch {}
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => { revision.current++; abortRef.current?.abort(); setSelectedId(""); setSolution(false); setFix(null); setError(""); const target = pendingJump.current; if (target && target.file === active?.path) { const timer = setTimeout(() => { jump(target.line, target.column); setSelectedId(target.id); pendingJump.current = null; }, 100); return () => clearTimeout(timer); } }, [active?.id, active?.path]);
  useEffect(() => { setSessions(current => { const retained = Object.fromEntries(Object.entries(current).filter(([id]) => workspace.files.some(file => file.id === id))); return Object.keys(retained).length === Object.keys(current).length ? current : retained; }); }, [workspace.files]);
  function choose(value: Level) { setLevel(value); try { localStorage.setItem("codementor-level", value); } catch {} }
  function jump(targetLine: number, column = 1) { const instance = editorRef.current; instance?.revealLineInCenter(targetLine); instance?.setPosition({ lineNumber: targetLine, column }); instance?.focus(); }
  function viewProblem(item: Problem) {
    const file = workspace.files.find(file => file.path === item.file);
    if (!file) return;
    if (file.id !== active?.id) {
      pendingJump.current = item;
      const related = analysis?.problems.filter(problem => problem.file === file.path) || [item];
      setSessions(current => ({ ...current, [file.id]: { code: file.content, path: file.path, analysisSnapshot: signature, analysis: { problems: [item, ...related.filter(problem => problem.id !== item.id)], complexity: null, tests: current[file.id]?.analysis.tests || [], explanation: `Problem in ${file.path}. Trace the highlighted range and review the hints.`, provider: analysis?.provider || "Workspace diagnostic" }, results: [], output: [] } }));
      workspace.open(file.id);
    }
    else jump(item.line, item.column);
    setSelectedId(item.id); setSolution(false); setTab("Problems");
  }
  function edit(code: string) { if (!workspace.edit(code)) return; revision.current++; abortRef.current?.abort(); setFix(null); setSolution(false); }
  function context(action: string, question: string): MentorContext {
    const current = readEditorSelection(editorRef.current);
    return { action, question, files: workspace.files.map(({ path, kind, content }) => ({ path, kind, content })), activeFile: active!.path, selection: current.selection, line: current.line, diagnostics: analysis?.problems || [], previousDiagnostics: session?.analysis.problems || [], output: fresh ? session?.output || [] : [], hintsUsed: { problemId: problem?.id || "", count: hintCount }, tests: analysis?.tests || [], results, complexity: analysis?.complexity || null, messages: messages.slice(-16), level: level || "beginner", mode };
  }
  async function ask(action: string, question = "") {
    if (!active || busyRef.current || !supported) return;
    busyRef.current = true; setBusy(action); setError("");
    const requestRevision = revision.current;
    const snapshot = signature;
    const controller = new AbortController(); abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55000);
    if (question) setMessages(current => [...current, { role: "user", content: question }]);
    try {
      const response = await fetch("/api/mentor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context(action, question)), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed. Your code is safe; try again.");
      if (requestRevision !== revision.current || snapshot !== workspaceSignature(latestFiles.current)) return;
      const incoming = data as AIAnalysis;
      const merged: AIAnalysis = action === "chat" || action === "explain" || action === "optimize" || action === "hint" ? { ...(analysis || incoming), explanation: incoming.explanation, provider: incoming.provider } : action === "complexity" && analysis ? { ...analysis, complexity: incoming.complexity, explanation: incoming.explanation, provider: incoming.provider } : action === "tests" && analysis ? { ...analysis, tests: incoming.tests, explanation: incoming.explanation, provider: incoming.provider } : { ...incoming, tests: incoming.tests.length ? incoming.tests : analysis?.tests || [] };
      setSessions(current => ({ ...current, [active.id]: { code: active.content, path: active.path, analysisSnapshot: snapshot, analysis: merged, results: action === "tests" || incoming.tests.length > 0 && action === "analyze" ? [] : results, output: session?.output || [] } }));
      if (["chat", "explain", "optimize", "hint"].includes(action)) setMessages(current => [...current, { role: "assistant", content: incoming.explanation }]);
      if (action === "complexity") setTab("Complexity");
      if (action === "tests") setTab("Tests");
      if (action === "analyze") { setTab("Problems"); setSelectedId(incoming.problems[0]?.id || ""); setSolution(false); }
    } catch (caught) { if (requestRevision === revision.current) setError(caught instanceof Error && caught.name === "AbortError" ? "Analysis stopped or timed out. Your code is safe; try again." : caught instanceof Error ? caught.message : "Analysis failed. Please try again."); }
    finally { clearTimeout(timeout); busyRef.current = false; setBusy(""); }
  }
  function hint(item = problem) {
    if (!item) { void ask("hint", "Give me a gentle hint about the selected code or current file without revealing the solution."); return; }
    setSelectedId(item.id);
    const key = `${active?.id}:${active?.content}:${item.id}`;
    setHintCounts(current => ({ ...current, [key]: Math.min((current[key] || 0) + 1, item.hints.length) }));
  }
  function editorAction(action: string, item?: Problem) {
    if (action === "view" && item) viewProblem(item);
    else if (action === "fix" && item) setFix(item);
    else if (action === "hint") { if (readEditorSelection(editorRef.current).selection.text && !item) void ask("hint", "Give me the next progressive hint about the selected code."); else hint(item); }
    else if (action === "run") void run();
    else if (action === "chat") { document.querySelector<HTMLTextAreaElement>(".mentor-chat textarea")?.focus(); }
    else void ask(action, action === "explain" ? "Explain the selected code step by step." : action === "optimize" ? "Explain how to improve this code's efficiency and the tradeoffs. Teach me before suggesting changes." : "");
  }
  async function editorCommand(command: string) {
    const instance = editorRef.current;
    const action = instance?.getAction(command);
    if (!instance || !action || !action.isSupported()) { setError("This editor command is not available for the current file."); return; }
    instance.focus();
    try { await action.run(); } catch { setError("The editor command could not complete. Your code is safe; try again."); }
  }
  function applyFix() {
    const model = editorRef.current?.getModel();
    if (!fix?.quickFix || !model || active?.path !== fix.file) { setError("Open the diagnostic's file before applying its fix."); setFix(null); return; }
    const range = { startLineNumber: fix.line, startColumn: fix.column, endLineNumber: fix.endLine, endColumn: fix.endColumn };
    if (model.getValueInRange(range) !== fix.quickFix.oldCode) { setError("This code changed. Analyze again before applying the fix."); setFix(null); return; }
    editorRef.current?.pushUndoStop();
    editorRef.current?.executeEdits("codementor.fix", [{ range, text: fix.quickFix.newCode, forceMoveMarkers: true }]);
    editorRef.current?.pushUndoStop(); setFix(null);
  }
  async function run(tests = false) {
    if (!active || busyRef.current) return;
    busyRef.current = true; setBusy(tests ? "tests" : "run"); setError(""); setTab(tests ? "Tests" : "Output");
    const requestRevision = revision.current;
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const result = await runCode(active.content, active.path, tests ? analysis?.tests || [] : [], controller.signal);
      if (requestRevision !== revision.current) return;
      setSessions(current => ({ ...current, [active.id]: { code: active.content, path: active.path, analysisSnapshot: session?.analysisSnapshot || signature, analysis: analysis || { problems: [], complexity: null, tests: [], explanation: "Execution completed. Analyze to investigate the behavior.", provider: "Isolated browser runner" }, results: tests ? result.results : results, output: result.output.length ? result.output : ["Execution completed with no console output."] } }));
    } catch (caught) { if (requestRevision === revision.current) { const message = caught instanceof Error ? caught.message : "Execution failed."; setError(message); if (!tests) setSessions(current => ({ ...current, [active.id]: { code: active.content, path: active.path, analysisSnapshot: session?.analysisSnapshot || signature, analysis: analysis || { problems: [], complexity: null, tests: [], explanation: "Execution failed. Review the output and analyze the code.", provider: "Isolated browser runner" }, results: [], output: [...(caught instanceof ExecutionError ? caught.output : []), `Runtime: ${message}`] } })); } }
    finally { busyRef.current = false; setBusy(""); }
  }
  return <main><header><strong><span className="logo">〈/〉</span> CodeMentor <em>AI</em></strong><span className="muted">Your thinking. A little guidance.</span><button className="mode-button" onClick={() => { const next = mode === "learning" ? "direct" : "learning"; setMode(next); try { localStorage.setItem("codementor-mode", next); } catch {} }}>{mode === "learning" ? "Learning mode" : "Direct mode"}</button><button onClick={() => setLevel(null)}>{level || "Choose level"} ⚙</button></header>
    <div className={`workspace ${workspace.collapsed ? "sidebar-collapsed" : ""}`}><nav className="activity" aria-label="Workspace tools"><button title="Toggle Explorer" aria-label="Toggle Explorer" aria-expanded={!workspace.collapsed} onClick={() => { workspace.setCollapsed(!workspace.collapsed); setSearch(false); }}>▤</button><button title="Search workspace" aria-label="Search workspace" onClick={() => { workspace.setCollapsed(false); setSearch(true); }}>⌕</button><button title="Problems" aria-label="Problems" onClick={() => setTab("Problems")}>⚑</button><button title="Tests" aria-label="Tests" onClick={() => setTab("Tests")}>✓</button></nav><div className="explorer-slot" aria-hidden={workspace.collapsed} inert={workspace.collapsed}><Explorer ref={explorerRef} files={workspace.files} activeId={workspace.activeId} selectedId={workspace.selectedId} closedIds={workspace.closedIds} ready={workspace.ready} onSelect={workspace.select} onToggle={workspace.toggleFolder} onOpen={workspace.open} onCreate={workspace.create} onRename={workspace.rename} onDelete={workspace.remove} search={search}/></div>
    <section className="editor"><div className="tabs file-tabs" role="tablist" aria-label="Open files">{workspace.tabs.map(id => { const file = workspace.files.find(item => item.id === id); return file ? <div className={`file-tab ${id === workspace.activeId ? "selected" : ""}`} key={id}><button role="tab" aria-selected={id === workspace.activeId} onClick={() => workspace.open(id)}>{file.path.split("/").at(-1)}{file.content !== file.saved ? " •" : ""}</button><button aria-label={`Close ${file.path}`} onClick={() => workspace.close(id)}>×</button></div> : null; })}</div><div className="breadcrumb"><span>workspace / {active?.path || "No file open"}</span><div className="inline-actions"><EditorTools disabled={!active} onCommand={command => void editorCommand(command)}/><button disabled={!active} onClick={workspace.save} title="Ctrl/Cmd+S">Save</button><button disabled={!active} onClick={workspace.download}>Download</button><button disabled={!supported || !!busy} onClick={() => void run()}>▷ Run</button></div></div><SelectionToolbar selection={selection} disabled={!!busy || !supported} onAction={editorAction}/><div className="editor-surface">{workspace.ready && active ? <CodeEditor file={active} problems={analysis?.problems || []} onChange={edit} onSelection={(next, currentLine) => { setSelection(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); setLine(currentLine); }} onAction={editorAction} onSave={workspace.save} onMount={instance => { editorRef.current = instance; }}/> : <div className="empty"><h3>{workspace.ready ? "Open a file to start learning." : "Restoring workspace…"}</h3><button onClick={createFile}>New File</button></div>}</div><BottomPanel tab={tab} onTab={setTab} analysis={analysis} output={fresh ? session?.output || [] : []} results={results} onProblem={viewProblem} onLine={jump} onRunTests={() => void run(true)} onGenerate={() => void ask("tests")} busy={!!busy || !supported}/></section>
    <MentorPanel analysis={analysis} problem={problem} busy={busy} error={error || workspace.storageError} hintCount={hintCount} messages={messages} onAction={(action, question) => void ask(action, question)} onProblem={viewProblem} onHint={() => hint()} onFix={() => setFix(problem)} onSolution={() => setSolution(true)} onCancel={() => abortRef.current?.abort()} canAnalyze={supported && !!level && !!active?.content.trim()} showSolution={solution}/></div><footer>✓ Local workspace <span>{active ? language(active.path) : "No file"} &nbsp; Ln {line} &nbsp; UTF-8 &nbsp; {mode === "learning" ? "Learning mode" : "Direct mode"}</span></footer>
    {fix?.quickFix && <div className="overlay" onKeyDown={event => { if (event.key === "Escape") setFix(null); }}><section className="onboarding fix-dialog" role="dialog" aria-modal="true" aria-labelledby="fix-title"><h2 id="fix-title">Preview Quick Fix</h2><p>{fix.file} · Line {fix.line}. Only this range will change.</p><pre className="diff removed">− {fix.quickFix.oldCode}</pre><pre className="diff added">+ {fix.quickFix.newCode}</pre><div className="inline-actions"><button autoFocus className="primary" onClick={applyFix}>Apply Fix</button><button onClick={() => setFix(null)}>Cancel</button></div></section></div>}
    {workspace.ready && !level && <div className="overlay"><section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="welcome"><span className="eyebrow">WELCOME TO CODEMENTOR</span><h2 id="welcome">Where are you on your coding journey?</h2><p>Choose how much guidance you want. You can change this anytime.</p>{(["beginner", "intermediate", "advanced"] as Level[]).map((value, index) => <button autoFocus={index === 0} key={value} onClick={() => choose(value)}><strong>{["Beginner", "Intermediate", "Advanced"][index]}</strong><span>{["Explain concepts step by step with gentle hints.", "Keep explanations short and let me work out the fix.", "Give me the diagnostic and a minimal clue."][index]}</span></button>)}<small>Your workspace and learning preference stay on this device.</small></section></div>}
  </main>;
}
