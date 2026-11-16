---
# No console task: a lab (#408). The station console has no python3, and Pyodide has no network and
# no requests, so this runs on the learner's own machine, against a server the setup writes.
# requests==2.34.2 is module 10's pin (Python 3.10 or newer): move both together.
title: Talking to an API
minutes: 20
story: |
  **Mission log, day 54.** The depot's manifest service answers over HTTP, and the bay reads it the
  slow way: someone opens it, copies the crates onto a form, and types them in again downstairs. Last
  week the service went quiet for an hour, and the script someone tried sat waiting the whole time.
  "Read it with a program," says Okafor. "One that knows when to stop waiting."
quiz:
  - type: choice
    q: "A cron job runs this every five minutes. One night the server accepts the connection and never answers. What happens?"
    code: |-
      import requests

      response = requests.get("http://10.4.0.20/levels")
      print(response.status_code)
    lang: python
    options:
      - "`get` gives up after a few seconds and raises `requests.exceptions.Timeout`"
      - "It prints `504`, the status code for a server that took too long"
      - "It waits for ever, and every new run starts another one that waits too"
      - "cron sees the job take too long and stops it before the next one starts"
    answer: 2
    explain: >-
      `requests` has no timeout of its own, so without `timeout=` it waits for a reply for ever. cron
      doesn't stop jobs, so they pile up. With `timeout=10`, the same night ends in a `Timeout` after
      ten seconds of silence.
  - type: choice
    q: "The URL has a typo, and the server answers `404 Not Found`. What does this print?"
    code: |-
      response = requests.get(url, timeout=5)
      print(response.status_code)
    lang: python
    options:
      - "`404`: a 404 is still a reply, so `get` raises nothing"
      - "Nothing: `get` raises `requests.exceptions.HTTPError` first"
      - "`200`: the request itself worked, whatever the server said"
      - "`None`: there's no status code until `raise_for_status()` is called"
    answer: 0
    explain: >-
      `get` raises only when no reply comes: nothing listening, or the timeout. Any status code comes
      back in a response, and `raise_for_status()` is what turns 400 and up into an `HTTPError`.
  - type: choice
    q: "With the server stopped, this still stops with a traceback ending in `requests.exceptions.ConnectionError`. Why?"
    code: |-
      try:
          response = requests.get(url, timeout=5)
      except ConnectionError:
          print("depot: not answering")
    lang: python
    options:
      - "A `try` can't catch errors raised inside a library, only your own"
      - "The server is stopped, so the error is a `Timeout`, not a `ConnectionError`"
      - "`except` needs `as error` before it catches anything at all"
      - "That's Python's own `ConnectionError`, a different error from `requests`'"
    answer: 3
    explain: >-
      `requests` has its own error with the same name. Python's built-in `ConnectionError` doesn't
      catch it, so write `except requests.exceptions.ConnectionError:` in full.
  - type: fill
    q: "Which method of a response raises `HTTPError` when its status code is 400 or more?"
    answer: ["raise_for_status", "raise_for_status()", ".raise_for_status()", "response.raise_for_status()"]
    explain: >-
      `response.raise_for_status()`. It does nothing for a success, so call it before `.json()`.
  - type: choice
    q: "A 200 MB download takes three minutes with `timeout=10`. Why doesn't it raise `Timeout`?"
    options:
      - "`timeout` only counts while connecting, and never once data arrives"
      - "The timeout is for silence: it raises only after 10 seconds with nothing arriving"
      - "A large download turns the timeout off, so it doesn't stop a file halfway"
      - "It does raise it, after ten seconds, so the download never finishes"
    answer: 1
    explain: >-
      The timeout counts from the last thing the server sent, so a reply that keeps arriving never runs
      out of time. It's a limit on waiting, not on the whole download.
