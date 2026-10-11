# CodeMentor AI

An educational coding workspace using the real open-source VS Code browser workbench inside the existing Next.js application. A persistent virtual filesystem, contextual mentoring, exact diagnostics, progressive hints, targeted fix previews, isolated execution, tests, and complexity estimates teach the reasoning behind a correction.

## Run

Requirements: Node.js 20.19+ or 22.12+, and optionally Go 1.22+.

```sh
cd frontend
npm install
npm run dev
```
Open http://localhost:3000 and choose your experience level. The frontend now serves its own mentor and compilation endpoints; the Go backend is optional and retains the original `/api/analyze` and `/api/health` endpoints.

For production: `npm run build` then `npm start`. The actual VS Code web workbench is built by a separately locked Vite package before development and production builds; no editor CDN is required. The existing Next AI APIs, files, drafts and version history are preserved. Mentor, tests and complexity are native custom workbench views. See `docs/workbench-integration.md` for architecture, licensing, deployment headers and limitations. The previous interface remains at `/?classic`. PWA installation needs HTTPS (or localhost). The service worker provides a reconnect screen, not a fully offline app.

## AI configuration

Copy `frontend/.env.example` to `frontend/.env.local` and configure:

```text
AI_API_KEY=your-provider-key
AI_API_URL=https://your-provider.example/v1/chat/completions
AI_MODEL=your-provider-model
```

The adapter expects a Chat Completions compatible endpoint supporting JSON output. Credentials stay on the server. Requests explicitly send workspace source, selections, conversation, diagnostics, and results to the configured provider. Responses are validated against real file coordinates and callable function names. Provider failures do not rewrite code or report invented results.

Without credentials, the app clearly labels local checks: compiler diagnostics, supported AST rules, source-derived explanations and hints, sum-contract tests, and conservative complexity estimates. General semantic reasoning and broad test generation require the configured provider. Local checks do not prove correctness.

## Demo and controls

1. Analyze the intentionally buggy `solution.js` sample.
2. Hover its boundary diagnostic, open View Problem, and request progressive hints.
3. Preview Quick Fix and apply the one-condition correction. Undo works in Monaco.
4. Run the code: output changes from `NaN` to `6`.
5. Generate and run tests; the sum-contract cases expose the bug and pass after the fix.
6. Analyze complexity: the sample has estimated O(n) time and O(1) auxiliary space.

Explorer supports inline file/folder creation and rename, custom delete confirmation, right-click actions, multiple tabs, search, and collapse. Enter commits a name, Escape cancels, and leaving a valid inline input cancels. Creation accepts `/`-separated nested paths and explicitly creates intermediate folders; rename accepts a single name. Names are trimmed and validated, including case-insensitive sibling collisions and reserved device names. New files open automatically; new folders become the selected location. Folder expansion, drafts, tabs, and sidebar state persist in local storage. Delete warns about nested contents and unsaved edits. Save marks the current draft as saved; Download exports it. F2 renames a focused tree item, Delete opens confirmation, arrow keys navigate the tree, and Shift+F10 opens its context menu. Ctrl/Cmd+S saves, Ctrl/Cmd+Enter analyzes, Ctrl/Cmd+Shift+Enter runs; Monaco provides find, folding, suggestions, and undo.

Execution supports standalone JavaScript and TypeScript functions, including async returned promises. Imports/exports are currently rejected by the runner, while mentoring and compiler checks understand virtual project imports. Code runs in a worker inside an opaque sandboxed iframe with network access blocked by CSP, bounded console output, cancellation, and a three-second timeout. Student code is never executed on the server. This MVP limits execution time and output, not process-level memory; it is intended for local student exercises.

## Version-aware review

Use **Submit for Review** to capture an immutable workspace snapshot and analyze that exact code. Save also records meaningful changes. Identical submissions reuse the previous version; **Resubmit unchanged** deliberately creates another version. SHA-256 hashes, submission IDs, timestamps, workspace versions, and per-file versions identify the source of each diagnostic, hint container, complexity report, generated test, and actual test result.

The compact status shows **Analysis current · vN** or **Code changed · Analysis outdated**. Editing relevant files invalidates diagnostics and fixes; obsolete generated tests remain visibly labeled but cannot accidentally run against newer drafts. **Reanalyze Latest Code** supersedes older requests. Unrelated files do not invalidate results when the analyzed file and its detected imports remain unchanged. Named files in mentor questions are included; dynamic imports use conservative workspace scope.

**Version History** displays submissions, review status, checksums, and readable line diffs. Compare any two submissions, run their original generated tests against their saved code, or restore a snapshot. Restore requires confirmation, first saves all current drafts as a backup version, then creates a new restore version and working state. History is locally persisted and validated on refresh. The MVP retains up to 100 submissions and 200 review records per submission; storage errors preserve working code and show an in-app warning. A secure context (HTTPS or localhost) is required for browser hashing.

Demo: submit the sample as v1, inspect its boundary hint and failing tests; change `<=` to `<` and rename the loop index, then submit v2; add `if (numbers.length === 0) return 0;` and replace the indexed loop with `for (const number of numbers) { total += number; }`, then submit v3. Generate fresh tests, run them, inspect O(n)/O(1) estimates, and compare v2/v3. The automated version smoke test also holds an older response until v3 finishes, verifies it cannot overwrite v3, and verifies safe restoration of unsaved drafts.

## Verification commands

```sh
cd backend
go test ./...
cd ../frontend
npm run typecheck
npm test
npm run build
```

The Editor menu runs Monaco's Find, Replace, Go to Line, Format Document, Command Palette, and problem navigation commands. Ctrl/Cmd+F finds, Ctrl/Cmd+H replaces, Ctrl/Cmd+G goes to a line, Shift+Alt+F formats, F1 or Ctrl/Cmd+Shift+P opens the command palette, and F8/Shift+F8 navigates diagnostics. Selected-code guidance uses the actual editor range, including columns, without changing code. The toolbar reserves its space so selection never changes editor geometry mid-drag.

Optional browser smoke verification uses Playwright supplied by your environment: `node scripts/browser-smoke.cjs` checks the mentor flow, `node scripts/explorer-smoke.cjs` checks file operations and persistence, `node scripts/editor-smoke.cjs` checks mouse selection and editor reliability, and `node scripts/version-smoke.cjs` verifies the three-version review flow, stale-request rejection, historical comparisons and tests, refresh, and safe restore. Set `CODEMENTOR_PLAYWRIGHT` to an installed Playwright package path if it is not installed locally, and `CODEMENTOR_URL` to the running app URL. Screenshots go to ignored `frontend/test-artifacts/`. See `docs/architecture.md` and `docs/verification.md`.

Hackathon rules supplied by the organizer require project creation during the official 24-hour period. Treat this advance scaffold as practice unless organizers allow reuse.
