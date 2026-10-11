"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WorkbenchClient, WorkbenchHost, WorkbenchMounts, WorkbenchSnapshot } from "../../lib/workbench-bridge";
import type { Problem } from "../../lib/types";
type Props = { host: Omit<WorkbenchHost, "ready" | "mounts">; snapshot: WorkbenchSnapshot; problems: Problem[]; output: string[]; status: string; panel: string; mentor: ReactNode; tests: ReactNode; complexity: ReactNode; onReady: (client: WorkbenchClient) => void };
export default function RealWorkbench(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [source, setSource] = useState("");
  const [client, setClient] = useState<WorkbenchClient>();
  const [mounts, setMounts] = useState<WorkbenchMounts>({});
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const bridge: WorkbenchHost = {
      snapshot: () => latest.current.host.snapshot(), mutate: operation => latest.current.host.mutate(operation),
      tabs: (paths, path) => latest.current.host.tabs(paths, path), selection: (selection, line) => latest.current.host.selection(selection, line),
      action: (action, id) => latest.current.host.action(action, id), saved: path => latest.current.host.saved(path),
      error: message => latest.current.host.error(message), mounts: setMounts,
      ready: next => { setClient(next); latest.current.onReady(next); }
    };
    window.codeMentorHost = bridge;
    setSource("/ide/index.html");
    const timeout = setTimeout(() => { if (!document.querySelector<HTMLIFrameElement>(".real-workbench")?.contentWindow?.codeMentorWorkbench) setFailure("Workbench could not start. Rebuild its bundle or open the classic workspace; your files and history are unchanged."); }, 90000);
    return () => { clearTimeout(timeout); if (window.codeMentorHost === bridge) delete window.codeMentorHost; };
  }, []);
  useEffect(() => { if (client) void client.sync(props.snapshot).catch(() => latest.current.host.error("The workbench could not synchronize this workspace change. Your stored files are safe.")); }, [client, props.snapshot.files, props.snapshot.tabs, props.snapshot.activeId, props.snapshot.modelGeneration]);
  useEffect(() => { client?.diagnostics(props.problems); }, [client, props.problems]);
  useEffect(() => { client?.output(props.output); }, [client, props.output]);
  useEffect(() => { client?.status(props.status); }, [client, props.status]);
  useEffect(() => { if (client) void client.show(props.panel).catch(() => latest.current.host.error("This workbench panel could not open.")); }, [client, props.panel]);
  return <div className="real-workbench-shell">{source && <iframe className="real-workbench" src={source} title="CodeMentor VS Code workbench"/>}{!client && <div className="workbench-loading" role="status">{failure || "Starting the VS Code workbench…"}{failure && <a href="/?classic">Open classic workspace</a>}</div>}{mounts.mentor && createPortal(props.mentor, mounts.mentor)}{mounts.tests && createPortal(props.tests, mounts.tests)}{mounts.complexity && createPortal(props.complexity, mounts.complexity)}</div>;
}
