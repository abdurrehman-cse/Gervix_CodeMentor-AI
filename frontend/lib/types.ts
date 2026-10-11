export type Level = "beginner" | "intermediate" | "advanced";
export type FileNode = { id: string; path: string; kind: "file" | "folder"; content: string; saved: string };
export type Hint = { text: string; index: number };
export type AnalysisProvenance = { submissionId: string; version: number; contentHash: string; activeFile: string; files: Record<string, string> };
export type Problem = {
  id: string; file: string; severity: "error" | "warning" | "info" | "suggestion";
  line: number; column: number; endLine: number; endColumn: number;
  title: string; description: string; consequence: string; concept: string;
  hints: string[]; question: string; provenance?: AnalysisProvenance; quickFix?: { oldCode: string; newCode: string };
};
export type Diagnostic = Problem;
export type ComplexityAnalysis = { time: string; space: string; explanation: string; lines: number[]; caveat: string; provenance?: AnalysisProvenance };
export type TestCase = { id: string; name: string; category: string; functionName: string; args: unknown[]; expected: unknown; reason: string; line: number; provenance?: AnalysisProvenance };
export type TestResult = { id: string; passed: boolean; received: string; error?: string; provenance?: AnalysisProvenance };
export type AIAnalysis = { problems: Problem[]; complexity: ComplexityAnalysis | null; tests: TestCase[]; explanation: string; provider: string; provenance?: AnalysisProvenance };
export type ChatMessage = { role: "user" | "assistant"; content: string; provenance?: AnalysisProvenance };
export type MentorContext = {
  action: string; files: Pick<FileNode, "path" | "kind" | "content">[]; activeFile: string;
  selection: { text: string; startLine: number; endLine: number; startColumn?: number; endColumn?: number }; line: number;
  diagnostics: Problem[]; tests: TestCase[]; results: TestResult[]; complexity: ComplexityAnalysis | null;
  messages: ChatMessage[]; question: string; level: Level; mode: "learning" | "direct";
  previousDiagnostics?: Problem[]; output?: string[]; hintsUsed?: { problemId: string; count: number };
  provenance?: AnalysisProvenance;
};