cards:
  - id: always-a-timeout
    section: "`timeout`: never leave it out"
    front: What does `requests.get(url)` do if the server never answers?
    back: "It waits for ever: `requests` has no timeout of its own. Always pass `timeout=`."
  - id: a-404-is-a-reply
    section: "A reply isn't success: `raise_for_status`"
    front: Does `requests.get` raise an error for a `404`?
    back: "No. Any reply comes back as a response. `response.raise_for_status()` raises `HTTPError` for 400 and up."
  - id: four-failures
    section: "Four ways it goes wrong"
    front: "Nothing listening, no reply in time, a 404: which error does each give?"
    back: "`requests.exceptions.ConnectionError` and `requests.exceptions.Timeout` from `get`, and `requests.exceptions.HTTPError` from `raise_for_status()`."
  - id: not-pythons-connectionerror
    section: "Four ways it goes wrong"
    front: Why doesn't `except ConnectionError:` catch a refused `requests.get`?
    back: "`requests` has its own `ConnectionError`. Write `except requests.exceptions.ConnectionError:` in full."
lab:
  from: okafor
  task: |-
    Read the depot's manifests with a script that copes with each way the depot can let you down. The
    setup writes `depot.py`, a small stand-in for the depot's service that runs on your own machine.
    On Windows, do all of it in Git Bash (Unit 1.3, *Your first repository*), and use `python` or `py`
    wherever a step says `python3`.

    1. Check `python3 --version`: `requests` 2.34.2 needs **Python 3.10 or newer**, as in module 10.
    2. Run the setup below. It makes `~/meridian/depot-api` with `depot.py` in it. Stay in that folder.
    3. Open a **second terminal**: a new window or tab of the same terminal app, or on Windows a second
       Git Bash window. There, `cd ~/meridian/depot-api` and run `python3 depot.py`. It uses only the
       standard library, so it needs no venv. It says it's answering on `http://127.0.0.1:8765`, then
       prints a line for each request it gets, ending in its status code, such as
       `"GET /manifests/34 HTTP/1.1" 200 -`. When a slow reply is finally ready and the script has
       stopped waiting, it says `nobody was waiting for that reply`: that's expected. Leave it running.
    4. Back in the first terminal, make a venv called `.venv`, activate it, and install `requests` at
       exactly version **`2.34.2`** (module 10).
    5. Write `fetch_manifest.py`, with a `main()` and the main guard (module 06). For each of `34`, `99`
       and `latest`, in that order, `get` the URL `http://127.0.0.1:8765/manifests/` with that name on
       the end, with a **timeout of 2 seconds**, and print what happened, starting each line with the
       name and a colon:
       - no reply in time: `NAME: Timeout`
       - nothing answering: `NAME: ConnectionError`
       - a reply: `NAME: status` then its status code. Then call `raise_for_status()`. If it raises,
         print `NAME: HTTPError` then the error. If not, read the body as JSON: a manifest is a dict
         whose `"crates"` key holds a list of dicts, each with an `"id"`, as in module 07. Print
         `NAME: crates` then a list of the crates' ids, in order.

       `NAME` is `34`, `99` or `latest`. Separate each label and its value with a comma, as in
       `print(f"{name}: status", response.status_code)`, so there's one space between them.
    6. With the depot running, run `python fetch_manifest.py`, and paste what it prints. It takes
       about two seconds.
    7. In the second terminal, stop the depot with **Ctrl-C**. Run the script again, and paste what it
       prints.
    8. Paste what `cat fetch_manifest.py` prints.
  setup: |-
    mkdir -p ~/meridian/depot-api && cd ~/meridian/depot-api
    cat > depot.py <<'PY'
    import json
    import time
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    RUN_34 = {"run": 34, "date": "2026-10-07", "crates": [{"id": "C-331", "mass": 22.0}, {"id": "C-332", "mass": 8.5}, {"id": "C-333", "mass": 40.0}]}


    class Depot(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/manifests/latest":
                time.sleep(10)
            if self.path in ("/manifests/34", "/manifests/latest"):
                self.reply(200, RUN_34)
            else:
                self.reply(404, {"error": "no such manifest"})

        def reply(self, status, data):
            body = json.dumps(data).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                self.log_message("%s", "nobody was waiting for that reply")


    print("depot: answering on http://127.0.0.1:8765 (Ctrl-C stops it)", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", 8765), Depot).serve_forever()
    except KeyboardInterrupt:
        print("\ndepot: stopped")
    PY
  boxes:
    - prompt: What `python fetch_manifest.py` prints, with the depot running.
      checks:
        - {contains: "34: status 200", says: "Run 34's manifest came back with 200", hint: "Is the depot running in the other terminal, and is the URL exactly as the task gives it?"}
        - {contains: "34: crates ['C-331', 'C-332', 'C-333']", says: "Its crates, read from the JSON", hint: "Which key of the manifest holds the crates, and which key of each crate is its id?"}
        - {contains: "99: status 404", says: "Run 99 isn't there, and the 404 came back as a reply"}
        - {regex: '^99: HTTPError 404 Client Error: Not Found for url: http://127\.0\.0\.1:8765/manifests/99$', says: "raise_for_status raised HTTPError for the 404, and it was caught", hint: "A 404 raises nothing by itself. Which call turns it into an error?"}
        - {regex: '^latest: Timeout$', says: "The slow reply was given up on after 2 seconds", hint: "No latest line at all? A return inside the loop ends main. latest: status 200 instead means the script waited the whole 10 seconds: what tells get how long to wait?"}
        - {not_contains: "Traceback", says: "No traceback: every failure is handled"}
        - {lines: {min: 5, max: 5}, says: "Five lines and nothing else"}
      example: |
        34: status 200
        34: crates ['C-331', 'C-332', 'C-333']
        99: status 404
        99: HTTPError 404 Client Error: Not Found for url: http://127.0.0.1:8765/manifests/99
        latest: Timeout
    - prompt: What the script prints after the depot is stopped.
      checks:
        - {regex: '^34: (ConnectionError|Timeout)$', says: "Nothing answered for run 34, and the script said so", hint: "A traceback ending in requests.exceptions.ConnectionError means the except caught a different ConnectionError. Which one did it name?"}
        - {regex: '^99: (ConnectionError|Timeout)$', says: "Nor for run 99"}
        - {regex: '^latest: (ConnectionError|Timeout)$', says: "Nor for latest"}
        - {not_contains: "status", says: "The depot was stopped: no replies at all", hint: "Was the depot stopped with Ctrl-C before this run?"}
        - {not_contains: "Traceback", says: "No traceback: a stopped depot is handled too"}
      example: |
        34: ConnectionError
        99: ConnectionError
        latest: ConnectionError
    - prompt: What `cat fetch_manifest.py` prints.
      checks:
        - {contains: "requests.get(", says: "The fetch uses requests.get"}
        - {regex: 'timeout\s*=\s*2\b', says: "with a timeout of 2 seconds"}
        - {contains: "status_code", says: "The status code is read from the response"}
        - {contains: "raise_for_status()", says: "raise_for_status turns 400 and up into an error"}
        - {contains: ".json()", says: "The body is read as JSON"}
        - {regex: 'except requests\.(exceptions\.)?Timeout\b', says: "Timeout is caught by name"}
        - {regex: 'except requests\.(exceptions\.)?ConnectionError\b', says: "requests' own ConnectionError is caught by name", hint: "Python has a ConnectionError of its own. Which one does requests raise?"}
        - {regex: 'except requests\.(exceptions\.)?HTTPError\b', says: "HTTPError is caught by name"}
        - {regex: '__name__\s*==\s*["'']__main__["'']', says: "The script has the main guard", hint: "Module 06's last two lines: is main run through the guard?"}
      example: |
        import requests

        BASE = "http://127.0.0.1:8765/manifests/"


        def fetch(name):
            try:
                response = requests.get(BASE + name, timeout=2)
            except requests.exceptions.Timeout:
                print(f"{name}: Timeout")
                return
            except requests.exceptions.ConnectionError:
                print(f"{name}: ConnectionError")
                return
            print(f"{name}: status", response.status_code)
            try:
                response.raise_for_status()
            except requests.exceptions.HTTPError as error:
                print(f"{name}: HTTPError", error)
                return
            manifest = response.json()
            crates = []
            for crate in manifest["crates"]:
                crates.append(crate["id"])
            print(f"{name}: crates", crates)


        def main():
            for name in ["34", "99", "latest"]:
                fetch(name)


        if __name__ == "__main__":
            main()
comms:
  open:
    - {from: meridian, text: "DEPOT MANIFEST SERVICE · HTTP · READ BY: HAND · LAST WEEK: SILENT 61 MIN"}
    - {from: okafor, text: "The depot puts every manifest on a service, and we copy them off a screen. Then somebody types them in again."}
    - {from: okafor, text: "Read it with a script. And when the depot goes quiet like last week, the script gives up and says so. It doesn't sit there for an hour."}
  lab_done:
    - {from: meridian, text: "MANIFEST 34 · CRATES: 3 · RUN 99: 404 HANDLED · LATEST: GAVE UP AFTER 2 S · DEPOT DOWN: HANDLED"}
    - {from: okafor, text: "Four answers, and the script knew each one for what it was. A missing run isn't a dead depot, and a slow one isn't either."}
  complete:
    - {from: okafor, text: "It gives up properly now. Tomorrow it learns when to try again, and it writes down what it did."}
---

## `requests`: HTTP from Python

In Networking you asked servers for things with `curl` (*HTTP by hand*) and read their JSON with `jq`
(*APIs and JSON*). **`requests` is the library Python scripts use for the same job.** It isn't in the
standard library: it's a package from PyPI, so **install it in a venv (module 10) at an exact
version, with `pip install requests==2.34.2`**. That version needs **Python 3.10 or newer**, and a
Mac's own `python3` can be 3.9: install a current one from python.org first.

```python
import requests

response = requests.get("http://127.0.0.1:8000/tanks/T-4", timeout=5)
print(response.status_code)
print(response.json())
```

```text
200
{'tank': 'T-4', 'level': 3.5}
```

**`requests.get(URL, timeout=SECONDS)` sends a GET request and gives back a response** once the reply
has arrived. **`.status_code` is the reply's status code as a number**, the same codes as Networking's:
`200`, `404`, `500`. **`.json()` reads the body as JSON** and gives back Python values, as `json.loads`
did in module 07: a dict here. `.text` is the body as plain text.

## `timeout`: never leave it out

**`requests` has no timeout of its own: without one, it waits for a reply for ever.** A server that
takes the connection and then hangs hangs your script with it. **cron doesn't stop a job that
hangs**, so it's still hanging when the next one starts.

**`timeout=2` means: give up if nothing arrives for 2 seconds.** It counts from the last thing the
server sent, so it isn't a limit on a long download as a whole, only on silence.

**An exception is Python's other word for an error, and `requests` keeps its own in
`requests.exceptions`**, which comes with `import requests`. **When the time runs out, `get` raises
`requests.exceptions.Timeout`**, and there's no response at all. **A traceback names the kind:
`ReadTimeout` when the server went quiet after connecting, `ConnectTimeout` when connecting took too
long. Both are kinds of `Timeout`, and `except requests.exceptions.Timeout:` catches both.**

Pick what the job can afford: a few seconds when a person is waiting, longer for a nightly job. Never
none.

## A reply isn't success: `raise_for_status`

**A `404` or a `500` is still a reply, so `get` raises nothing.** It comes back as a response like any
other, with its code in `.status_code`. A script that goes straight to `.json()` reads the error:
as if it were the data when the error's body is JSON, and with a `JSONDecodeError` when it's a web
page.

**`.raise_for_status()` raises `requests.exceptions.HTTPError` when the status code is 400 or more**,
and does nothing for a success, so **call it before `.json()`**. **The error's message says what came
back, and from where**:

```text
404 Client Error: Not Found for url: http://127.0.0.1:8000/tanks/T-9
```

`Not Found` is the reason the server sent with its code, so another server may word it differently.

## Four ways it goes wrong

| What happened | Raised by | What you get |
|---|---|---|
| nothing is listening there, or the name doesn't resolve | `get` | **`requests.exceptions.ConnectionError`** |
| no reply within the timeout | `get` | **`requests.exceptions.Timeout`** |
| a reply, with a status code of 400 or more | `raise_for_status()` | **`requests.exceptions.HTTPError`** |
| a reply whose body isn't JSON | `.json()` | `requests.exceptions.JSONDecodeError` |

**The first two mean there's no response**, so put `get` alone inside a `try`, as in module 06.
**One `try` can have several `except` lines, one for each error**, and the one that names the error
runs. **Leave the function in each, with `return`**: there's no `response` to carry on with.

```python
try:
    response = requests.get(url, timeout=5)
except requests.exceptions.Timeout:
    print("tanks: no reply in 5 s", file=sys.stderr)
    return 1
except requests.exceptions.ConnectionError:
    print("tanks: nothing answering", file=sys.stderr)
    return 1
```

**`raise_for_status()` gets a `try` of its own, after that one**, with `except
requests.exceptions.HTTPError as error:`, so a 404 is told apart from no reply at all.

**A bare `return`, with no value, leaves the function with `None`.** **Inside a loop, `return` ends
the whole function, and every item after it is skipped.** So when a loop fetches several things, give
one fetch a function of its own, and call it from the loop: each `return` then ends only that fetch.

**Write `requests.exceptions.ConnectionError` in full. Python's own `ConnectionError` is a different
error, and `except ConnectionError:` doesn't catch `requests`'.** The script stops with a traceback
that ends `requests.exceptions.ConnectionError: …`, after a long message about retries.

**Each one is a different problem.** A 404 says the address is wrong, so trying again won't help. A
`Timeout` or a `ConnectionError` may clear up in a minute, which is the next module's job.

**On the real station:** this course asks Claude for your hints over HTTP, through the `anthropic`
library, which waits up to ten minutes for a reply unless told otherwise. `client()` in `app/ai.py`
passes `timeout=30.0`, under the comment `A learner is waiting on the page: fail in seconds, not the
SDK's 10 minutes.`

## Try it

On a Mac or Linux machine with Python 3.10 or newer. On Ubuntu, `python3-venv` first, as in module 10.
On Windows, in Git Bash, type `Scripts` for `bin` and `python` for `python3`.

```bash
cd "$(mktemp -d)"
python3 -m venv .venv
source .venv/bin/activate
pip install -q requests==2.34.2
echo '{"crates": ["C-401", "C-402"]}' > crates.json
python -m http.server 8000 --bind 127.0.0.1 > server.log 2>&1 &
sleep 1
python -c 'import requests; r = requests.get("http://127.0.0.1:8000/crates.json", timeout=2); print(r.status_code, r.json()["crates"])'
python -c 'import requests; r = requests.get("http://127.0.0.1:8000/nope.json", timeout=2); print(r.status_code); r.raise_for_status()'
python -c 'import requests; requests.get("http://127.0.0.1:8000/nope.json", timeout=2).json()'
kill $!
python -c 'import requests; requests.get("http://127.0.0.1:8000/crates.json", timeout=2)'
python -c 'import socket, time; s = socket.create_server(("127.0.0.1", 8001)); time.sleep(30)' &
sleep 1
python -c 'import requests; requests.get("http://127.0.0.1:8001/", timeout=2)'
kill $!
```

`python -m http.server` is the standard library's own web server, serving the folder's files, and
`&` runs it in the background (Unit 1.1, *Processes and signals*). `$!` holds the PID of the last
thing started that way, so `kill $!` stops it. Inside `python -c '…'`, a `;` separates two Python
statements on one line, as in module 08's lab.

| Command | Prints |
|---|---|
| `crates.json` | `200 ['C-401', 'C-402']` |
| `nope.json` | `404`, then a traceback ending `HTTPError: 404 Client Error: File not found for url: …`: this server's own words |
| `nope.json` with `.json()` | a traceback ending `JSONDecodeError`: the 404's body is a web page, not JSON |
| after the first `kill` | a traceback ending `requests.exceptions.ConnectionError: …` |
| port `8001` | after 2 seconds, a traceback ending `requests.exceptions.ReadTimeout: …`, one kind of `Timeout` |

The last four fail on purpose. Port 8001 is a socket that takes connections and never answers.
