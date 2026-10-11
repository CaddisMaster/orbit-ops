// Python in the browser (#53): a module worker that loads Pyodide from
// /pyodide/ (self-hosted, app/main.py) and runs code sent by python.js.
// It's a worker so a long-running program can't freeze the page, and so the
// page can stop one by terminating it. Every run gets fresh globals.
//
//   page → worker: { id, code }
//   worker → page: { type: "ready", version }
//                  { type: "load-error", message }
//                  { type: "result", id, stdout, stderr, error }   error: the traceback, or null
import { loadPyodide } from "/pyodide/pyodide.mjs";

let stdout = [];
let stderr = [];

try {
  const pyodide = await loadPyodide({
    indexURL: "/pyodide/",
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
  });

  self.onmessage = async (event) => {
    const { id, code } = event.data;
    const globals = pyodide.globals.get("dict")();
    let error = null;
    try {
      await pyodide.runPythonAsync(code, { globals });
    } catch (e) {
      error = String(e && e.message ? e.message : e);
    } finally {
      globals.destroy();
    }
    self.postMessage({ type: "result", id, stdout: stdout.join("\n"), stderr: stderr.join("\n"), error });
    stdout = [];
    stderr = [];
  };
  self.postMessage({ type: "ready", version: pyodide.version });
} catch (e) {
  self.postMessage({ type: "load-error", message: String(e && e.message ? e.message : e) });
}
