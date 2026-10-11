import "vscode/localExtensionHost";
import "@codingame/monaco-vscode-javascript-default-extension";
import "@codingame/monaco-vscode-typescript-basics-default-extension";
import "@codingame/monaco-vscode-typescript-language-features-default-extension";
import "@codingame/monaco-vscode-json-default-extension";
import "@codingame/monaco-vscode-markdown-basics-default-extension";
import "@codingame/monaco-vscode-theme-defaults-default-extension";
import "@codingame/monaco-vscode-theme-seti-default-extension";
import { initialize, getService, ICodeEditorService, IEditorService, IEditorGroupsService, IViewsService } from "@codingame/monaco-vscode-api";
import getWorkbench from "@codingame/monaco-vscode-workbench-service-override";
import { registerCustomView, ViewContainerLocation } from "@codingame/monaco-vscode-workbench-service-override/common";
import getConfiguration from "@codingame/monaco-vscode-configuration-service-override";
import getExplorer from "@codingame/monaco-vscode-explorer-service-override";
import getModel from "@codingame/monaco-vscode-model-service-override";
import getTextmate from "@codingame/monaco-vscode-textmate-service-override";
import getTheme from "@codingame/monaco-vscode-theme-service-override";
import getLanguages from "@codingame/monaco-vscode-languages-service-override";
import getSearch from "@codingame/monaco-vscode-search-service-override";
import getOutput from "@codingame/monaco-vscode-output-service-override";
import getNotifications from "@codingame/monaco-vscode-notifications-service-override";
import getStorage from "@codingame/monaco-vscode-storage-service-override";
import getWorkingCopy from "@codingame/monaco-vscode-working-copy-service-override";
import getDialogs from "@codingame/monaco-vscode-dialogs-service-override";
import getMarkers from "@codingame/monaco-vscode-markers-service-override";
import getPreferences from "@codingame/monaco-vscode-preferences-service-override";
import getExtensions from "@codingame/monaco-vscode-extensions-service-override";
import getQuickAccess from "@codingame/monaco-vscode-quickaccess-service-override";
import { registerFileSystemOverlay, createIndexedDBProviders } from "@codingame/monaco-vscode-files-service-override";
import { registerExtension, ExtensionHostKind } from "@codingame/monaco-vscode-api/extensions";
import * as monaco from "monaco-editor";
import type * as VSCode from "vscode";
import { root, uriFor, pathOf, WorkspaceProvider } from "./filesystem";
import type { WorkbenchClient, WorkbenchMounts, WorkbenchSnapshot } from "../../lib/workbench-bridge";
import type { Problem } from "../../lib/types";
import "./style.css";
import editorWorkerUrl from "monaco-editor/esm/vs/editor/editor.worker.js?worker&url";
import extensionWorkerUrl from "@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url";
import textmateWorkerUrl from "@codingame/monaco-vscode-textmate-service-override/worker?worker&url";
import searchWorkerUrl from "@codingame/monaco-vscode-search-service-override/worker?worker&url";
import outputWorkerUrl from "@codingame/monaco-vscode-output-service-override/worker?worker&url";

