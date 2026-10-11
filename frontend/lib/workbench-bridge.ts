import type { FileNode, Problem } from "./types";
import type { CodeSelection } from "./editor-selection";
import type { WorkbenchOperation } from "./workbench-operations";
export type WorkbenchSnapshot = { files: FileNode[]; tabs: string[]; activeId: string; modelGeneration: number };
export type WorkbenchMounts = Partial<Record<"mentor" | "tests" | "complexity", HTMLElement>>;
export interface WorkbenchHost {
  snapshot(): WorkbenchSnapshot;
  mutate(operation: WorkbenchOperation): { ok: boolean; error?: string };
  tabs(paths: string[], activePath?: string): void;
  selection(selection: CodeSelection, line: number): void;
  action(action: string, problemId?: string): void;
  saved(path: string): void;
  mounts(mounts: WorkbenchMounts): void;
  error(message: string): void;
  ready(client: WorkbenchClient): void;
}
export interface WorkbenchClient {
  sync(snapshot: WorkbenchSnapshot): Promise<void>;
  diagnostics(problems: Problem[]): void;
  output(lines: string[]): void;
  status(text: string): void;
  show(view: string): Promise<void>;
  editor(): unknown;
  save(): Promise<void>;
}
declare global { interface Window { codeMentorHost?: WorkbenchHost; codeMentorWorkbench?: WorkbenchClient } }
