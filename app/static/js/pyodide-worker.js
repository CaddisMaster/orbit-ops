// Python in the browser (#53): a module worker that loads Pyodide from
// /pyodide/<version>/ (self-hosted, app/main.py; python.js passes the path as
// ?pyodide=, #92) and runs code sent by python.js.
// It's a worker so a long-running program can't freeze the page, and so the
// page can stop one by terminating it. Each run is ../py/challenge_runner.py's
// run(), the same procedure CI uses (#396): fresh globals preset with `inputs`,
// a fresh working directory holding `files`, then each of `checks`.
//
//   page → worker: { id, code, inputs: {name: string}, files: {path: string}, checks: [string] }
//   worker → page: { type: "ready", version }
//                  { type: "load-error", message }
//                  { type: "result", id, stdout, stderr, error, exit_code, checks: [bool] }
//                  error: the traceback, or null; exit_code: set if the code called sys.exit
const WORKDIR = "/home/pyodide/challenge";
let stdout = "";
let stderr = "";

// Raw writes, not Pyodide's line batching: that holds text with no newline back until a later run.
function sink(append) {
  const decoder = new TextDecoder();
  return {
    write(bytes) {
      append(decoder.decode(bytes, { stream: true }));
      return bytes.length;
    },
  };
}

function withoutLastNewline(text) {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

try {
  const indexURL = new URL(self.location.href).searchParams.get("pyodide") || "";
  if (!/^\/pyodide\/[\d.]+\/$/.test(indexURL)) throw new Error("No Pyodide path given.");
  const { loadPyodide } = await import(indexURL + "pyodide.mjs");
  const pyodide = await loadPyodide({ indexURL });
  pyodide.setStdout(sink((text) => { stdout += text; }));
  pyodide.setStderr(sink((text) => { stderr += text; }));
  // Nobody's there to type: input() gets end of file, as in a script run with nothing piped in.
  pyodide.setStdin({ stdin: () => null });

  // Versioned like this worker (#92).
  const response = await fetch(new URL("../py/challenge_runner.py" + self.location.search, self.location.href));
  if (!response.ok) throw new Error("Couldn't load the challenge runner.");
  const runner = pyodide.globals.get("dict")();
  pyodide.runPython(await response.text(), { globals: runner });
  const run = runner.get("run");

  self.onmessage = (event) => {
    const { id, code, inputs = {}, files = {}, checks = [] } = event.data;
    let reply;
    try {
      reply = JSON.parse(run(JSON.stringify({ workdir: WORKDIR, code, inputs, files, checks })));
    } catch (e) {
      reply = { error: String(e && e.message ? e.message : e), exit_code: null, checks: checks.map(() => false) };
    }
    self.postMessage({
      type: "result", id, stdout: withoutLastNewline(stdout), stderr: withoutLastNewline(stderr), ...reply,
    });
    stdout = "";
    stderr = "";
  };
  self.postMessage({ type: "ready", version: pyodide.version });
} catch (e) {
  self.postMessage({ type: "load-error", message: String(e && e.message ? e.message : e) });
}
