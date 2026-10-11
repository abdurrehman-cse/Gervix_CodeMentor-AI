import type { AIAnalysis, AnalysisProvenance, FileNode, TestResult } from "../types";
import { restoreFiles } from "../workspace";
import { validateAnalysis } from "../ai-validation";
import { relevantPaths } from "./dependencies";
import type { MentorContext } from "../types";

export type SnapshotFile = FileNode & { hash: string; version: number };
export type FileChange = { kind: "added" | "modified" | "renamed" | "deleted"; path: string; previousPath?: string };
export type ReviewRecord = { action: string; activeFile: string; status: "running" | "complete" | "outdated" | "failed" | "cancelled"; requestId: string; analysis?: AIAnalysis; results?: TestResult[]; error?: string };
export type Submission = { id: string; version: number; timestamp: string; activeFile: string; contentHash: string; files: SnapshotFile[]; changes: FileChange[]; summary: string; origin: "review" | "save" | "restore-backup" | "restore"; reviews: ReviewRecord[] };
export function freezeSubmission(submission: Submission): Submission {
  function freeze(value: unknown) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(submission);
  return submission;
}
export async function contentHash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function canonicalFiles(files: Pick<FileNode, "path" | "kind" | "content">[]) { return JSON.stringify(files.map(({ path, kind, content }) => ({ path, kind, content })).sort((left, right) => left.path.localeCompare(right.path))); }
export function detectChanges(previous: FileNode[], next: FileNode[]): FileChange[] {
  const changes: FileChange[] = [];
  for (const file of next) {
    const old = previous.find(item => item.id === file.id);
    if (!old) changes.push({ kind: "added", path: file.path });
    else {
      if (old.path !== file.path) changes.push({ kind: "renamed", path: file.path, previousPath: old.path });
      if (old.content !== file.content || old.kind !== file.kind) changes.push({ kind: "modified", path: file.path });
    }
  }
  for (const file of previous) if (!next.some(item => item.id === file.id)) changes.push({ kind: "deleted", path: file.path });
  return changes;
}
export async function createSubmission(history: Submission[], files: FileNode[], activeFile: string, origin: Submission["origin"] = "review", force = false): Promise<Submission> {
  const copied = files.map(file => ({ ...file }));
  if (!restoreFiles(copied)) throw new Error("The workspace snapshot is invalid. Your files have not changed.");
  const hash = await contentHash(canonicalFiles(copied));
  const previous = history.at(-1);
  if (!force && previous?.contentHash === hash) return previous;
  const changes = detectChanges(previous?.files || [], copied);
  const snapshotFiles = await Promise.all(copied.map(async file => {
    const fileHash = await contentHash(file.content);
    const old = [...history].reverse().flatMap(item => item.files).find(item => item.id === file.id);
    return { ...file, hash: fileHash, version: old ? old.version + Number(old.hash !== fileHash || old.path !== file.path || old.kind !== file.kind) : 1 };
  }));
  const changeSummary = !previous ? "Initial solution" : !changes.length ? "No source changes" : changes.slice(0, 4).map(change => `${change.kind} ${change.previousPath ? `${change.previousPath} → ` : ""}${change.path}`).join(" · ") + (changes.length > 4 ? ` · +${changes.length - 4} changes` : "");
  const summary = origin === "restore-backup" ? `Preserved working drafts · ${changeSummary}` : origin === "restore" ? `Restored saved code · ${changeSummary}` : force && !changes.length ? "Explicit unchanged resubmission" : changeSummary;
  return freezeSubmission({ id: crypto.randomUUID(), version: (previous?.version || 0) + 1, timestamp: new Date().toISOString(), activeFile, contentHash: hash, files: snapshotFiles, changes, summary, origin, reviews: [] });
}
export function provenanceFor(submission: Submission, paths: string[], activeFile: string): AnalysisProvenance {
  return { submissionId: submission.id, version: submission.version, contentHash: submission.contentHash, activeFile, files: Object.fromEntries(submission.files.filter(file => file.kind === "file" && paths.includes(file.path)).map(file => [file.path, file.hash])) };
}
export function provenanceMatches(provenance: AnalysisProvenance | undefined, submission: Submission | undefined, current: FileNode[]): boolean {
  return !!provenance && !!submission && provenance.submissionId === submission.id && provenance.version === submission.version && provenance.contentHash === submission.contentHash && Object.keys(provenance.files).length > 0 && relevantPaths(current, provenance.activeFile).every(path => path in provenance.files) && Object.entries(provenance.files).every(([path, hash]) => {
    const snapshot = submission.files.find(file => file.kind === "file" && file.path === path && file.hash === hash);
    const working = current.find(file => file.kind === "file" && file.path === path);
    return !!snapshot && !!working && working.content === snapshot.content;
  });
}
export function sameProvenance(left: AnalysisProvenance | undefined, right: AnalysisProvenance | undefined) { return !!left && !!right && left.submissionId === right.submissionId && left.version === right.version && left.contentHash === right.contentHash && left.activeFile === right.activeFile && JSON.stringify(left.files) === JSON.stringify(right.files); }
export function attachProvenance(analysis: AIAnalysis, provenance: AnalysisProvenance): AIAnalysis {
  return { ...analysis, provenance, problems: analysis.problems.map(problem => ({ ...problem, provenance })), tests: analysis.tests.map(test => ({ ...test, provenance })), complexity: analysis.complexity ? { ...analysis.complexity, provenance } : null };
}
export async function validateHistory(value: unknown): Promise<Submission[]> {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid version history");
  const history: Submission[] = [];
  for (const raw of value) {
    if (!raw || typeof raw.id !== "string" || !raw.id || history.some(item => item.id === raw.id) || !Number.isInteger(raw.version) || raw.version <= (history.at(-1)?.version || 0) || typeof raw.timestamp !== "string" || !Number.isFinite(Date.parse(raw.timestamp)) || !restoreFiles(raw.files) || !Array.isArray(raw.reviews) || !["review", "save", "restore-backup", "restore"].includes(raw.origin) || typeof raw.activeFile !== "string") throw new Error("Invalid version history");
    if (await contentHash(canonicalFiles(raw.files)) !== raw.contentHash) throw new Error("Version history checksum mismatch");
    for (const file of raw.files) {
      const previous = [...history].reverse().flatMap(item => item.files).find(item => item.id === file.id);
      const expectedVersion = previous ? previous.version + Number(previous.hash !== file.hash || previous.path !== file.path || previous.kind !== file.kind) : 1;
      if (await contentHash(file.content) !== file.hash || file.version !== expectedVersion) throw new Error("Invalid file version");
    }
    const submission: Submission = { ...raw, changes: detectChanges(history.at(-1)?.files || [], raw.files), summary: typeof raw.summary === "string" ? raw.summary : "Saved snapshot", reviews: [] };
    if (raw.reviews.length > 200) throw new Error("Too many saved review records");
    for (const review of raw.reviews) {
      if (!review || typeof review.requestId !== "string" || typeof review.action !== "string" || typeof review.activeFile !== "string" || !["running", "complete", "outdated", "failed", "cancelled"].includes(review.status)) throw new Error("Invalid review record");
      const restored: ReviewRecord = { requestId: review.requestId, action: review.action, activeFile: review.activeFile, status: review.status === "running" ? "cancelled" : review.status, error: typeof review.error === "string" ? review.error : undefined };
      if (review.analysis) {
        const provenance = review.analysis.provenance;
        if (!provenanceMatches(provenance, submission, submission.files) || provenance.activeFile !== review.activeFile) throw new Error("Invalid saved analysis provenance");
        const context: MentorContext = { files: submission.files, activeFile: review.activeFile, action: review.action, selection: { text: "", startLine: 1, endLine: 1 }, line: 1, diagnostics: [], tests: [], results: [], complexity: null, messages: [], question: "", level: "beginner", mode: "learning" };
        restored.analysis = attachProvenance({ ...validateAnalysis(review.analysis, context), provider: typeof review.analysis.provider === "string" ? review.analysis.provider : "Saved review" }, provenance);
        if (review.results) {
          if (!Array.isArray(review.results) || review.results.length > 40 || !review.results.every((result: TestResult) => typeof result.id === "string" && typeof result.passed === "boolean" && typeof result.received === "string" && (result.error === undefined || typeof result.error === "string") && sameProvenance(result.provenance, provenance) && restored.analysis!.tests.some(test => test.id === result.id))) throw new Error("Invalid saved execution results");
          restored.results = review.results.map((result: TestResult) => ({ ...result, provenance }));
        }
      }
      submission.reviews.push(restored);
    }
    history.push(freezeSubmission(submission));
  }
  return history;
}
