# Architecture

The original dark workspace, Explorer, Monaco editor, Mentor Panel, onboarding, and status bar remain the UI foundation.

| Module | Responsibility |
| --- | --- |
| `app/page.tsx` | Compose components, capture selection and cursor, coordinate analysis and execution, invalidate stale feedback |
| `lib/use-workspace.ts` | Atomic workspace snapshots, tabs, drafts, tree/sidebar persistence, download |
| `lib/workspace-operations.ts` | Validated creation/rename/deletion, nested paths, sibling conflicts, descendant cleanup, safe restoration |
| `components/editor/CodeEditor.tsx` | Monaco models, severity markers, educational hovers, selection actions, shortcuts |
| `components/editor/SelectionToolbar.tsx` | Fixed-height, focus-preserving contextual actions without mid-drag layout changes |
| `components/editor/EditorTools.tsx` | Accessible menu invoking native Monaco editing and navigation commands |
| `lib/editor-selection.ts`, `lib/selection-scope.ts` | Live Monaco range capture and column-aware source scoping |
| `components/explorer/` | Keyboard-accessible tree, search, persistent folder expansion, viewport-safe menus, inline name editing, custom delete confirmation |
| `components/mentor/MentorPanel.tsx` | Problem teaching, progressive hints, explicit solution reveal, chat, cancellation |
| `components/editor/BottomPanel.tsx` | Resizable Problems, Output, Tests, and Complexity tabs |
| `lib/ai/provider.ts` | Server-only configurable provider adapter, response validation, timeout and cancellation |
| `lib/ai/local-mentor.ts` | Clearly labeled local explanations grounded in actual source and named files |
| `lib/local-analysis.ts` | Syntax diagnostics, AST rules, supported contract-derived tests |
| `lib/diagnostics/compiler.ts` | Compiler diagnostics resolving virtual workspace imports, with cached standard libraries |
| `lib/complexity/estimate.ts` | Conservative static cost estimates and line-level reasoning |
| `lib/ai-validation.ts` | Validate diagnostic coordinates, exact fix ranges, real function names, and JSON test values |
| `app/api/compile/route.ts` | Prepare standalone JS/TS without executing it; reject modules |
| `lib/runner.ts` | Browser isolation, console capture, async execution, test comparisons, cancellation and timeout |

## Context and freshness

Explicit mentor actions submit the workspace tree and source, active file, cursor, actual selected text with line/column bounds, current and previous diagnostics, hint usage, console output, conversation, tests, and observed results. AI credentials are server environment variables; the browser never receives them.

Editor models use stable file IDs so renames preserve drafts, undo history, and view state. Monaco owns live edits; stable callbacks mirror them atomically into the workspace rather than rewriting the model from React during unrelated updates. The selection toolbar always reserves the same height because Monaco cancels active mouse-drag tracking on height changes.

Requests carry a snapshot of file IDs, paths, kinds, and source. Responses are ignored if that snapshot or editor revision changes. Saving a draft does not alter its source signature. Edits abort pending analysis and execution. Existing test expectations survive edits, while observed results and stale diagnostic markers are cleared until refreshed. Source changes in another file also invalidate workspace-aware analysis.

## Execution boundaries

Student code runs in an async function inside a dedicated worker created by an iframe with an opaque sandbox origin. Its CSP blocks connections and external scripts. Console capture is bounded, and the parent removes the iframe after completion, cancellation, or three seconds. Results come from executing functions against JSON arguments and comparing actual outputs; no successes are synthesized. Runtime errors retain preceding console output and expose messages rather than stack traces.

The server only parses and transpiles code. Compiler file reads are restricted to the supplied virtual project and TypeScript standard libraries. Execution supports standalone files; the mentor can inspect project imports without claiming the runner supports modules. The MVP does not provide OS-level memory isolation or an adversarial grading service.

## Local mode

Without an AI key, compiler and AST checks, source-derived mentoring, progressive problem hints, supported sum tests, and static complexity estimates remain functional and clearly labeled. General semantic inference requires a configured provider. Test expectations describe the inferred contract, and complexity cards state their assumptions. Neither diagnostics nor passing generated tests establish correctness.

The original Go analyzer remains available as a separate optional service. The Next.js mentor and compile routes work independently of it.