const host = window.parent.codeMentorHost;
if (!host || window.parent.location.origin !== location.origin) throw new Error("Open the workbench through CodeMentor AI.");
const mounts: WorkbenchMounts = {};
for (const [key, name, location] of [["mentor", "CodeMentor AI", ViewContainerLocation.AuxiliaryBar], ["tests", "Mentor Tests", ViewContainerLocation.Panel], ["complexity", "Mentor Complexity", ViewContainerLocation.Panel]] as const) {
  registerCustomView({ id: `codementor.${key}`, name, location, order: 0, canMoveView: true, renderBody(container) {
    container.classList.add("codementor-view");
    container.style.display = "block";
    container.style.overflow = "auto";
    mounts[key] = container;
    host.mounts({ ...mounts });
    return { dispose() { delete mounts[key]; host.mounts({ ...mounts }); } };
  } });
}
window.MonacoEnvironment = { getWorkerUrl(_module, label) {
  const urls: Record<string, string> = { extensionHostWorkerMain: extensionWorkerUrl, TextMateWorker: textmateWorkerUrl, LocalFileSearchWorker: searchWorkerUrl, OutputLinkDetectionWorker: outputWorkerUrl, editorWorkerService: editorWorkerUrl };
  return urls[label] ? new URL(urls[label], location.href).href : undefined;
}, getWorkerOptions() { return { type: "module" }; } };
const provider = new WorkspaceProvider(host);
await createIndexedDBProviders();
registerFileSystemOverlay(10, provider);
await initialize({ ...getWorkbench(), ...getConfiguration(), ...getExplorer(), ...getModel(), ...getTextmate(), ...getTheme(), ...getLanguages(), ...getSearch(), ...getOutput(), ...getNotifications(), ...getStorage(), ...getWorkingCopy(), ...getDialogs(), ...getMarkers(), ...getPreferences(), ...getExtensions({ enableWorkerExtensionHost: true }), ...getQuickAccess({ shouldUseGlobalPicker: () => true, isKeybindingConfigurationVisible: () => true }) }, document.getElementById("workbench")!, {
  productConfiguration: { nameShort: "CodeMentor AI", nameLong: "CodeMentor AI", applicationName: "codementor-ai", dataFolderName: ".codementor", version: "1.0.0" },
  workspaceProvider: { trusted: true, workspace: { folderUri: root }, async open() { return false; } },
  configurationDefaults: { "workbench.colorTheme": "Default Dark Modern", "workbench.iconTheme": "vs-seti", "workbench.startupEditor": "none", "workbench.editor.enablePreview": false, "editor.minimap.enabled": false, "editor.fontSize": 14, "files.autoSave": "off", "files.hotExit": "off", "explorer.confirmDelete": true, "explorer.confirmDragAndDrop": true, "window.dialogStyle": "custom", "security.workspace.trust.enabled": false },
  defaultLayout: { views: [{ id: "workbench.explorer.fileView" }, { id: "codementor.mentor" }] }
});
const extension = registerExtension({ name: "mentor", publisher: "codementor", version: "1.0.0", engines: { vscode: "*" }, contributes: {
  commands: ["analyze", "explain", "hint", "complexity", "tests", "chat", "optimize", "run", "runTests", "history", "resubmit"].map(command => ({ command: `codementor.${command}`, title: ({ analyze: "Submit for Review", explain: "Explain Selection", hint: "Give Hint", complexity: "Analyze Complexity", tests: "Generate Tests", chat: "Ask Mentor", optimize: "Explore Optimization", run: "Run Current File", runTests: "Run Generated Tests", history: "Version History", resubmit: "Resubmit Unchanged" } as Record<string, string>)[command], category: "CodeMentor" })),
  menus: { "editor/context": ["explain", "analyze", "hint", "complexity", "tests", "chat", "optimize"].map((command, index) => ({ command: `codementor.${command}`, group: `codementor@${index}` })) },
  keybindings: [{ command: "codementor.analyze", key: "ctrl+enter", mac: "cmd+enter", when: "editorTextFocus" }, { command: "codementor.run", key: "ctrl+shift+enter", mac: "cmd+shift+enter", when: "editorTextFocus" }]
} }, ExtensionHostKind.LocalProcess);
const api = await extension.getApi();
const codeEditors = await getService(ICodeEditorService);
const editorService = await getService(IEditorService);
const groupsService = await getService(IEditorGroupsService);
const viewsService = await getService(IViewsService);
let restoring = false;
let problems: Problem[] = [];
let generation = host.snapshot().modelGeneration;
let previousSnapshot = structuredClone(host.snapshot());
let synchronization = Promise.resolve();
const bufferedChanges = new Map<string, string>();
const diagnostics = api.languages.createDiagnosticCollection("CodeMentor AI");
const output = api.window.createOutputChannel("CodeMentor Execution");
const status = api.window.createStatusBarItem(api.StatusBarAlignment.Left, 1000);
status.command = "codementor.history";
status.tooltip = "CodeMentor: inspect immutable submission history";
status.show();
const activeEditor = () => {
  const uri = api.window.activeTextEditor?.document.uri.toString();
  const focused = codeEditors.getFocusedCodeEditor();
  if (uri && focused?.getModel()?.uri.toString() === uri) return focused;
  const active = codeEditors.getActiveCodeEditor();
  if (uri && active?.getModel()?.uri.toString() === uri) return active;
  return codeEditors.listCodeEditors().find(instance => instance.getModel()?.uri.toString() === uri && instance.getDomNode()?.isConnected) || null;
};
function publishSelection() {
  const instance = activeEditor(), model = instance?.getModel(), range = instance?.getSelection();
  if (!model || !range) return;
  host!.selection({ text: model.getValueInRange(range), startLine: range.startLineNumber, endLine: range.endLineNumber, startColumn: range.startColumn, endColumn: range.endColumn }, range.positionLineNumber);
}
function publishTabs() {
  if (restoring) return;
  const paths = api.window.tabGroups.all.flatMap(group => group.tabs.flatMap(tab => tab.input instanceof api.TabInputText ? [pathOf(tab.input.uri)] : [])).filter(Boolean);
  host!.tabs(paths, api.window.activeTextEditor ? pathOf(api.window.activeTextEditor.document.uri) : undefined);
  publishSelection();
}
api.window.tabGroups.onDidChangeTabs(publishTabs);
api.window.onDidChangeActiveTextEditor(publishTabs);
api.window.onDidChangeTextEditorSelection(publishSelection);
api.workspace.onDidChangeTextDocument(event => {
  if (!pathOf(event.document.uri)) return;
  if (restoring) { bufferedChanges.set(pathOf(event.document.uri), event.document.getText()); return; }
  const result = host!.mutate({ type: "edit", path: pathOf(event.document.uri), content: event.document.getText() });
  if (!result.ok) host!.error(result.error || "The editor change could not be stored.");
});
function flushChanges() {
  const changes = [...bufferedChanges]; bufferedChanges.clear();
  for (const [path, content] of changes) if (host!.snapshot().files.some(file => file.path === path && file.kind === "file")) {
    const result = host!.mutate({ type: "edit", path, content });
    if (!result.ok) host!.error(result.error || "Your working draft could not be synchronized.");
  }
}
for (const action of ["analyze", "explain", "hint", "complexity", "tests", "chat", "optimize", "run", "runTests", "history", "resubmit"]) api.commands.registerCommand(`codementor.${action}`, () => { publishSelection(); host!.action(action); });
for (const action of ["view", "hint", "fix"]) api.commands.registerCommand(`codementor.problem.${action}`, (id: string) => host!.action(action, id));
function rangeFor(problem: Problem) { return new api.Range(problem.line - 1, problem.column - 1, problem.endLine - 1, problem.endColumn - 1); }
api.languages.registerHoverProvider([{ language: "javascript" }, { language: "typescript" }], { provideHover(document, position) {
  const problem = problems.find(item => item.file === pathOf(document.uri) && rangeFor(item).contains(position));
  if (!problem) return;
  const markdown = new api.MarkdownString();
  markdown.appendText(`${problem.title}\n\n${problem.description}\n\n${problem.consequence}\n\nConcept: ${problem.concept}\n\n${problem.question}`);
  const argument = encodeURIComponent(JSON.stringify([problem.id]));
  markdown.appendMarkdown(`\n\n[View Problem](command:codementor.problem.view?${argument}) · [Get Hint](command:codementor.problem.hint?${argument})${problem.quickFix ? ` · [Preview Quick Fix](command:codementor.problem.fix?${argument})` : ""}`);
  markdown.isTrusted = { enabledCommands: ["codementor.problem.view", "codementor.problem.hint", "codementor.problem.fix"] };
  return new api.Hover(markdown, rangeFor(problem));
} });
api.languages.registerCodeActionsProvider([{ language: "javascript" }, { language: "typescript" }], { provideCodeActions(document, range) {
  return problems.filter(item => item.file === pathOf(document.uri) && item.quickFix && rangeFor(item).intersection(range)).map(item => {
    const action = new api.CodeAction(`Preview mentor fix: ${item.title}`, api.CodeActionKind.QuickFix);
    action.command = { command: "codementor.problem.fix", title: "Preview Quick Fix", arguments: [item.id] };
    return action;
  });
} }, { providedCodeActionKinds: [api.CodeActionKind.QuickFix] });
async function hydrate(snapshot: WorkbenchSnapshot, reset = false) {
  restoring = true;
  try {
    provider.refresh();
    if (reset) {
      for (const group of groupsService.groups) for (const input of [...group.editors]) {
        const exists = input.resource && snapshot.files.some(file => file.path === pathOf(input.resource!) && file.kind === "file");
        await editorService.revert({ editor: input, groupId: group.id }, exists ? { force: true } : { soft: true });
      }
      await api.window.tabGroups.close(api.window.tabGroups.all.flatMap(group => group.tabs));
    }
    for (const file of snapshot.files.filter(file => file.kind === "file" && (snapshot.tabs.includes(file.id) || file.content !== file.saved))) {
      const document = await api.workspace.openTextDocument(uriFor(file.path));
      if (document.getText() !== file.content) {
        const edits = new api.WorkspaceEdit();
        edits.replace(document.uri, new api.Range(0, 0, document.lineCount, 0), file.content);
        await api.workspace.applyEdit(edits);
      }
      if (snapshot.tabs.includes(file.id)) await api.window.showTextDocument(document, { preview: false, preserveFocus: true });
    }
    const active = snapshot.files.find(file => file.id === snapshot.activeId);
    if (active) await api.window.showTextDocument(uriFor(active.path), { preview: false });
  } finally { restoring = false; flushChanges(); publishTabs(); }
}
async function synchronize(snapshot: WorkbenchSnapshot) {
  provider.refresh();
  if (snapshot.modelGeneration !== generation) {
    generation = snapshot.modelGeneration;
    await hydrate(snapshot, true);
  } else {
    restoring = true;
    try {
      for (const group of groupsService.groups) for (const input of [...group.editors]) {
        const path = input.resource && pathOf(input.resource);
        if (!path || snapshot.files.some(file => file.path === path && file.kind === "file")) continue;
        const old = previousSnapshot.files.find(file => file.path === path);
        const renamed = old && snapshot.files.find(file => file.id === old.id && file.kind === "file");
        if (renamed) {
          const document = await api.workspace.openTextDocument(uriFor(renamed.path));
          if (document.getText() !== renamed.content) {
            const edit = new api.WorkspaceEdit();
            edit.replace(document.uri, new api.Range(0, 0, document.lineCount, 0), renamed.content);
            await api.workspace.applyEdit(edit);
          }
          const control = activeEditor();
          const viewState = control?.getModel()?.uri.toString() === input.resource?.toString() ? control.saveViewState() : undefined;
          await editorService.replaceEditors([{ editor: input, replacement: { resource: uriFor(renamed.path), options: { pinned: true, preserveFocus: true, viewState: viewState || undefined } }, forceReplaceDirty: true }], group);
        } else {
          await editorService.revert({ editor: input, groupId: group.id }, { soft: true });
          await group.closeEditor(input, { preserveFocus: true });
        }
      }
      const active = snapshot.files.find(file => file.id === snapshot.activeId);
      if (active && pathOf(api.window.activeTextEditor?.document.uri || root) !== active.path) await api.window.showTextDocument(uriFor(active.path), { preview: false });
    } finally { restoring = false; flushChanges(); publishTabs(); }
  }
  previousSnapshot = structuredClone(snapshot);
}
await hydrate(host.snapshot());
await synchronize(host.snapshot());
const client: WorkbenchClient = {
  sync() { synchronization = synchronization.catch(() => {}).then(() => synchronize(host.snapshot())); return synchronization; },
  diagnostics(items) {
    problems = items; diagnostics.clear();
    const byFile = new Map<string, VSCode.Diagnostic[]>();
    for (const item of items) {
      const diagnostic = new api.Diagnostic(rangeFor(item), `${item.title}\n${item.description}\n${item.question}`, item.severity === "error" ? api.DiagnosticSeverity.Error : item.severity === "warning" ? api.DiagnosticSeverity.Warning : item.severity === "info" ? api.DiagnosticSeverity.Information : api.DiagnosticSeverity.Hint);
      diagnostic.source = "CodeMentor AI"; diagnostic.code = item.id;
      byFile.set(item.file, [...(byFile.get(item.file) || []), diagnostic]);
    }
    diagnostics.set([...byFile].map(([path, values]) => [uriFor(path), values]));
  },
  output(lines) { output.clear(); if (lines.length) output.appendLine(lines.join("\n")); },
  status(text) { status.text = `$(lightbulb) ${text}`; },
  async show(view) {
    if (view === "Output") { output.show(true); return; }
    if (view === "Problems") { await viewsService.openView("workbench.panel.markers.view", false); return; }
    await viewsService.openView(`codementor.${view === "chat" ? "mentor" : view.toLowerCase()}`, view === "chat");
    if (view === "chat") document.querySelector<HTMLTextAreaElement>(".mentor-chat textarea")?.focus();
  },
  editor: activeEditor,
  async save() { await api.window.activeTextEditor?.document.save(); }
};
window.codeMentorWorkbench = client;
host.ready(client);
window.addEventListener("unhandledrejection", event => host.error(event.reason instanceof Error ? event.reason.message : "A workbench operation failed. Your stored workspace is safe."));
