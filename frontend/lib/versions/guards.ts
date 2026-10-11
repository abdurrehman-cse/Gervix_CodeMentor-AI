import type { AnalysisProvenance, FileNode, Problem } from "../types";
import { provenanceMatches, type Submission } from "./snapshots";
export function resultIsCurrent(provenance: AnalysisProvenance | undefined, submission: Submission | undefined, files: FileNode[], request: number, latestRequest: number, revision: number, latestRevision: number, aborted: boolean) {
  return !aborted && request === latestRequest && revision === latestRevision && provenanceMatches(provenance, submission, files);
}
export function canApplySnapshotFix(problem: Problem, submission: Submission | undefined, files: FileNode[], modelValue: string) {
  return !!problem.quickFix && provenanceMatches(problem.provenance, submission, files) && modelValue === submission?.files.find(file => file.kind === "file" && file.path === problem.file)?.content;
}
