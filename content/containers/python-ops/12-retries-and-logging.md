---
# No console task: a lab (#409), the unit's capstone. The station console has no python3, and Pyodide
# has no network and no requests, so this runs on the learner's own machine, against a scanner the
# setup writes. requests==2.34.2 is module 10's pin (Python 3.10 or newer): move them together.
# Clue 3 of the manifest thread (docs/story.md) is in lab_done: the scan finds it, so it never goes in
# complete (#422).
title: "Capstone: retries and logging"
minutes: 20
story: |
  **Mission log, day 55.** Mission Control's inquiry into the depot wants a scan record for every
  crate from run 33. The hold's scanner drops reads when it's busy, and sometimes it simply goes
  quiet. "Try once and give up, and we've got nothing," says Okafor. "Hammer it all day, and nobody
  else gets a read. Keep trying, politely, and know when to stop."
quiz:
  - type: choice
    q: "This retries on anything but a 200. Run against a crate that doesn't exist, what goes wrong?"
    code: |-
      for attempt in range(1, 4):
          response = requests.get(url, timeout=2)
          if response.status_code == 200:
              break
          time.sleep(1)
    lang: python
    options:
      - "Nothing: three tries is a sensible limit for every kind of failure there is"
      - "It never stops: `range(1, 4)` goes on counting until a 200 comes back"
      - "It asks three times for a 404, which won't change however often it asks"
      - "`time.sleep(1)` stops the whole script, so the second try never happens"
    answer: 2
    explain: >-
      A 404 says the crate isn't there, and asking again won't make it appear. Retry only what can
      recover on its own: no reply, a refused connection, or a status code of 500 or more.
  - type: choice
    q: "With no `basicConfig`, this prints only one line. Why?"
    code: |-
      import logging

      logging.info("scanning C-321")
      logging.warning("scanner busy")
    lang: python
    options:
      - "`logging` only prints the last message a script gives it"
      - "The level starts at WARNING, so the INFO message is dropped"
      - "`logging.info` needs a file to write to, and there isn't one"
      - "INFO messages go to stdout, and the terminal only shows stderr"
    answer: 1
    explain: >-
      Messages below the level are dropped, and the level is WARNING until `basicConfig(level=…)` says
      otherwise. Both levels go to stderr.
  - type: choice
    q: "A retry loop waits 0.5 s, then 1 s, then 2 s. Why grow the wait instead of retrying at once?"
    options:
      - "A busy server gets time to recover, instead of being asked again while it's still busy"
      - "`time.sleep` can't wait the same length of time twice in one script"
      - "Every server requires it, and refuses a second try that comes too soon"
      - "It makes the script finish sooner, because each try takes less time"
    answer: 0
    explain: >-
      Backoff gives a struggling server room. Retrying at once puts more load on exactly the server
      that can't cope, and a limit on the tries means the script still ends.
  - type: fill
    q: "Which logging level is for a try that failed but will be retried: `debug`, `info`, `warning` or `error`?"
    answer: ["warning", "WARNING", "logging.warning"]
    explain: >-
      WARNING: something went wrong, and the script is coping. ERROR is for the failure it can't get
      past, such as the last try.
  - type: choice
    q: "`scan_crate.py` exits 1 for a 404 and 3 after giving up. A cron job runs it for a list of crates, and someone typed one of them as `C-3223`. When is trying again later worth it?"
    code: |-
      python scan_crate.py C-3223 --quiet > record.json
      echo "exit $?"
    lang: bash
    options:
      - "After `exit 1`: the scanner may know the crate by then"
      - "After either: both are failures, and failures are worth another try"
      - "After neither: a script that failed once will fail every time"
      - "After `exit 3`: the scanner may answer later, while a 404 won't change"
    answer: 3
    explain: >-
      Different codes let the caller decide. 3 says the scanner never answered, which can clear up. 1
      says the request was wrong, here a mistyped crate, so the same request will fail again.
