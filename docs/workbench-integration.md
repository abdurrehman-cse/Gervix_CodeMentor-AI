# Native web workbench

## Decision and compatibility

CodeMentor now renders the actual VS Code browser workbench through CodinGame's MIT-licensed `monaco-vscode-api`, not an Explorer or tab imitation. The implementation follows the project's [full workbench example](https://github.com/CodinGame/monaco-vscode-api/blob/main/demo/src/setup.workbench.classic.ts), [custom view example](https://github.com/CodinGame/monaco-vscode-api/blob/main/demo/src/features/customView.workbench.ts), [README](https://github.com/CodinGame/monaco-vscode-api), and [interactive demo](https://monaco-vscode-api.netlify.app/?mode=full-workbench). Published package versions and Vite's Node engine requirements were checked before installing.

All CodinGame dependencies are pinned to 37.3.11 in a separate package and lockfile. Vite 7.3.1 builds browser ESM, workers, TextMate grammars, themes, icons, WASM, and bundled language-extension resources to `frontend/public/ide`. Next 16 and React 19 continue to own the application and server APIs. The old official Monaco/AMD editor cannot safely share singleton services with the aliased VS Code editor API. A same-origin iframe isolates the two runtimes and allows the workbench to initialize once without React remounting its editors. Existing React mentor components render into registered workbench views using portals.

Node 20.19+ or 22.12+ is required. Consuming published packages works on Windows; building CodinGame's source repository itself has different platform requirements. The application sends COOP `same-origin` and COEP `credentialless` headers, including on extension-host frames and assets, to enable cross-origin isolation for the browser TypeScript service. Serve HTTPS or localhost and retain these headers in any reverse proxy. Workbench services and package versions must remain synchronized when upgrading; see [upstream troubleshooting](https://github.com/CodinGame/monaco-vscode-api/wiki/Troubleshooting).

Eclipse Theia was considered, but its [separate browser and Node backend architecture](https://theia-ide.org/docs/architecture/) would introduce another application platform, dependency-injection lifecycle and transport. Its published `@theia/core` package declares `EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0`, unlike the MIT workbench integration. Theia is not a VS Code workbench fork. That migration does not benefit this local-persistence MVP. A remote VS Code server would similarly require hosting and process isolation that this hackathon intentionally avoids.

## Integration

- `frontend/workbench/src/main.ts` initializes the native workbench services and registers the CodeMentor local extension commands, educational diagnostic hovers, preview-only code actions and custom views.
- Native VS Code supplies Explorer, inline naming, rename/delete dialogs, drag-and-drop moves, editor groups and tabs, breadcrumbs, command palette, menus, search, Problems, Output, status bar, themes and persisted layout. Its bundled TypeScript extension supplies browser JS/TS language features.
- `frontend/workbench/src/filesystem.ts` connects file services to the existing persistent workspace. Disk reads use saved content; restored unsaved drafts are applied to native working copies. Editor changes update the parent workspace synchronously; writes mark the corresponding file saved and record versions. No new project storage replaces the existing data.
- `frontend/lib/workbench-operations.ts` validates native operations atomically, including nested moves, identity-preserving folder renames, collisions and recursive deletes.
- `frontend/lib/workbench-bridge.ts` defines the typed boundary. The workbench receives no AI credentials. The existing controller still performs snapshot capture, provenance validation, cancellation, stale-result rejection, guarded fixes and isolated test execution.
- Mentor and review controls occupy a native secondary-sidebar view; tests and complexity occupy native panel views. Generated expectations remain separate from actual sandbox results. Version History keeps the existing comparison and confirmed-restore UI and persistence.
- `/?classic` retains the previous interface as a compatibility fallback against the same files and history. It is not the default workbench.

## Run and demonstrate

`cd frontend`, `npm ci`, then `npm run dev`. The preparation script installs the separately locked workbench dependencies when absent and builds its static bundle. `npm run build` does the same for production. To rebuild only the workbench, use `npm --prefix workbench run build`.

Open the native Explorer, create `src/utils.ts` inline, edit it, use Ctrl/Cmd+S, rename its folder and refresh. Open the sample and use CodeMentor: Submit for Review from F1 or the mentor view. Inspect its native Problems entry and rich hover; request hints and preview the guarded quick fix. Run CodeMentor: Run Current File, generate/run tests, analyze complexity, then compare submissions through Version History. Ctrl/Cmd+F, Ctrl/Cmd+H, Ctrl/Cmd+G, F1, F8 and split editors are native workbench actions.

## Boundaries

This is the open-source VS Code web workbench, not Microsoft's hosted vscode.dev product. It intentionally has no remote extension marketplace, terminal process, Git hosting, Node extension host or arbitrary third-party extension installation. Browser-compatible bundled extensions run in a worker host. Create project files through Explorer; native untitled scratch buffers must be saved under `/workspace` before CodeMentor can review or persist them. Mentor actions are disabled rather than analyzing a different file while an unsupported buffer is active. Only standalone JS/TS execution is supported by the existing isolated runner; project imports can be analyzed but cannot yet be executed. Offline startup is not guaranteed. The workbench and language-server assets are substantially larger than standalone Monaco; the original view remains available on devices where the full bundle cannot load. File and snapshot storage limits remain unchanged.

Licensing: [CodinGame MIT license](https://github.com/CodinGame/monaco-vscode-api/blob/main/LICENSE) and [VS Code MIT license](https://github.com/microsoft/vscode/blob/main/LICENSE.txt). Third-party notices are retained alongside the distributed bundle.
