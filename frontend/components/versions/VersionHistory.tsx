"use client";
import { useEffect, useRef, useState } from "react";
import type { FileNode } from "../../lib/types";
import { detectChanges, provenanceMatches, type Submission } from "../../lib/versions/snapshots";
import { lineDiff } from "../../lib/versions/diff";
import "./versions.css";
type Props = { history: Submission[]; files: FileNode[]; onClose: () => void; onRestore: (submission: Submission) => Promise<void>; onRun: (submission: Submission) => Promise<void> };
export default function VersionHistory({ history, files, onClose, onRestore, onRun }: Props) {
  const [left, setLeft] = useState(history.at(-2)?.id || "");
  const [right, setRight] = useState(history.at(-1)?.id || "");
  const [confirm, setConfirm] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLElement>(null);
  const previous = history.find(item => item.id === left);
  const selected = history.find(item => item.id === right) || history.at(-1);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    container.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (focused?.isConnected) focused.focus(); };
  }, []);
  async function perform(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); setConfirm(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed. Your workspace is safe."); } finally { setBusy(false); } }
  return <div className="overlay version-overlay"><section className="version-history" ref={container} role="dialog" aria-modal="true" aria-labelledby="versions-title" onKeyDown={event => {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); if (confirm) setConfirm(null); else onClose(); }
    if (event.key === "Tab") {
      const elements = Array.from(container.current?.querySelectorAll<HTMLElement>("button:not(:disabled),select:not(:disabled),[tabindex='0']") || []);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><div className="version-heading"><h2 id="versions-title">Version History</h2><button disabled={busy} onClick={onClose} aria-label="Close version history">×</button></div><p className="muted">Immutable submissions, separate from your working drafts. Generated expectations are not execution results.</p>{error && <p role="alert" className="error">{error}</p>}{!history.length && <p>No submissions yet. Submit for Review to save your first version.</p>}
    <div className="version-list">{[...history].reverse().map(item => {
      const review = item.reviews.at(-1);
      const status = review?.status === "complete" && review.analysis?.provenance && !provenanceMatches(review.analysis.provenance, item, files) ? "outdated for working code" : review?.status || "not analyzed";
      return <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => setRight(item.id)}><strong>v{item.version}</strong><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time><span>{new Set(item.changes.map(change => change.path)).size} changed files · {item.summary}</span><small>{item.origin} · {status} · {item.contentHash.slice(0, 10)}</small></button>;
    })}</div>
    {selected && <><div className="inline-actions"><label>Compare from <select aria-label="Compare from version" value={left} onChange={event => setLeft(event.target.value)}><option value="">Empty workspace</option>{history.map(item => <option key={item.id} value={item.id}>v{item.version}</option>)}</select></label><label>to <select aria-label="Compare to version" value={selected.id} onChange={event => setRight(event.target.value)}>{history.map(item => <option key={item.id} value={item.id}>v{item.version}</option>)}</select></label><button disabled={busy} onClick={() => setConfirm(selected)}>Restore v{selected.version}</button><button disabled={busy || !selected.reviews.some(review => review.analysis?.tests.length)} onClick={() => void perform(() => onRun(selected))}>Run submitted tests · v{selected.version}</button></div>
    <h3>Compare Versions · {previous ? `v${previous.version}` : "Empty"} → v{selected.version}</h3><div className="version-diffs">{detectChanges(previous?.files || [], selected.files).map((change, index) => {
      const before = previous?.files.find(file => file.path === (change.previousPath || change.path));
      const after = selected.files.find(file => file.path === change.path);
      return <details key={`${change.path}:${index}`} open><summary>{change.kind} · {change.previousPath ? `${change.previousPath} → ` : ""}{change.path}</summary><pre>{lineDiff(before?.content || "", after?.content || "").map((line, lineIndex) => <span className={`diff-line ${line.kind}`} key={lineIndex}>{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} {line.text}{"\n"}</span>)}</pre></details>;
    })}{!detectChanges(previous?.files || [], selected.files).length && <p>No source changes between these snapshots.</p>}</div><h3>Review · v{selected.version}</h3>{selected.reviews.map(review => <article key={review.requestId}><strong>{review.action} · {review.activeFile} · {review.status}</strong>{review.error && <p className="error">{review.error}</p>}{review.analysis && <><p className="prewrap">{review.analysis.explanation}</p><p>{review.analysis.problems.length} diagnostics · {review.analysis.tests.length} generated tests · {review.analysis.complexity?.time || "Complexity not generated"}</p>{review.analysis.tests.map(test => <p key={test.id}>{test.name}: expected {JSON.stringify(test.expected)} · {test.reason}</p>)}</>}{review.results && <p>Actual execution: {review.results.filter(result => result.passed).length}/{review.results.length} passed{review.results.filter(result => !result.passed).map(result => ` · Received: ${result.error || result.received}`).join("")}</p>}</article>)}</>}
    {confirm && <div className="restore-confirm" role="alertdialog" aria-labelledby="restore-title"><h3 id="restore-title">Restore v{confirm.version}?</h3><p>Your current workspace, including unsaved edits, will be saved as a backup version first. Restoring creates a new working state and submission; current review results will not be applied to it.</p><div className="inline-actions"><button autoFocus disabled={busy} onClick={() => void perform(() => onRestore(confirm))}>{busy ? "Restoring…" : "Preserve drafts and restore"}</button><button disabled={busy} onClick={() => setConfirm(null)}>Cancel restore</button></div></div>}
  </section></div>;
}
