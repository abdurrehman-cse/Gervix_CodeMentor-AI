import { Emitter, Event } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { FileChangeType, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, type IFileChange, type IFileSystemProviderWithFileReadWriteCapability, type IFileWriteOptions, type IStat } from "@codingame/monaco-vscode-files-service-override";
import type { WorkbenchHost, WorkbenchSnapshot } from "../../lib/workbench-bridge";
export const root = URI.file("/workspace");
export function pathOf(uri: URI) { return uri.scheme === "file" && uri.path.startsWith("/workspace/") ? uri.path.slice(11) : ""; }
export function uriFor(path: string) { return URI.file(`/workspace/${path}`); }
export class WorkspaceProvider implements IFileSystemProviderWithFileReadWriteCapability {
  readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
  readonly onDidChangeCapabilities = Event.None;
  private changes = new Emitter<readonly IFileChange[]>();
  readonly onDidChangeFile = this.changes.event;
  private last: WorkbenchSnapshot;
  constructor(private host: WorkbenchHost) { this.last = structuredClone(host.snapshot()); }
  watch() { return { dispose() {} }; }
  private node(uri: URI) {
    const node = this.host.snapshot().files.find(file => file.path === pathOf(uri));
    if (!node) throw FileSystemProviderError.create("File not found.", FileSystemProviderErrorCode.FileNotFound);
    return node;
  }
  async stat(uri: URI): Promise<IStat> {
    if (uri.toString() === root.toString()) return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    const node = this.node(uri);
    return { type: node.kind === "folder" ? FileType.Directory : FileType.File, ctime: 0, mtime: 0, size: new TextEncoder().encode(node.saved).length };
  }
  async readdir(uri: URI): Promise<[string, FileType][]> {
    const path = uri.toString() === root.toString() ? "" : this.node(uri).path;
    return this.host.snapshot().files.filter(file => file.path.split("/").slice(0, -1).join("/") === path).map(file => [file.path.split("/").at(-1)!, file.kind === "folder" ? FileType.Directory : FileType.File]);
  }
  async readFile(uri: URI) { return new TextEncoder().encode(this.node(uri).saved); }
  async writeFile(uri: URI, content: Uint8Array, options: IFileWriteOptions) {
    const path = pathOf(uri);
    const exists = this.host.snapshot().files.some(file => file.path === path);
    if (!exists && !options.create) throw FileSystemProviderError.create("File not found.", FileSystemProviderErrorCode.FileNotFound);
    this.apply({ type: "write", path, content: new TextDecoder().decode(content), overwrite: options.overwrite });
    this.host.saved(path);
  }
  async mkdir(uri: URI) { this.apply({ type: "mkdir", path: pathOf(uri) }); }
  async delete(uri: URI) { this.apply({ type: "delete", path: pathOf(uri) }); }
  async rename(from: URI, to: URI) { this.apply({ type: "rename", path: pathOf(from), target: pathOf(to) }); }
  private apply(operation: Parameters<WorkbenchHost["mutate"]>[0]) {
    const result = this.host.mutate(operation);
    if (!result.ok) throw FileSystemProviderError.create(result.error || "Workspace operation failed.", FileSystemProviderErrorCode.Unknown);
    this.refresh();
  }
  refresh() {
    const next = this.host.snapshot();
    const events: IFileChange[] = [];
    for (const old of this.last.files) if (!next.files.some(file => file.path === old.path)) events.push({ type: FileChangeType.DELETED, resource: uriFor(old.path) });
    for (const file of next.files) {
      const previous = this.last.files.find(old => old.path === file.path);
      if (!previous) events.push({ type: FileChangeType.ADDED, resource: uriFor(file.path) });
      else if (previous.saved !== file.saved) events.push({ type: FileChangeType.UPDATED, resource: uriFor(file.path) });
    }
    this.last = structuredClone(next);
    if (events.length) this.changes.fire(events);
  }
}
