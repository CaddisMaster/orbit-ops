"""Run a challenge once: the learner's code, then its checks (#54, #396).

The one procedure, used in both places a challenge runs: pyodide-worker.js fetches this file for
the learner's browser, and app/challenge.py imports it for CI. So keep it to the standard library,
and to what Pyodide can do. The server never runs learner code with it: run_in_cpython is for
reference code from content/, in tests.

Each run gets a fresh namespace, working directory and argv, so nothing carries over from the last.
"""

import json
import linecache
import os
import shutil
import sys
import traceback

SCRIPT = "script.py"  # what a traceback and argparse's usage call the learner's code


def _prepare(workdir, files):
    os.chdir("/")  # the last run may have left us inside what's about to go
    shutil.rmtree(workdir, ignore_errors=True)
    os.makedirs(workdir)
    os.chdir(workdir)
    for path, contents in files.items():
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w", encoding="utf-8") as file:
            file.write(contents)


def _exit_code(stop):
    """What the shell's $? would be, as Python itself decides it."""
    if stop.code is None:
        return 0
    if isinstance(stop.code, int):
        return stop.code
    print(stop.code, file=sys.stderr)
    return 1


def _run_code(code, namespace):
    """(the exit code or None, the traceback or None)."""
    # The source isn't a file on disk, so tell the traceback module its lines. mtime None: don't recheck.
    lines = code.splitlines(keepends=True)
    linecache.cache[SCRIPT] = (len(code), None, lines, SCRIPT)
    try:
        exec(compile(code, SCRIPT, "exec"), namespace)  # noqa: S102 (in the learner's browser, or reference code in CI)
    except SystemExit as stop:
        return _exit_code(stop), None
    except BaseException as error:  # noqa: BLE001 (anything the learner's code raises is theirs to read)
        # tb_next leaves out this function's frame. A SyntaxError has no frame of the learner's to show.
        tb = error.__traceback__.tb_next if error.__traceback__ else None
        return None, "".join(traceback.format_exception(type(error), error, tb)).rstrip("\n")
    return None, None


def _run_check(check, namespace):
    try:
        exec(compile(check, "<check>", "exec"), namespace)  # noqa: S102
    except BaseException:  # noqa: BLE001 (a check that exits has not passed)
        return False
    return True


def _restore_streams():
    sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__
    sys.stdout.flush()
    sys.stderr.flush()


def run(request):
    """Takes and returns JSON, so the browser has no Python objects to manage.

    request: {workdir, code, inputs: {name: text}, files: {path: text}, checks: [statement]}
    returns: {error: traceback or null, exit_code: int or null, checks: [bool]}
    An exception in the code fails every check. Exiting doesn't: a script may exit on purpose.
    """
    spec = json.loads(request)
    sys.argv = [SCRIPT]
    _prepare(spec["workdir"], spec["files"])
    namespace = {"__name__": "__main__", **spec["inputs"]}
    exit_code, error = _run_code(spec["code"], namespace)
    if error:
        checks = [False] * len(spec["checks"])
    else:
        namespace["__exit_code__"] = exit_code  # None if the code ran off its end
        checks = [_run_check(check, namespace) for check in spec["checks"]]
    _restore_streams()  # the learner's code may have replaced them
    return json.dumps({"error": error, "exit_code": exit_code, "checks": checks})
