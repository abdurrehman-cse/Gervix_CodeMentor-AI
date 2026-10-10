import type { TestCase, TestResult } from "./types";
export class ExecutionError extends Error {
  constructor(message: string, public output: string[] = []) { super(message); this.name = "ExecutionError"; }
}
export async function runCode(code: string, filename: string, tests: TestCase[] = [], signal?: AbortSignal): Promise<{ output: string[]; results: TestResult[] }> {
  if (tests.some(test => !/^[A-Za-z_$][\w$]*$/.test(test.functionName))) throw new Error("Test function names must be valid identifiers.");
  const response = await fetch("/api/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, filename }), signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]) });
  const compiled = await response.json();
  if (!response.ok) throw new Error(compiled.error || "Unable to prepare code.");
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Execution cancelled.")); return; }
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.sandbox.add("allow-scripts");
    const token = crypto.randomUUID();
    const workerSource = `self.onmessage = async ({data}) => {
      const output = []; const results = [];
      const send = self.postMessage.bind(self);
      self.postMessage = () => {};
      if (typeof DedicatedWorkerGlobalScope !== 'undefined') DedicatedWorkerGlobalScope.prototype.postMessage = () => {};
      const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
      const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value, (_, item) => typeof item === 'number' && !Number.isFinite(item) ? String(item) : item) ?? String(value); } catch { return String(value); } };
      const log = (...values) => { if (output.length < 100) output.push(values.map(format).join(' ').slice(0, 2000)); };
      const equal = (left, right) => { if (Object.is(left, right)) return true; if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false; const keys = Object.keys(left); return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key])); };
      try {
        if (!data.tests.length) { await new AsyncFunction('console', data.code)({log, warn: log, error: log, info: log}); }
        for (const test of data.tests) {
          try {
            const fn = await new AsyncFunction('console', data.code + '\\n;return typeof ' + test.functionName + ' === "function" ? ' + test.functionName + ' : null;')({log, warn: log, error: log, info: log});
            if (!fn) throw new Error('Function not found: ' + test.functionName);
            const received = await fn(...test.args);
            results.push({id: test.id, passed: equal(received, test.expected), received: format(received).slice(0, 4000)});
          } catch (error) { results.push({id: test.id, passed: false, received: '', error: String(error.message || 'Execution failed').slice(0, 500)}); }
        }
        send({output, results});
      } catch (error) { send({error: String(error.message || 'Execution failed').slice(0, 500), output}); }
    };`;
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'"><script>const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], {type:'text/javascript'}))); worker.onmessage = event => parent.postMessage({token:${JSON.stringify(token)}, result:event.data}, '*'); worker.onerror = () => parent.postMessage({token:${JSON.stringify(token)}, result:{error:'Code could not run in the isolated worker.'}}, '*'); window.onmessage = event => { if(event.source === parent) worker.postMessage(event.data); }; parent.postMessage({token:${JSON.stringify(token)}, ready:true}, '*');<\/script>`;
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); signal?.removeEventListener("abort", cancel); frame.remove(); };
    const cancel = () => { cleanup(); reject(new Error("Execution cancelled.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Execution stopped after 3 seconds. Check for an infinite loop or reduce the input.")); }, 3000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.token !== token) return;
      if (event.data.ready) { frame.contentWindow?.postMessage({ code: compiled.code, tests }, "*"); return; }
      cleanup();
      if (event.data.result?.error) reject(new ExecutionError(event.data.result.error, Array.isArray(event.data.result.output) ? event.data.result.output : []));
      else if (Array.isArray(event.data.result?.output) && Array.isArray(event.data.result?.results)) resolve(event.data.result);
      else reject(new Error("The runner returned an invalid result."));
    };
    window.addEventListener("message", receive);
    signal?.addEventListener("abort", cancel, { once: true });
    document.body.appendChild(frame);
  });
}
