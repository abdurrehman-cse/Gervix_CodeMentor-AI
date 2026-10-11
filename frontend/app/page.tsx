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
import ReviewStatus from "../components/versions/ReviewStatus";
import VersionHistory from "../components/versions/VersionHistory";
import { useVersions } from "../lib/versions/use-versions";
import { attachProvenance, provenanceFor, provenanceMatches, sameProvenance, type Submission } from "../lib/versions/snapshots";
import { relevantPaths } from "../lib/versions/dependencies";
import { validateAnalysis } from "../lib/ai-validation";
import { canApplySnapshotFix, resultIsCurrent } from "../lib/versions/guards";
import type { AIAnalysis, ChatMessage, Level, MentorContext, Problem, TestResult } from "../lib/types";
type FileSession = { code: string; path: string; analysis: AIAnalysis; results: TestResult[]; output: string[]; analysisSnapshot?: string };
export default function Home() {
  const workspace = useWorkspace();
  const versions = useVersions();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<Submission>();
  const requestSequence = useRef(0);
  const restoredReviews = useRef(false);
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
  const sourceSubmission = versions.history.find(item => item.id === session?.analysis.provenance?.submissionId);
  const fresh = provenanceMatches(session?.analysis.provenance, sourceSubmission, workspace.files);
  const signature = workspaceSignature(workspace.files);
  const analysis = session && session.analysis.provider !== "Isolated browser runner" ? fresh ? session.analysis : { ...session.analysis, problems: [], complexity: null, explanation: "Code changed · Analysis outdated. Reanalyze Latest Code before using diagnostics, hints or fixes. Generated tests below belong to the displayed older submission and are not verified against your working draft.", tests: session.analysis.tests } : null;
  const problem = analysis?.problems.find(item => item.id === selectedId) || analysis?.problems[0] || null;
  const hintKey = `${active?.id}:${active?.content}:${problem?.id}`;
  const hintCount = hintCounts[hintKey] || 0;
  const results = fresh ? (session?.results || []).filter(result => sameProvenance(result.provenance, session?.analysis.provenance)) : [];
  const supported = !!active && ["javascript", "typescript"].includes(language(active.path));
  useEffect(() => {
    try { const saved = localStorage.getItem("codementor-level"); if (["beginner", "intermediate", "advanced"].includes(saved || "")) setLevel(saved as Level); const savedMode = localStorage.getItem("codementor-mode"); if (savedMode === "direct") setMode("direct"); } catch {}
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => { revision.current++; abortRef.current?.abort(); setSelectedId(""); setSolution(false); setFix(null); setError(""); const target = pendingJump.current; if (target && target.file === active?.path) { const timer = setTimeout(() => { jump(target.line, target.column); setSelectedId(target.id); pendingJump.current = null; }, 100); return () => clearTimeout(timer); } }, [active?.id, active?.path]);
  useEffect(() => { setSessions(current => { const retained = Object.fromEntries(Object.entries(current).filter(([id]) => workspace.files.some(file => file.id === id))); return Object.keys(retained).length === Object.keys(current).length ? current : retained; }); }, [workspace.files]);
  useEffect(() => {
    if (!workspace.ready || !versions.ready || restoredReviews.current) return;
    restoredReviews.current = true;
    const restored: Record<string, FileSession> = {};
    for (const submission of versions.history) for (const review of submission.reviews) {
      const file = workspace.files.find(item => item.kind === "file" && item.path === review.activeFile);
      const submittedFile = submission.files.find(item => item.path === review.activeFile);
      if (file && submittedFile && review.analysis && ["complete", "outdated"].includes(review.status)) restored[file.id] = { code: submittedFile.content, path: submittedFile.path, analysis: review.analysis, results: review.results || [], output: [] };
    }
    setSessions(restored);
  }, [workspace.ready, versions.ready, versions.history, workspace.files]);
  function choose(value: Level) { setLevel(value); try { localStorage.setItem("codementor-level", value); } catch {} }
  function jump(targetLine: number, column = 1) { const instance = editorRef.current; instance?.revealLineInCenter(targetLine); instance?.setPosition({ lineNumber: targetLine, column }); instance?.focus(); }
  function viewProblem(item: Problem) {
    const file = workspace.files.find(file => file.path === item.file);
    if (!file) return;
    if (file.id !== active?.id) {
      pendingJump.current = item;
      const related = analysis?.problems.filter(problem => problem.file === file.path) || [item];
      setSessions(current => ({ ...current, [file.id]: { code: file.content, path: file.path, analysisSnapshot: signature, analysis: { problems: [item, ...related.filter(problem => problem.id !== item.id)], complexity: null, tests: [], explanation: `Problem in ${file.path}. Trace the highlighted range and review the hints.`, provider: analysis?.provider || "Workspace diagnostic", provenance: analysis?.provenance }, results: [], output: [] } }));
      workspace.open(file.id);
    }
    else jump(item.line, item.column);
    setSelectedId(item.id); setSolution(false); setTab("Problems");
  }
  function edit(code: string) { if (!workspace.edit(code)) return; revision.current++; abortRef.current?.abort(); setFix(null); setSolution(false); }
  function context(action: string, question: string, submission: Submission, current = readEditorSelection(editorRef.current)): MentorContext {
    const paths = relevantPaths(submission.files, active!.path, question);
    const provenance = provenanceFor(submission, paths, active!.path);
    const validPrevious = fresh && sameProvenance(analysis?.provenance, provenance);
    return { action, question, files: submission.files.filter(file => file.kind === "folder" || paths.includes(file.path)).map(({ path, kind, content }) => ({ path, kind, content })), activeFile: active!.path, provenance, selection: current.selection, line: current.line, diagnostics: validPrevious ? analysis?.problems || [] : [], previousDiagnostics: validPrevious ? analysis?.problems || [] : [], output: fresh ? session?.output || [] : [], hintsUsed: { problemId: validPrevious ? problem?.id || "" : "", count: validPrevious ? hintCount : 0 }, tests: validPrevious ? analysis?.tests || [] : [], results: validPrevious ? results : [], complexity: validPrevious ? analysis?.complexity || null : null, messages: messages.filter(message => sameProvenance(message.provenance, provenance)).slice(-16), level: level || "beginner", mode };
  }
  async function ask(action: string, question = "", force = false, supersede = false) {
    if (!active || busyRef.current && !supersede || !supported || !versions.ready) return;
    abortRef.current?.abort();
    const requestId = ++requestSequence.current;
    const recordId = crypto.randomUUID();
    const selectedCode = readEditorSelection(editorRef.current);
    busyRef.current = true; setBusy(action); setError("");
    const requestRevision = revision.current;
    const controller = new AbortController(); abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55000);
    let submission: Submission | undefined;
    let requestContext: MentorContext | undefined;
    try {
      const captured = workspace.getSnapshot();
      submission = await versions.capture(captured.files, active.path, "review", force);
      if (requestId !== requestSequence.current || controller.signal.aborted || requestRevision !== revision.current) return;
      setPendingSubmission(submission);
      requestContext = context(action, question, submission, selectedCode);
      versions.record(submission.id, { requestId: recordId, action, activeFile: active.path, status: "running" });
      if (question) setMessages(current => [...current, { role: "user", content: question, provenance: requestContext!.provenance }]);
      const response = await fetch("/api/mentor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestContext), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed. Your code is safe; try again.");
      if (!sameProvenance(data.provenance, requestContext.provenance)) throw new Error("Analysis version did not match the submitted code. Please reanalyze.");
      const incoming = attachProvenance({ ...validateAnalysis(data, requestContext), provider: data.provider === "AI provider" ? "AI provider" : "Local AST checks (limited, no AI configured)" }, requestContext.provenance!);
      const current = resultIsCurrent(incoming.provenance, submission, workspace.getSnapshot().files, requestId, requestSequence.current, requestRevision, revision.current, controller.signal.aborted);
      versions.record(submission.id, { requestId: recordId, action, activeFile: active.path, status: current ? "complete" : "outdated", analysis: incoming });
      if (!current) return;
      const base = fresh && sameProvenance(analysis?.provenance, incoming.provenance) ? analysis : null;
      const merged: AIAnalysis = ["chat", "explain", "optimize", "hint"].includes(action) ? { ...(base || incoming), explanation: incoming.explanation, provider: incoming.provider } : action === "complexity" && base ? { ...base, complexity: incoming.complexity, explanation: incoming.explanation, provider: incoming.provider } : action === "tests" && base ? { ...base, tests: incoming.tests, explanation: incoming.explanation, provider: incoming.provider } : incoming;
      setSessions(current => ({ ...current, [active.id]: { code: active.content, path: active.path, analysis: merged, results: action === "tests" || action === "analyze" ? [] : results, output: fresh ? session?.output || [] : [] } }));
      if (["chat", "explain", "optimize", "hint"].includes(action)) setMessages(current => [...current, { role: "assistant", content: incoming.explanation, provenance: incoming.provenance }]);
      if (action === "complexity") setTab("Complexity");
      if (action === "tests") setTab("Tests");
      if (action === "analyze") { setTab("Problems"); setSelectedId(incoming.problems[0]?.id || ""); setSolution(false); }
    } catch (caught) {
      const stopped = controller.signal.aborted;
      const message = stopped ? "Analysis stopped or timed out. Your code is safe; try again." : caught instanceof Error ? caught.message : "Analysis failed. Please try again.";
      if (submission) versions.record(submission.id, { requestId: recordId, action, activeFile: active.path, status: requestRevision !== revision.current || requestId !== requestSequence.current ? "outdated" : stopped ? "cancelled" : "failed", error: message });
      if (requestId === requestSequence.current && requestRevision === revision.current) setError(message);
    }
    finally { clearTimeout(timeout); if (requestId === requestSequence.current) { busyRef.current = false; setBusy(""); setPendingSubmission(undefined); } }
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
    const submitted = versions.get(fix.provenance?.submissionId || "");
    if (!canApplySnapshotFix(fix, submitted, workspace.getSnapshot().files, model.getValue())) { setError("This quick fix belongs to an outdated version. Reanalyze Latest Code before applying it."); setFix(null); return; }
    const range = { startLineNumber: fix.line, startColumn: fix.column, endLineNumber: fix.endLine, endColumn: fix.endColumn };
    if (model.getValueInRange(range) !== fix.quickFix.oldCode) { setError("This code changed. Analyze again before applying the fix."); setFix(null); return; }
    editorRef.current?.pushUndoStop();
    editorRef.current?.executeEdits("codementor.fix", [{ range, text: fix.quickFix.newCode, forceMoveMarkers: true }]);
    editorRef.current?.pushUndoStop(); setFix(null);
  }
  async function run(tests = false) {
    if (!active || busyRef.current) return;
    if (tests && (!fresh || !analysis?.tests.length || analysis.tests.some(test => !sameProvenance(test.provenance, analysis.provenance)))) { setError("These generated tests are outdated. Generate fresh tests or run the original submission from Version History."); return; }
    const requestId = ++requestSequence.current;
    busyRef.current = true; setBusy(tests ? "tests" : "run"); setError(""); setTab(tests ? "Tests" : "Output");
    const requestRevision = revision.current;
    const controller = new AbortController(); abortRef.current = controller;
    let runSubmission: Submission | undefined;
    try {
      const submission = tests ? sourceSubmission! : await versions.capture(workspace.getSnapshot().files, active.path);
      runSubmission = submission;
      const provenance = tests ? analysis!.provenance! : provenanceFor(submission, relevantPaths(submission.files, active.path), active.path);
      const file = submission.files.find(file => file.path === active.path && file.kind === "file");
      if (!file || controller.signal.aborted || requestId !== requestSequence.current || requestRevision !== revision.current) return;
      const result = await runCode(file.content, file.path, tests ? analysis!.tests : [], controller.signal);
      const actualResults = result.results.map(item => ({ ...item, provenance }));
      if (tests) versions.record(submission.id, { requestId: crypto.randomUUID(), action: "run tests", activeFile: file.path, status: "complete", analysis: analysis!, results: actualResults });
      if (requestId !== requestSequence.current || requestRevision !== revision.current || !provenanceMatches(provenance, submission, workspace.getSnapshot().files)) return;
      const executionAnalysis = fresh && analysis ? analysis : attachProvenance({ problems: [], complexity: null, tests: [], explanation: "Execution completed. Submit for Review to investigate the behavior.", provider: "Isolated browser runner" }, provenance);
      setSessions(current => ({ ...current, [active.id]: { code: file.content, path: file.path, analysis: executionAnalysis, results: tests ? actualResults : results, output: result.output.length ? result.output : ["Execution completed with no console output."] } }));
    } catch (caught) {
      if (requestId === requestSequence.current && requestRevision === revision.current) {
        const message = caught instanceof Error ? caught.message : "Execution failed.";
        setError(tests ? `Tests generated but unverified: ${message}` : message);
        if (tests && runSubmission && analysis) versions.record(runSubmission.id, { requestId: crypto.randomUUID(), action: "run tests", activeFile: active.path, status: controller.signal.aborted ? "cancelled" : "failed", analysis, error: message });
        if (!tests && runSubmission) {
          const provenance = provenanceFor(runSubmission, relevantPaths(runSubmission.files, active.path), active.path);
          const failedAnalysis = fresh && analysis ? analysis : attachProvenance({ problems: [], complexity: null, tests: [], explanation: "Execution failed. Review the output and submit your code.", provider: "Isolated browser runner" }, provenance);
          setSessions(current => ({ ...current, [active.id]: { code: active.content, path: active.path, analysis: failedAnalysis, results: [], output: [...(caught instanceof ExecutionError ? caught.output : []), `Runtime: ${message}`] } }));
        }
      }
    }
    finally { if (requestId === requestSequence.current) { busyRef.current = false; setBusy(""); } }
  }
  function saveFile() {
    workspace.save();
    const current = workspace.getSnapshot();
    const file = current.files.find(item => item.id === current.activeId);
    if (file && versions.ready) void versions.capture(current.files, file.path, "save").catch(caught => setError(caught instanceof Error ? caught.message : "The saved version could not be recorded."));
  }
  async function restoreVersion(submission: Submission) {
    abortRef.current?.abort(); requestSequence.current++; revision.current++; busyRef.current = false; setBusy("");
    const current = workspace.getSnapshot();
    await versions.capture(current.files, current.files.find(file => file.id === current.activeId)?.path || "", "restore-backup", true);
    const captured = workspaceSignature(current.files);
    if (captured !== workspaceSignature(workspace.getSnapshot().files)) throw new Error("Workspace changed during restore. Your backup is saved; try again.");
    await versions.capture(submission.files, submission.activeFile, "restore", true);
    workspace.replaceFiles(submission.files, submission.activeFile);
    setSessions({}); setMessages([]); setFix(null); setSelectedId("");
    setHistoryOpen(false);
  }
  async function runSubmittedTests(submission: Submission) {
    const review = [...submission.reviews].reverse().find(item => item.analysis?.tests.length);
    const submittedAnalysis = review?.analysis;
    const provenance = submittedAnalysis?.provenance;
    const file = submission.files.find(item => item.path === provenance?.activeFile && item.kind === "file");
    if (!file || !submittedAnalysis || !provenanceMatches(provenance, submission, submission.files) || submittedAnalysis.tests.some(test => !sameProvenance(test.provenance, provenance))) throw new Error("No valid executable tests exist for this snapshot. Generate fresh tests.");
    const result = await runCode(file.content, file.path, submittedAnalysis.tests);
    versions.record(submission.id, { requestId: crypto.randomUUID(), action: "run submitted tests", activeFile: file.path, status: "complete", analysis: submittedAnalysis, results: result.results.map(item => ({ ...item, provenance })) });
  }
  return <main><header><strong><span className="logo">〈/〉</span> CodeMentor <em>AI</em></strong><span className="muted">Your thinking. A little guidance.</span><button className="mode-button" onClick={() => { const next = mode === "learning" ? "direct" : "learning"; setMode(next); try { localStorage.setItem("codementor-mode", next); } catch {} }}>{mode === "learning" ? "Learning mode" : "Direct mode"}</button><button onClick={() => setLevel(null)}>{level || "Choose level"} ⚙</button></header>
    <div className={`workspace ${workspace.collapsed ? "sidebar-collapsed" : ""}`}><nav className="activity" aria-label="Workspace tools"><button title="Toggle Explorer" aria-label="Toggle Explorer" aria-expanded={!workspace.collapsed} onClick={() => { workspace.setCollapsed(!workspace.collapsed); setSearch(false); }}>▤</button><button title="Search workspace" aria-label="Search workspace" onClick={() => { workspace.setCollapsed(false); setSearch(true); }}>⌕</button><button title="Problems" aria-label="Problems" onClick={() => setTab("Problems")}>⚑</button><button title="Tests" aria-label="Tests" onClick={() => setTab("Tests")}>✓</button></nav><div className="explorer-slot" aria-hidden={workspace.collapsed} inert={workspace.collapsed}><Explorer ref={explorerRef} files={workspace.files} activeId={workspace.activeId} selectedId={workspace.selectedId} closedIds={workspace.closedIds} ready={workspace.ready} onSelect={workspace.select} onToggle={workspace.toggleFolder} onOpen={workspace.open} onCreate={workspace.create} onRename={workspace.rename} onDelete={workspace.remove} search={search}/></div>
    <section className="editor"><div className="tabs file-tabs" role="tablist" aria-label="Open files">{workspace.tabs.map(id => { const file = workspace.files.find(item => item.id === id); return file ? <div className={`file-tab ${id === workspace.activeId ? "selected" : ""}`} key={id}><button role="tab" aria-selected={id === workspace.activeId} onClick={() => workspace.open(id)}>{file.path.split("/").at(-1)}{file.content !== file.saved ? " •" : ""}</button><button aria-label={`Close ${file.path}`} onClick={() => workspace.close(id)}>×</button></div> : null; })}</div><div className="breadcrumb"><span>workspace / {active?.path || "No file open"}</span><div className="inline-actions"><EditorTools disabled={!active} onCommand={command => void editorCommand(command)}/><button disabled={!active} onClick={saveFile} title="Ctrl/Cmd+S">Save</button><button disabled={!active} onClick={workspace.download}>Download</button><button disabled={!supported || !!busy} onClick={() => void run()}>▷ Run</button></div></div><ReviewStatus submission={busy && pendingSubmission?.activeFile === active?.path ? pendingSubmission : analysis ? sourceSubmission : undefined} current={fresh && analysis?.provider !== "Isolated browser runner"} busy={busy} disabled={!supported || !versions.ready || !level} onSubmit={force => void ask("analyze", "", force, true)} onHistory={() => { setFix(null); setHistoryOpen(true); }}/><SelectionToolbar selection={selection} disabled={!!busy || !supported} onAction={editorAction}/><div className="editor-surface">{workspace.ready && active ? <CodeEditor file={active} modelGeneration={workspace.modelGeneration} problems={analysis?.problems || []} onChange={edit} onSelection={(next, currentLine) => { setSelection(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); setLine(currentLine); }} onAction={editorAction} onSave={saveFile} onMount={instance => { editorRef.current = instance; }}/> : <div className="empty"><h3>{workspace.ready ? "Open a file to start learning." : "Restoring workspace…"}</h3><button onClick={createFile}>New File</button></div>}</div><BottomPanel tab={tab} onTab={setTab} analysis={analysis} output={fresh ? session?.output || [] : []} results={results} onProblem={viewProblem} onLine={jump} onRunTests={() => void run(true)} onGenerate={() => void ask("tests")} busy={!!busy || !supported} testsCurrent={fresh}/></section>
<MentorPanel analysis={analysis} problem={problem} busy={busy} error={error || workspace.storageError || versions.error} hintCount={hintCount} messages={messages} onAction={(action, question) => void ask(action, question)} onProblem={viewProblem} onHint={() => hint()} onFix={() => setFix(problem)} onSolution={() => setSolution(true)} onCancel={() => abortRef.current?.abort()} canAnalyze={versions.ready && supported && !!level && !!active?.content.trim()} showSolution={solution}/></div><footer>✓ Local workspace <span>{active ? language(active.path) : "No file"} &nbsp; Ln {line} &nbsp; UTF-8 &nbsp; {mode === "learning" ? "Learning mode" : "Direct mode"}</span></footer>
    {fix?.quickFix && <div className="overlay" onKeyDown={event => { if (event.key === "Escape") setFix(null); }}><section className="onboarding fix-dialog" role="dialog" aria-modal="true" aria-labelledby="fix-title"><h2 id="fix-title">Preview Quick Fix</h2><p>{fix.file} · Line {fix.line}. Only this range will change.</p><pre className="diff removed">− {fix.quickFix.oldCode}</pre><pre className="diff added">+ {fix.quickFix.newCode}</pre><div className="inline-actions"><button autoFocus className="primary" onClick={applyFix}>Apply Fix</button><button onClick={() => setFix(null)}>Cancel</button></div></section></div>}
    {workspace.ready && !level && <div className="overlay"><section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="welcome"><span className="eyebrow">WELCOME TO CODEMENTOR</span><h2 id="welcome">Where are you on your coding journey?</h2><p>Choose how much guidance you want. You can change this anytime.</p>{(["beginner", "intermediate", "advanced"] as Level[]).map((value, index) => <button autoFocus={index === 0} key={value} onClick={() => choose(value)}><strong>{["Beginner", "Intermediate", "Advanced"][index]}</strong><span>{["Explain concepts step by step with gentle hints.", "Keep explanations short and let me work out the fix.", "Give me the diagnostic and a minimal clue."][index]}</span></button>)}<small>Your workspace and learning preference stay on this device.</small></section></div>}
    {historyOpen && <VersionHistory history={versions.history} files={workspace.files} onClose={() => setHistoryOpen(false)} onRestore={restoreVersion} onRun={runSubmittedTests}/>}
  </main>;
}