cards:
  - id: retry-what-can-recover
    section: "Retry what can recover"
    front: Which failures of a web request are worth retrying?
    back: "No reply in time, nothing answering, and a status code of 500 or more. Not a 4xx that says the request is wrong, such as a 404: asking again won't change it."
  - id: backoff
    section: "Backoff: wait longer each time"
    front: What's backoff?
    back: "Waiting longer after each failed try, such as 0.5 s, then 1 s, then 2 s, with a limit on the tries."
  - id: log-levels
    section: "`logging` instead of `print`"
    front: Name logging's levels, lowest first
    accept: ["DEBUG, INFO, WARNING, ERROR, CRITICAL", "DEBUG INFO WARNING ERROR CRITICAL", "debug, info, warning, error, critical", "debug info warning error critical"]
    back: "DEBUG, INFO, WARNING, ERROR, CRITICAL. Messages below the level set by `basicConfig` are dropped."
  - id: default-level
    section: "`logging` instead of `print`"
    front: Why does `logging.info("…")` print nothing in a script with no `basicConfig`?
    back: "The level starts at WARNING. `logging.basicConfig(level=logging.INFO)` lets INFO through."
  - id: exit-codes-mean-something
    section: "Giving up cleanly"
    front: Why give "gave up after retries" a different exit status from "no such thing"?
    back: "So whatever runs the script can tell a failure that may clear up, worth trying later, from one that won't."
