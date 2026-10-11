// Python in the browser (#53): a module worker that loads Pyodide from
// /pyodide/ (self-hosted, app/main.py) and runs code sent by python.js.
// It's a worker so a long-running program can't freeze the page, and so the
// page can stop one by terminating it. Every run gets fresh globals, preset
// with `inputs` (#54). After the code, each of `checks` runs in the same
// globals; a check passes if it raises nothing (they're usually asserts).
//
//   page → worker: { id, code, inputs: {name: string}, checks: [string] }
//   worker → page: { type: "ready", version }
//                  { type: "load-error", message }
//                  { type: "result", id, stdout, stderr, error, checks: [bool] }
//                  error: the traceback, or null; checks: all false if the code raised
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
    const { id, code, inputs = {}, checks = [] } = event.data;
    const globals = pyodide.globals.get("dict")();
    for (const [name, value] of Object.entries(inputs)) globals.set(name, value);
    let error = null;
    const passed = [];
    try {
      await pyodide.runPythonAsync(code, { globals });
      for (const check of checks) {
        try {
          await pyodide.runPythonAsync(check, { globals });
          passed.push(true);
        } catch {
          passed.push(false);
        }
      }
    } catch (e) {
      error = String(e && e.message ? e.message : e);
      checks.forEach(() => passed.push(false));
    } finally {
      globals.destroy();
    }
    self.postMessage({
      type: "result", id, stdout: stdout.join("\n"), stderr: stderr.join("\n"), error, checks: passed,
    });
    stdout = [];
    stderr = [];
  };
  self.postMessage({ type: "ready", version: pyodide.version });
} catch (e) {
  self.postMessage({ type: "load-error", message: String(e && e.message ? e.message : e) });
}
