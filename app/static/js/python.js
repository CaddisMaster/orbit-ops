// The page's side of Python in the browser (#53). Nothing is loaded until
// the first run: then a worker (pyodide-worker.js) loads Pyodide, which takes
// a few seconds once and is cached by the browser after that.
//
//   OrbitPython.run(code, { inputs, checks }) → Promise<{ stdout, stderr, error, checks, timedOut }>
//
// inputs: variables to preset ({name: string}); checks: Python statements run
// after the code, each reported as passed or not (#54). Both optional.
//
// A run that takes longer than RUN_TIMEOUT_MS is stopped by terminating the
// worker (an infinite loop can't be interrupted any other way); the next run
// starts a fresh one. One run at a time.
(function () {
  "use strict";

  var RUN_TIMEOUT_MS = 5000;
  var LOAD_TIMEOUT_MS = 60000;
  var workerUrl = new URL("pyodide-worker.js", document.currentScript.src).href;
  var worker = null;
  var ready = null;  // a Promise, resolved when Pyodide has loaded in `worker`
  var busy = false;
  var seq = 0;

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    ready = null;
  }

  function start() {
    worker = new Worker(workerUrl, { type: "module" });
    var w = worker;
    ready = new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("Python took too long to load.")); }, LOAD_TIMEOUT_MS);
      w.addEventListener("message", function onLoad(event) {
        if (event.data.type === "ready") { clearTimeout(timer); w.removeEventListener("message", onLoad); resolve(); }
        if (event.data.type === "load-error") { clearTimeout(timer); reject(new Error(event.data.message)); }
      });
      w.addEventListener("error", function (event) { clearTimeout(timer); reject(new Error(event.message || "Python failed to load.")); });
    });
    ready.catch(stop);
    return ready;
  }

  function run(code, options) {
    var opts = options || {};
    if (busy) return Promise.reject(new Error("Python is already running."));
    busy = true;
    var loading = ready || start();
    return loading.then(function () {
      var w = worker;
      var id = ++seq;
      return new Promise(function (resolve) {
        var timer = setTimeout(function () {
          w.removeEventListener("message", onResult);
          stop();
          resolve({ stdout: "", stderr: "", error: null, checks: [], timedOut: true });
        }, RUN_TIMEOUT_MS);
        function onResult(event) {
          if (event.data.type !== "result" || event.data.id !== id) return;
          clearTimeout(timer);
          w.removeEventListener("message", onResult);
          resolve({
            stdout: event.data.stdout, stderr: event.data.stderr, error: event.data.error,
            checks: event.data.checks, timedOut: false,
          });
        }
        w.addEventListener("message", onResult);
        w.postMessage({ id: id, code: code, inputs: opts.inputs || {}, checks: opts.checks || [] });
      });
    }).finally(function () { busy = false; });
  }

  window.OrbitPython = { run: run, RUN_TIMEOUT_MS: RUN_TIMEOUT_MS };
})();
