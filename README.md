# CodeMentor AI

An educational coding workspace built on the original Next.js interface. Monaco, a persistent virtual filesystem, contextual mentoring, exact diagnostics, progressive hints, targeted fix previews, isolated execution, tests, and complexity estimates work together to teach the reasoning behind a correction.

## Run

Requirements: Node.js 20.9+ and Go 1.22+.

```sh
cd frontend
npm install
npm run dev
```
Open http://localhost:3000 and choose your experience level. The frontend now serves its own mentor and compilation endpoints; the Go backend is optional and retains the original `/api/analyze` and `/api/health` endpoints.

For production: `npm run build` then `npm start`. Monaco assets are copied from the installed dependency before development and build; no editor CDN is required. PWA installation needs HTTPS (or localhost). The service worker provides a reconnect screen, not a fully offline app.

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

## Verification

```sh
cd backend
go test ./...
cd ../frontend
npm run typecheck
npm test
npm run build
```

The Editor menu runs Monaco's Find, Replace, Go to Line, Format Document, Command Palette, and problem navigation commands. Ctrl/Cmd+F finds, Ctrl/Cmd+H replaces, Ctrl/Cmd+G goes to a line, Shift+Alt+F formats, F1 or Ctrl/Cmd+Shift+P opens the command palette, and F8/Shift+F8 navigates diagnostics. Selected-code guidance uses the actual editor range, including columns, without changing code. The toolbar reserves its space so selection never changes editor geometry mid-drag.

Optional browser smoke verification uses Playwright supplied by your environment: `node scripts/browser-smoke.cjs` checks the mentor flow, `node scripts/explorer-smoke.cjs` checks file operations and persistence, and `node scripts/editor-smoke.cjs` checks real mouse selection, clipboard operations, editor commands, contextual requests, and tab/view-state stability. Set `CODEMENTOR_PLAYWRIGHT` to an installed Playwright package path if it is not installed locally, and `CODEMENTOR_URL` to the running app URL. Screenshots go to ignored `frontend/test-artifacts/`. See `docs/architecture.md` and `docs/verification.md`.

Hackathon rules supplied by the organizer require project creation during the official 24-hour period. Treat this advance scaffold as practice unless organizers allow reuse.