lab:
  from: okafor
  ai_review: true
  rubric:
    - The record goes to stdout and every message through logging, on stderr, with no print used for messages.
    - The retrying is in a function of its own, which takes what it needs as arguments and gives back a status rather than calling sys.exit itself.
    - The last failed try gives up at once, without a wait that no try follows.
    - Each except names the error it expects, with no bare except or except Exception.
    - The number of tries, the first wait and the timeout are each written once, in a named constant or a default, not repeated as bare numbers.
    - Names say what they hold, and the code reads top to bottom without repeating itself.
  task: |-
    Write the bay's crate scanner tool, `scan_crate.py`, for Mission Control's inquiry. On Windows, do
    all of it in Git Bash (Unit 1.3, *Your first repository*), and use `python` or `py` wherever a step
    says `python3`.

    1. Check `python3 --version`: `requests` 2.34.2 needs **Python 3.10 or newer**, as in module 10.
    2. Run the setup below. It makes `~/meridian/hold-scan` with `scanner.py` in it, a stand-in for the
       hold's scanner. Stay in that folder.
    3. Open a **second terminal**, as in module 11, `cd ~/meridian/hold-scan`, and run
       `python3 scanner.py`. It needs no venv. It prints a line for each request, and may say
       `nobody was waiting for that reply` after a slow one. Leave it running.
    4. Back in the first terminal, make a venv called `.venv`, activate it, and install `requests` at
       exactly version **`2.34.2`**.
    5. Write `scan_crate.py`, with a `main()` that gives back the exit status, and the main guard
       (modules 06 and 09). Use `argparse`, with exactly these:
       - the description **`Scan a crate in the hold.`**
       - a positional **`crate`**, with the help **`the crate to scan, such as C-321`**
       - an option **`--scanner`**, `http://127.0.0.1:8766` when it's left out, with the help
         **`the scanner's address`**
       - a switch **`--quiet`**, with the help **`log only warnings and errors`**
    6. Set up `logging` with the format **`%(levelname)s %(message)s`**, at INFO, or at WARNING with
       `--quiet`. Every message goes through `logging`. `print` is only for the record.
    7. In a function of its own, `get` the URL made of the scanner's address, then `/crates/`, then the
       crate, with a **timeout of 2 seconds**, up to **3 tries**:
       - A try **fails** if no reply came in time, nothing answered, or the status code is 500 or more.
         Its PROBLEM is the word `Timeout`, the word `ConnectionError`, or the status code: the words
         as written here, not the error's own name.
       - After a failed try that isn't the last, log at WARNING
         **`CRATE: try N of 3 failed: PROBLEM, retrying in DELAY s`**, then wait DELAY seconds. DELAY
         starts at `0.5` and doubles after each wait. It's printed as Python prints it: `0.5`, `1.0`.
       - After the last failed try, log at ERROR **`CRATE: try 3 of 3 failed: PROBLEM, giving up`**,
         and give back **3**.
       - A status code from 400 to 499 isn't retried: log at ERROR **`CRATE: CODE, not retrying`**,
         and give back **1**.
       - Otherwise, log at INFO **`CRATE: scanned on try N`**, print the record, the reply's body from
         `.json()`, to stdout with `json.dumps` (module 07), and give back **0**.

       `CRATE`, `N`, `PROBLEM`, `DELAY` and `CODE` stand for their values.
    8. **Restart the scanner** (Ctrl-C, then `python3 scanner.py` again) before the runs you paste: it
       answers C-323 differently depending on how often it has been asked. Then run each command in
       the boxes below, and paste what it prints.
  setup: |-
    mkdir -p ~/meridian/hold-scan && cd ~/meridian/hold-scan
    cat > scanner.py <<'PY'
    import json
    import time
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    CRATES = {
        "C-321": {"crate": "C-321", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 30.0, "consigned_by": "depot stores"},
        "C-322": {"crate": "C-322", "run": 33, "received": "2026-09-30", "deck": "A", "mass": 18.5, "consigned_by": "depot stores"},
        "C-323": {"crate": "C-323", "run": 33, "received": "2026-09-30", "deck": "C", "mass": 61.0, "consigned_by": "depot-sync"},
        "C-324": {"crate": "C-324", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 9.0, "consigned_by": "depot stores"},
    }
    FLAKY = {"C-323": ["busy", "slow", "read"]}
    reads = {}


    class Scanner(BaseHTTPRequestHandler):
        def do_GET(self):
            crate = self.path.split("/")[-1]
            if not self.path.startswith("/crates/") or crate not in CRATES:
                self.reply(404, {"error": "no such crate"})
                return
            pattern = FLAKY.get(crate, ["read"])
            step = pattern[reads.get(crate, 0) % len(pattern)]
            reads[crate] = reads.get(crate, 0) + 1
            if step == "busy":
                self.reply(503, {"error": "scanner busy"})
                return
            if step == "slow":
                time.sleep(5)
            self.reply(200, CRATES[crate])

        def reply(self, status, data):
            body = json.dumps(data).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                self.log_message("%s", "nobody was waiting for that reply")


    print("scanner: answering on http://127.0.0.1:8766 (Ctrl-C stops it)", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", 8766), Scanner).serve_forever()
    except KeyboardInterrupt:
        print("\nscanner: stopped")
    PY
  boxes:
    - prompt: With the scanner running, what `python scan_crate.py C-322; echo "exit $?"; python scan_crate.py C-323; echo "exit $?"; python scan_crate.py C-999; echo "exit $?"` prints.
      checks:
        - {regex: '^INFO C-322: scanned on try 1$', says: "C-322 was scanned on the first try, and logged at INFO", hint: "Is logging set up with the task's format, at INFO?"}
        - {contains: '"crate": "C-322"', says: "C-322's record was printed as JSON", hint: "Is the record printed with json.dumps?"}
        - {regex: '^WARNING C-323: try 1 of 3 failed: 503, retrying in 0\.5 s$', says: "C-323's first try got a 503, which was retried after 0.5 s", hint: "Is a status code of 500 or more treated as a failed try? If C-323 scanned at once, start the scanner afresh."}
        - {regex: '^WARNING C-323: try 2 of 3 failed: Timeout, retrying in 1\.0 s$', says: "Its second try got no reply in 2 seconds, and the wait doubled", hint: "Does the delay double after each wait? Is there a timeout on get?"}
        - {regex: '^INFO C-323: scanned on try 3$', says: "Its third try worked"}
        - {contains: '"consigned_by": "depot-sync"', says: "C-323's record was printed"}
        - {regex: '^ERROR C-999: 404, not retrying\nexit 1$', says: "A crate that isn't there got a 404, logged at ERROR, and exits 1", hint: "Is a 4xx handled before the retrying, without a retry, and does it give back 1?"}
        - {not_contains: "C-999: try", says: "and the 404 wasn't retried", hint: "Asking again won't make a crate appear. Which failures are worth a retry?"}
        - {not_contains: "Traceback", says: "No traceback: every failure is handled"}
        - {lines: {min: 10, max: 10}, says: "Ten lines: three runs' logs, two records and three exits"}
      example: |
        INFO C-322: scanned on try 1
        {"crate": "C-322", "run": 33, "received": "2026-09-30", "deck": "A", "mass": 18.5, "consigned_by": "depot stores"}
        exit 0
        WARNING C-323: try 1 of 3 failed: 503, retrying in 0.5 s
        WARNING C-323: try 2 of 3 failed: Timeout, retrying in 1.0 s
        INFO C-323: scanned on try 3
        {"crate": "C-323", "run": 33, "received": "2026-09-30", "deck": "C", "mass": 61.0, "consigned_by": "depot-sync"}
        exit 0
        ERROR C-999: 404, not retrying
        exit 1
    - prompt: What `python scan_crate.py C-323 --scanner http://127.0.0.1:8767; echo "exit $?"; python scan_crate.py C-321 --quiet; echo "exit $?"; python scan_crate.py C-324 --quiet; echo "exit $?"` prints. Nothing answers on port 8767.
      checks:
        - {regex: '^WARNING C-323: try 1 of 3 failed: (ConnectionError|Timeout), retrying in 0\.5 s$', says: "Nothing answered, and the first try was retried after 0.5 s", hint: "Is a ConnectionError caught as a failed try, by requests' own name?"}
        - {regex: '^WARNING C-323: try 2 of 3 failed: (ConnectionError|Timeout), retrying in 1\.0 s$', says: "and the second after 1.0 s"}
        - {regex: '^ERROR C-323: try 3 of 3 failed: (ConnectionError|Timeout), giving up$', says: "The third try was the last, logged at ERROR", hint: "Does the last failed try give up instead of waiting again?"}
        - {regex: '^exit 3$', says: "Giving up exits 3", hint: "Does main give back what the scanning function gave back, and does the guard hand it to sys.exit?"}
        - {contains: '"crate": "C-321"', says: "C-321's record was printed with --quiet"}
        - {contains: '"crate": "C-324"', says: "and C-324's, the last crate of run 33"}
        - {not_contains: "INFO", says: "--quiet left out the INFO line", hint: "Does --quiet set the level to WARNING?"}
        - {not_contains: "Traceback", says: "No traceback"}
      example: |
        WARNING C-323: try 1 of 3 failed: ConnectionError, retrying in 0.5 s
        WARNING C-323: try 2 of 3 failed: ConnectionError, retrying in 1.0 s
        ERROR C-323: try 3 of 3 failed: ConnectionError, giving up
        exit 3
        {"crate": "C-321", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 30.0, "consigned_by": "depot stores"}
        exit 0
        {"crate": "C-324", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 9.0, "consigned_by": "depot stores"}
        exit 0
    - prompt: What `cat scan_crate.py` prints.
      checks:
        - {contains: "import argparse", says: "It reads the command line with argparse"}
        - {contains: "logging.basicConfig(", says: "Logging is set up with basicConfig"}
        - {contains: "%(levelname)s %(message)s", says: "in the task's format"}
        - {regex: 'logging\.warning\(', says: "Failed tries are logged at WARNING"}
        - {regex: 'logging\.error\(', says: "and giving up at ERROR"}
        - {contains: "time.sleep(", says: "It waits between tries with time.sleep"}
        - {regex: 'timeout\s*=\s*2(?![\d.])', says: "Every request has a timeout of 2 seconds", hint: "Is the timeout written as timeout=2 in the call to get?"}
        - {regex: '__name__\s*==\s*["'']__main__["'']', says: "The script has the main guard"}
      example: |
        import argparse
        import json
        import logging
        import sys
        import time

        import requests

        TRIES = 3


        def scan(scanner, crate):
            delay = 0.5
            for attempt in range(1, TRIES + 1):
                problem = None
                try:
                    response = requests.get(f"{scanner}/crates/{crate}", timeout=2)
                    if response.status_code >= 500:
                        problem = response.status_code
                except requests.exceptions.Timeout:
                    problem = "Timeout"
                except requests.exceptions.ConnectionError:
                    problem = "ConnectionError"

                if problem is None:
                    if response.status_code >= 400:
                        logging.error(f"{crate}: {response.status_code}, not retrying")
                        return 1
                    logging.info(f"{crate}: scanned on try {attempt}")
                    print(json.dumps(response.json()))
                    return 0
                if attempt == TRIES:
                    logging.error(f"{crate}: try {attempt} of {TRIES} failed: {problem}, giving up")
                    return 3
                logging.warning(f"{crate}: try {attempt} of {TRIES} failed: {problem}, retrying in {delay} s")
                time.sleep(delay)
                delay = delay * 2


        def main():
            parser = argparse.ArgumentParser(description="Scan a crate in the hold.")
            parser.add_argument("crate", help="the crate to scan, such as C-321")
            parser.add_argument("--scanner", default="http://127.0.0.1:8766", help="the scanner's address")
            parser.add_argument("--quiet", action="store_true", help="log only warnings and errors")
            args = parser.parse_args()
            if args.quiet:
                level = logging.WARNING
            else:
                level = logging.INFO
            logging.basicConfig(level=level, format="%(levelname)s %(message)s")
            return scan(args.scanner, args.crate)


        if __name__ == "__main__":
            sys.exit(main())
comms:
  open:
    - {from: mission, text: "*Meridian*, Mission Control. The inquiry into the depot's update feed requests a scan record for each crate from supply run 33."}
    - {from: meridian, text: "HOLD SCANNER · ONLINE · DROPPING READS UNDER LOAD"}
    - {from: okafor, text: "It drops reads when the hold's busy. A script that tries once gets us nothing, and one that hammers it gets nobody anything."}
    - {from: okafor, text: "Keep trying, wait a bit longer each time, and know when to stop. And write down every try."}
  lab_done:
    - {from: meridian, text: "SCAN RECORDS · RUN 33 · C-321: DEPOT STORES · C-322: DEPOT STORES · C-323: depot-sync · C-324: DEPOT STORES · C-323 ON MANIFEST 33: NO"}
    - {from: okafor, text: "depot-sync. The same name that committed the cron job. That crate didn't come off the depot's shelves. It came in on the feed."}
    - {from: mission, text: "*Meridian*, Mission Control. Scan records received and added to the inquiry. Keep C-323 sealed."}
    - {from: okafor, text: "Sealed it stays. Whoever's on the other end of that feed, it's not ours to open."}
  complete:
    - {from: okafor, text: "Records read, tools driven, arguments taken, services asked, failures handled. The bay runs on scripts now, and they say what they did."}
    - {from: meridian, text: "FABRICATION BAY · AUTOMATION: ONLINE"}
  window: {complete: shuttle-dock}
---

## Retry what can recover

Module 11's script gave up at the first failure. Some failures are worth a second try, because they
can clear up on their own, and some aren't, because asking again gets the same answer.

| What happened | Worth retrying? | Why |
|---|---|---|
| `Timeout`: no reply in time | **yes** | the server may be busy, and answer next time |
| `ConnectionError`: nothing answering | **yes** | it may be restarting |
| **a status code of 500 or more** | **yes** | the server's own trouble, such as `503 Service Unavailable`: "busy, come back later" |
| **a status code from 400 to 499** | **no** | the request is wrong: a `404` stays a 404 however often you ask |

**Retry only no reply, nothing answering, and 500 and up. Don't retry a 4xx.** A few 4xx codes mean
"not now" rather than "wrong", such as `429 Too Many Requests` from Networking, and a client written
for one particular service may wait and retry those. The bay's scanner has none, so here no 4xx is
retried.

## Backoff: wait longer each time

Retrying at once puts more load on a server that's already struggling. **Backoff means waiting longer
after each failed try**: 0.5 s, then 1 s, then 2 s. **`time.sleep(SECONDS)` waits**, after
`import time`, and a `float` is fine: `time.sleep(0.5)` is half a second. **Doubling the wait is
`delay = delay * 2`.**

**And limit the tries**, or a server that's down for the day keeps your script running all day.
**`range(1, 4)` counts 1, 2 and 3: from the first number, up to but not including the second.** So
`for attempt in range(1, 4):` runs three times, with `attempt` holding the try's number:

```python
delay = 0.5
for attempt in range(1, 4):
    print("try", attempt, "then wait", delay)
    delay = delay * 2
```

```text
try 1 then wait 0.5
try 2 then wait 1.0
try 3 then wait 2.0
```

**Inside the loop, `return` as soon as a try settles it**, as module 11 said: a success, or a 4xx.
Only a failure worth retrying reaches the wait. **The last try doesn't wait: `if attempt == 3:` is
where you give up.**

**Keep the problem in a variable, as text you choose**, so one block can log it whichever `except`
ran. Start each try with `problem = None`, and set `problem = "Timeout"` in the `except` for
`requests.exceptions.Timeout`, `"ConnectionError"` in the other, or the status code when it's 500 or
more. Then `if problem is None:`, the try settled it.

## Giving up cleanly

**Giving up is a result, not a crash**: log it, and give back an exit status that says which kind of
failure it was, so whatever runs the script, a person, a Bash script or cron (Unit 1.2, *Scheduling
with cron*), can decide what next.

| Exit status | Means | Try again later? |
|---|---|---|
| 0 | it worked | |
| 1 | the request was wrong, such as a 404 | no: it will fail the same way |
| 2 | argparse's: a bad command line (module 09) | no |
| **3** | **gave up after every try** | **yes: the server may be back** |

## `logging` instead of `print`

`print` puts everything on one level. **`logging`, in the standard library, gives each message a
level**, after `import logging`. **The levels, lowest to highest, are DEBUG, INFO, WARNING, ERROR and
CRITICAL:**

| Level | For | Call |
|---|---|---|
| DEBUG | details for whoever's fixing it | `logging.debug(…)` |
| INFO | what the script did, when all is well | **`logging.info(…)`** |
| WARNING | something went wrong, and the script is coping | **`logging.warning(…)`** |
| ERROR | a failure it can't get past | **`logging.error(…)`** |
| CRITICAL | the whole program can't go on | `logging.critical(…)` |

**Messages below the level are dropped, and the level starts at WARNING**, so `logging.info` prints
nothing until you lower it. **`logging.basicConfig()` sets it up, once, in `main()`, after
`parse_args()` when the level depends on an option**:

```python
args = parser.parse_args()
if args.verbose:
    level = logging.DEBUG
else:
    level = logging.INFO
logging.basicConfig(level=level, format="%(levelname)s %(message)s")
logging.info(f"tank {args.tank}: level read")
```

```text
INFO tank T-4: level read
```

**`level=` is the lowest level that shows**: `level=logging.INFO` shows INFO and everything above it.
**`format=` lays out each line**: `%(levelname)s` is the level's name and `%(message)s` the message.
Real logs often add `%(asctime)s`, the time, left out here so the output is the same on every
machine. **Each message is a string**, so an f-string fills in the values.

**`logging` writes to stderr**, so it's talk, and stdout is left for the data (module 09).

**On the real station:** the `anthropic` library that asks Claude for your hints retries this way: a
refused or timed-out request, 500 and up, and three 4xx codes its service uses for "not now", 429 among
them, never a 404. It waits 0.5 s and doubles, up to 8 s. `client()` in `app/ai.py` passes
`max_retries=1` beside module 11's `timeout=30.0`, since you're waiting. And `app/main.py` logs every
unexpected error with `log.exception(…)`: `log` is the app's own named logger, used like `logging`, and
`exception` logs at ERROR with the traceback, while you see only the error page.

## Try it

On any machine with Python: this needs only the standard library. On Windows, in Git Bash, type
`python` for `python3`.

```bash
cd "$(mktemp -d)"
python3 -c 'import logging; logging.info("dropped"); logging.warning("shown")'
python3 -c 'import logging; logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s"); logging.info("shown now"); logging.debug("still dropped")'
python3 -c 'import logging; logging.error("on stderr")' 2>/dev/null
cat > wait_for.py <<'EOF'
import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
delay = 0.5
for attempt in range(1, 5):
    try:
        with open("ready.txt") as f:
            logging.info(f"ready on try {attempt}: {f.read().strip()}")
            sys.exit(0)
    except FileNotFoundError:
        if attempt == 4:
            logging.error(f"try {attempt} of 4 failed, giving up")
            sys.exit(3)
        logging.warning(f"try {attempt} of 4 failed, retrying in {delay} s")
        time.sleep(delay)
        delay = delay * 2
EOF
python3 wait_for.py; echo "exit $?"
(sleep 1 && echo go > ready.txt) & python3 wait_for.py; echo "exit $?"
```

| Command | Prints |
|---|---|
| the first `-c` | `WARNING:root:shown`: the INFO message is dropped, and with no format given, logging's own: the level, `root`, the name of the logger every `logging.…` call uses, and the message |
| the second | `INFO shown now` only |
| the third | nothing: the ERROR went to stderr, thrown away |
| the first `wait_for.py` | three WARNING lines, 0.5 s, 1.0 s and 2.0 s, then `ERROR try 4 of 4 failed, giving up` and `exit 3` |
| the second | two WARNING lines, then `INFO ready on try 3: go` and `exit 0`: the file appeared after a second |

In the last line, the brackets group `sleep 1 && echo go > ready.txt` into one job, and the `&` after
them sends that job to the background (Unit 1.1, *Processes and signals*), so it writes `ready.txt` a
second later while `wait_for.py` is retrying. The shell prints the job's number and PID first, such
as `[1] 4821`.
