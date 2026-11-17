---
# A lab (#456), the unit's capstone, with ai_review. Every output quoted here is from a real run on
# Docker Engine 29.7.2 (2026-11-17). Clue 2 of the manifest thread (docs/story.md) is in lab_done:
# the lab finds it, so it never goes in complete (#422). The setup rebuilds module 02's two
# fabricator images only if they're gone, from the same base64 lines (tests/test_docker.py holds
# them equal), and writes the bay's copy of Unit 2.1's scan_crate.py with two settings read from
# the environment. requests==2.34.2 and its four pins are Unit 2.1 module 10's: move them together.
title: "Capstone: ship the scanner"
minutes: 20
story: |
  **Mission log, day 65.** Mission Control's inquiry wants run 33's scan records from the bay's own
  host, not from one cadet's laptop. "Ship the scanner tool as an image," says Okafor. "It finds the
  hold's scanner by name, takes its settings from outside, and keeps its records where they'll
  outlive it. And before anything new goes on the bay's host, look at what's already running there."
quiz:
  - type: choice
    q: "The scanner runs in one container and the scan tool in another, both on `bay-net`. Why does the tool fail, and what's the fix?"
    code: |-
      $ docker run -d --name hold-scanner --network bay-net -v ./scanner.py:/srv/scanner.py:ro python:3.14.10-slim python /srv/scanner.py
      $ docker run --rm --network bay-net -e SCANNER_URL=http://hold-scanner:8766 bay-scan:1.0 C-321
      WARNING C-321: try 1 of 3 failed: ConnectionError, retrying in 0.5 s
      …
      $ grep ThreadingHTTPServer scanner.py
          ThreadingHTTPServer(("127.0.0.1", 8766), Scanner).serve_forever()
    options:
      - "`SCANNER_URL` needs `localhost`, since both containers are on one network"
      - "The scanner listens on `127.0.0.1`, which inside its container is the container itself: listen on `0.0.0.0`"
      - "The scanner's port has to be published with `-p 8766:8766` first"
      - "`bay-net` doesn't do names: use the scanner's IP address"
    answer: 1
    explain: >-
      `127.0.0.1` inside a container is that container alone, so nothing on `bay-net` can connect:
      `Connection refused`, which `requests` reports as `ConnectionError`. A server another container
      should reach listens on `0.0.0.0` inside its own. `-p` is for reaching it from your machine, and
      a network you created does names.
  - type: choice
    q: "A Dockerfile ends `ENTRYPOINT [\"python\", \"scan_crate.py\"]`. What does `docker run --rm bay-scan:1.0 C-323 --quiet` run?"
    options:
      - "`C-323 --quiet`, replacing the entrypoint"
      - "`python scan_crate.py`, ignoring the words after the image"
      - "`python scan_crate.py C-323 --quiet`: words after the image go to the entrypoint as its arguments"
      - "Nothing: an image with `ENTRYPOINT` can't take arguments"
    answer: 2
    explain: >-
      With an `ENTRYPOINT`, the words after the image are its arguments, so the image behaves like the
      tool itself. With only a `CMD`, they would replace it, as in module 07. `--entrypoint` replaces
      the entrypoint itself (module 09).
  - type: choice
    q: "A script has `os.environ.get(\"SCANNER_URL\", \"http://127.0.0.1:8766\")`. Its container is started without `-e SCANNER_URL`. What does it get?"
    options:
      - "`http://127.0.0.1:8766`, the default given as the second argument"
      - "An error: a variable that isn't set raises one"
      - "`None`, because the variable is missing"
      - "The value from the image's last build"
    answer: 0
    explain: >-
      `os.environ.get(NAME, DEFAULT)` gives the variable's value when it's set and the default when
      it isn't, so the same image runs anywhere and is told where it is with `-e`. Without a default
      it would give `None`; `os.environ[NAME]` would raise `KeyError`.
  - type: choice
    q: "The docking bay's runbook says `dock/clamp:prod` is the 1.4 build. What do these say, and what do you do with the image?"
    code: |-
      $ docker image inspect dock/clamp:1.4 dock/clamp:prod --format '{{index .Config.Labels "org.opencontainers.image.authors"}}'
      docking crew
      unknown-ci
    options:
      - "Nothing's wrong: labels are only notes, and anyone can leave them blank"
      - "`prod` is a newer copy of the same build: run it to see"
      - "Delete `prod`, so nobody runs it by mistake"
      - "`prod` claims a different author from the 1.4 build, so it isn't that build. Don't run it; keep it, and look at its `docker history` for what it adds"
    answer: 3
    explain: >-
      The two tags name images that claim different authors, so `prod` was replaced. A label is only
      what the builder wrote, which is a reason to look further, not to trust it. An image you don't
      trust isn't something to run to find out what it does, and deleting it destroys the evidence.
      `docker history --no-trunc` shows each layer's command without running anything.
  - type: fill
    q: "Which Dockerfile instruction makes the image run a fixed program, with the words after the image name as its arguments?"
    answer: ["ENTRYPOINT", "entrypoint"]
    explain: >-
      `ENTRYPOINT ["python", "scan_crate.py"]`, in exec form, like `CMD`'s.
cards:
  - id: entrypoint-tool
    section: "An image that behaves like a tool"
    front: "How do you make `docker run IMAGE C-323` pass `C-323` to your script?"
    back: "End the Dockerfile with `ENTRYPOINT [\"python\", \"script.py\"]`: words after the image become its arguments."
  - id: settings-from-environment
    section: "Settings from outside"
    front: "In Python, how do you read a setting from the environment, with a default if it isn't set?"
    accept: ["os.environ.get(NAME, DEFAULT)", "os.environ.get"]
    back: "`os.environ.get(\"NAME\", \"default\")`, after `import os`."
  - id: listen-all-inside
    section: "Listening inside a container"
    front: "A server in a container must be reached by other containers. What address does it listen on?"
    back: "`0.0.0.0`: inside a container, `127.0.0.1` is that container alone."
  - id: who-made-it
    section: "Who made an image"
    front: "Two commands that show who made an image and what it adds, without running it?"
    back: "`docker image inspect IMAGE --format '{{index .Config.Labels \"org.opencontainers.image.authors\"}}'` and `docker history --no-trunc IMAGE`."
lab:
  from: okafor
  ai_review: true
  rubric:
    - Only what the tool needs goes into the image, with no COPY of the whole folder unless a .dockerignore keeps the rest out.
    - pip installs without keeping its download cache in the image.
    - Nothing the run passes from outside, such as the scanner's address, is written into the image, with no ENV for it.
    - The files have a WORKDIR of their own, not the root of the filesystem.
    - "Each instruction earns its place: no steps the tool doesn't need, and nothing repeated."
  task: |-
    Ship the bay's scanner tool as an image, scan run 33 with it, keep the records on a volume, then
    check what's already on the bay's host. On Windows, use Git Bash (module 01), and run
    `export MSYS_NO_PATHCONV=1` there first (module 02): several steps have paths starting with `/`.

    1. Run the setup below. It makes `~/meridian/ship-scanner` with the bay's copy of Unit 2.1's
       `scan_crate.py`, a `scanner.py` for a container, and the pinned `requirements.txt`, and builds
       module 02's fabricator images again if they're gone. Stay in that folder. `scan_crate.py` reads
       two settings from the environment: `SCANNER_URL`, the scanner's address, and `RECORDS`, a file
       to add each record to.
    2. Write a `Dockerfile` for `scan_crate.py`, in `nano` or any editor, using modules 07 and 08 and
       this lesson: start from `python:3.14.10-slim`, install the requirements before copying the code,
       copy only what the tool needs, and run the tool from an `ENTRYPOINT`. The image needs
       `requirements.txt`, for the install, and `scan_crate.py`, the tool. `scanner.py` stays out:
       it's the hold's scanner, which runs in a container of its own in step 3. Build it as
       `bay-scan:1.0`. Paste `cat Dockerfile` in the first box.
    3. Make the network and start the hold's scanner on it, from `~/meridian/ship-scanner`, so that
       `./scanner.py` is there to mount:
       1. `docker network create bay-net`
       2. `docker run -d --name hold-scanner --network bay-net -v ./scanner.py:/srv/scanner.py:ro python:3.14.10-slim python /srv/scanner.py`
       3. `docker logs hold-scanner` should say `scanner: answering on port 8766`. If it's empty, wait
          a second and ask again.
    4. Scan the four crates of run 33, each in its own container on `bay-net`, keeping the records on
       the volume `scan-records`. Paste everything it prints in the second box:

       `for crate in C-321 C-322 C-323 C-324; do docker run --rm --network bay-net -e SCANNER_URL=http://hold-scanner:8766 -e RECORDS=/records/run33.jsonl -v scan-records:/records bay-scan:1.0 "$crate"; done`

       Counted from when the scanner starts, it answers C-323 busy (503) the first time, too slowly
       the second, and with the record the third, so any scan of C-323 before this loop, a test
       included, moves it on. To run the scans again from the start, first
       `docker restart hold-scanner` and `docker volume rm scan-records`.
    5. Read the records back from the volume, in a container of their own. `.jsonl` is one JSON
       record per line:
       `docker run --rm -v scan-records:/records alpine:3.24 cat /records/run33.jsonl`. Paste what it
       prints in the third box.
    6. Before the tool goes on the bay's host, look at the image the bay runs. Its runbook says
       `stable` is the 2026-09-28 build (module 02). Run these two, and
       paste what they print in the last box:
       1. `docker image inspect meridian/fabricator:2026-09-28 meridian/fabricator:stable --format '{{index .Config.Labels "org.opencontainers.image.authors"}}'`
       2. `docker history --no-trunc meridian/fabricator:stable --format "{{.CreatedBy}}"`
    7. When the boxes pass, clean up: `docker rm -f hold-scanner`, `docker network rm bay-net`,
       `docker volume rm scan-records`, `docker rmi bay-scan:1.0`, then
       `cd ~ && rm -r ~/meridian/ship-scanner`. Leave the fabricator images where they are: they're
       evidence now.
  setup: |-
    mkdir -p ~/meridian/ship-scanner && cd ~/meridian/ship-scanner
    cat > scan_crate.py <<'PY'
    import argparse
    import json
    import logging
    import os
    import sys
    import time

    import requests

    TRIES = 3


    def keep(record):
        path = os.environ.get("RECORDS")
        if path:
            with open(path, "a") as records:
                records.write(record + "\n")


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
                record = json.dumps(response.json())
                print(record)
                keep(record)
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
        parser.add_argument("--scanner", default=os.environ.get("SCANNER_URL", "http://127.0.0.1:8766"), help="the scanner's address")
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
    PY
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


    print("scanner: answering on port 8766", flush=True)
    try:
        ThreadingHTTPServer(("0.0.0.0", 8766), Scanner).serve_forever()
    except KeyboardInterrupt:
        print("\nscanner: stopped")
    PY
    printf 'certifi==2026.10.23\ncharset-normalizer==3.5.2\nidna==3.20\nrequests==2.34.2\nurllib3==2.8.0\n' > requirements.txt
    docker image inspect meridian/fabricator:2026-09-28 > /dev/null 2>&1 || echo 'RlJPTSBhbHBpbmU6My4yNApMQUJFTCBvcmcub3BlbmNvbnRhaW5lcnMuaW1hZ2UudGl0bGU9ImZhYnJpY2F0b3IiIG9yZy5vcGVuY29udGFpbmVycy5pbWFnZS5jcmVhdGVkPSIyMDI2LTA5LTI4VDA3OjEyOjAwWiIgb3JnLm9wZW5jb250YWluZXJzLmltYWdlLmF1dGhvcnM9ImZhYnJpY2F0aW9uIGJheSIKQ01EIFsiZWNobyIsICJmYWJyaWNhdG9yOiByZWFkeSJdCg==' | base64 --decode | docker build -q -t meridian/fabricator:2026-09-28 -
    docker image inspect meridian/fabricator:stable > /dev/null 2>&1 || echo 'RlJPTSBhbHBpbmU6My4yNApMQUJFTCBvcmcub3BlbmNvbnRhaW5lcnMuaW1hZ2UudGl0bGU9ImZhYnJpY2F0b3IiIG9yZy5vcGVuY29udGFpbmVycy5pbWFnZS5jcmVhdGVkPSIyMDI2LTA5LTMwVDAzOjQ3OjAwWiIgb3JnLm9wZW5jb250YWluZXJzLmltYWdlLmF1dGhvcnM9ImRlcG90LXN5bmMiClJVTiBoZWFkIC1jIDQwOTYgL2Rldi91cmFuZG9tID4gL3Vzci9sb2NhbC9iaW4vc3luYy1hZ2VudCAmJiBjaG1vZCA3NTUgL3Vzci9sb2NhbC9iaW4vc3luYy1hZ2VudApDTUQgWyJlY2hvIiwgImZhYnJpY2F0b3I6IHJlYWR5Il0K' | base64 --decode | docker build -q -t meridian/fabricator:stable -
  boxes:
    - prompt: "What `cat Dockerfile` printed."
      checks:
        - {regex: '(?i)^FROM\s+python:3\.14\.10-slim(?:@sha256:[0-9a-f]{64})?\s*$', says: "FROM python:3.14.10-slim, pinned", hint: "Is it exactly python:3.14.10-slim, the version modules 07 and 08 used?"}
        - {regex: '(?is)^COPY\s[^\n]*requirements\.txt.*^RUN\s[^\n]*pip3? install[^\n]*requirements\.txt.*^COPY\s[^\n]*(?:scan_crate\.py|\.\s+\.)', says: "requirements.txt copied and installed before the code", hint: "Which comes first: the COPY of requirements.txt, the pip install, or the COPY of the code? Module 08's Order for the cache."}
        - {regex: '(?i)^ENTRYPOINT\s*\[\s*"python3?"\s*,\s*"[^"]*scan_crate\.py"\s*\]\s*$', says: "ENTRYPOINT runs the tool, in exec form", hint: "Exec form is a list in square brackets, each word in double quotes. With CMD instead, the crate after the image would replace it."}
      example: |
        FROM python:3.14.10-slim
        WORKDIR /app
        COPY requirements.txt .
        RUN pip install --no-cache-dir -r requirements.txt
        COPY scan_crate.py .
        ENTRYPOINT ["python", "scan_crate.py"]
    - prompt: "Everything the four scans printed."
      checks:
        - {regex: '"crate": "C-321"[^\n]*"consigned_by": "depot stores"', says: "C-321 scanned", hint: "Does ConnectionError show? Is the scanner running on bay-net (docker logs hold-scanner), and is SCANNER_URL http://hold-scanner:8766?"}
        - {regex: '"crate": "C-322"[^\n]*"consigned_by": "depot stores"', says: "C-322 scanned"}
        - {regex: '"crate": "C-323"[^\n]*"consigned_by": "depot-sync"', says: "C-323 scanned, consigned by depot-sync"}
        - {regex: '"crate": "C-324"[^\n]*"consigned_by": "depot stores"', says: "C-324 scanned"}
        - {contains: "WARNING C-323: try 1 of 3 failed: 503, retrying in 0.5 s", says: "The busy scanner was retried, from the tool's own logging", hint: "C-323 answers by how often it's been asked: docker restart hold-scanner, then scan again."}
        - {contains: "INFO C-323: scanned on try 3", says: "C-323 got through on its third try"}
        - {not_contains: "ConnectionError", says: "The tool reached the scanner by its name, every time"}
      example: |
        INFO C-321: scanned on try 1
        {"crate": "C-321", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 30.0, "consigned_by": "depot stores"}
        INFO C-322: scanned on try 1
        {"crate": "C-322", "run": 33, "received": "2026-09-30", "deck": "A", "mass": 18.5, "consigned_by": "depot stores"}
        WARNING C-323: try 1 of 3 failed: 503, retrying in 0.5 s
        WARNING C-323: try 2 of 3 failed: Timeout, retrying in 1.0 s
        INFO C-323: scanned on try 3
        {"crate": "C-323", "run": 33, "received": "2026-09-30", "deck": "C", "mass": 61.0, "consigned_by": "depot-sync"}
        INFO C-324: scanned on try 1
        {"crate": "C-324", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 9.0, "consigned_by": "depot stores"}
    - prompt: "What `cat /records/run33.jsonl` printed from the volume."
      checks:
        - {regex: '^\{"crate": "C-321"', says: "C-321's record outlived its container", hint: "Did every scan have -e RECORDS=/records/run33.jsonl and -v scan-records:/records?"}
        - {regex: '^\{"crate": "C-322"', says: "C-322's record"}
        - {regex: '^\{"crate": "C-323"[^\n]*"consigned_by": "depot-sync"', says: "C-323's record, consigned by depot-sync"}
        - {regex: '^\{"crate": "C-324"', says: "C-324's record"}
        - {not_contains: "INFO", says: "Only the records: the log went to the screen, not the file"}
      example: |
        {"crate": "C-321", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 30.0, "consigned_by": "depot stores"}
        {"crate": "C-322", "run": 33, "received": "2026-09-30", "deck": "A", "mass": 18.5, "consigned_by": "depot stores"}
        {"crate": "C-323", "run": 33, "received": "2026-09-30", "deck": "C", "mass": 61.0, "consigned_by": "depot-sync"}
        {"crate": "C-324", "run": 33, "received": "2026-09-30", "deck": "B", "mass": 9.0, "consigned_by": "depot stores"}
    - prompt: "What the authors labels and `stable`'s history printed."
      checks:
        - {regex: '^fabrication bay\s*\n\s*depot-sync\s*$', says: "The two authors labels, 2026-09-28's then stable's", hint: "Were both images inspected, 2026-09-28 first, with the authors label's full name inside index?"}
        - {contains: "/usr/local/bin/sync-agent", says: "A layer in stable's history that the 2026-09-28 build doesn't have", hint: "Without --no-trunc, history cuts each line short. Was it there, before the image name?"}
      example: |
        fabrication bay
        depot-sync
        CMD ["echo" "fabricator: ready"]
        RUN /bin/sh -c head -c 4096 /dev/urandom > /usr/local/bin/sync-agent && chmod 755 /usr/local/bin/sync-agent # buildkit
        LABEL org.opencontainers.image.title=fabricator org.opencontainers.image.created=2026-09-30T03:47:00Z org.opencontainers.image.authors=depot-sync
        CMD ["/bin/sh"]
        ADD alpine-minirootfs-3.24.4-aarch64.tar.gz / # buildkit
comms:
  open:
    - {from: mission, text: "Inquiry to *Meridian*: run 33's scan records are required from the bay's own host. Tooling on personal consoles is not admissible."}
    - {from: okafor, text: "So the scanner tool ships as an image, and runs where the bay runs."}
    - {from: okafor, text: "And before we put anything new on that host, we look at what's already there."}
  lab_done:
    - {from: meridian, text: "RUN 33 · 4 RECORDS ON VOLUME scan-records · C-323 CONSIGNED BY depot-sync"}
    - {from: meridian, text: "meridian/fabricator:stable · AUTHORS: depot-sync · EXTRA LAYER: /usr/local/bin/sync-agent · 2026-09-28 BUILD AUTHORS: fabrication bay"}
    - {from: okafor, text: "depot-sync. The same account that consigned C-323 is on the image this bay was told is the 28th's build. And a layer nobody asked for."}
    - {from: okafor, text: "We don't run it, and we don't delete it. It goes to the inquiry with the records."}
    - {from: mission, text: "Records and image received. Both held as evidence."}
  complete:
    - {from: okafor, text: "One image, built the same everywhere, told where it is from outside, keeping its records where they'll last. That's the fabrication bay back in business."}
    - {from: meridian, text: "CARGO & FABRICATION · DOCKER FUNDAMENTALS · ONLINE"}
  window: {complete: relay-pass}
---

## An image that behaves like a tool

**`ENTRYPOINT ["python", "bay_report.py"]`, in exec form like `CMD`'s, makes the image run that
program every time, and the words after the image name become its arguments.** Module 07's
`bay-report:1.0` had only a `CMD`, so `docker run --rm bay-report:1.0 --deck C` failed with
`exec: "--deck": executable file not found`. With that `ENTRYPOINT` in its place, the same line runs
`python bay_report.py --deck C`, and `--help` after the image prints the tool's own help. Everything else is what modules 07 and 08 built:

| A Dockerfile for a tool | Why |
|---|---|
| `FROM` an exact version, such as `python:3.14.10-slim` | the same Python on every build (07) |
| `COPY requirements.txt .`, then `RUN pip install --no-cache-dir -r requirements.txt` | the install is reused when only the code changes (08) |
| `COPY` the tool's own code, with `requirements.txt` on its own line before the install | nothing it doesn't need, and no secrets (08) |
| `ENTRYPOINT [...]` | the image takes the tool's arguments |

## Settings from outside

**An image is built once and run in many places, so what changes between places, such as an
address, comes in from outside with `-e` (module 04), never written into the image**, such as with
`ENV SCANNER_URL=…` in the Dockerfile (module 08), which would fix it at build time for every place
the image runs. **In Python,
`os.environ.get("NAME", "default")`, after `import os`, reads a variable, giving the default when
it isn't set.** The bay's `scan_crate.py` uses it for `--scanner`'s default, read from
`SCANNER_URL`, and for `RECORDS`, a file to add each record to. Unset, `RECORDS` keeps nothing.

**State that must outlive the container goes on a volume (module 06)**: run with `-v
scan-records:/records` and `-e RECORDS=/records/run33.jsonl`, and every scan, each in a container
removed when it ends, adds its record to the same file.

## Listening inside a container

**Inside a container, `127.0.0.1`, `localhost`, is that container alone** (module 05). **A server that other
containers must reach listens on `0.0.0.0`, every address the container has**, and they find it by
its name on a network you created. Unit 2.1's scanner listened on `127.0.0.1`, which was right on
your machine: the container copy listens on `0.0.0.0`, and publishes nothing, since only other
containers need it. It needs only Python's standard library, so it runs in the stock
`python:3.14.10-slim`, with **`-v` mounting the one file: `-v ./scanner.py:/srv/scanner.py:ro` puts
it at `/srv/scanner.py`, read-only.** Run from the wrong folder, Docker can't find `./scanner.py`
and makes an empty folder by that name instead, and Python says `can't find '__main__' module`. A server bound to `127.0.0.1` inside its container refuses everyone else:
`Connection refused`, which `requests` reports as `ConnectionError`.

## Who made an image

**Before running an image you didn't build, read what it says about itself, without running it.**
**Its labels say who made it and when, as claimed by whoever built it** (module 02): `docker image inspect IMAGE --format
'{{index .Config.Labels "org.opencontainers.image.authors"}}'`, and given several images, it prints
one line each, in order. **`docker history --no-trunc IMAGE` shows every layer's command in full**
(module 08): a layer you can't account for is a question to answer before the image runs anywhere.
A tag that moved to an image with a different author, and a layer nobody asked for, is enough to
stop and ask, and keep the image as it is.

**On the real station:** this course's `web` is configured the same way. `app/config.py` reads
its settings from the environment and `docker-compose.yml` passes them in, so the image holds no
address, password or key: only its own version and commit, which describe the image itself. Inside its container, uvicorn listens on `0.0.0.0:8000`, so Docker can forward to it, and
the port is published on the droplet's `127.0.0.1:5002` only. Its database lives on the
`postgres_data` volume, so a release replaces the container and keeps the data.

## Try it

```bash
docker network create try-net
docker run -d --name try-local --network try-net python:3.14.10-slim python -m http.server --bind 127.0.0.1 8000
docker run -d --name try-any --network try-net python:3.14.10-slim python -m http.server --bind 0.0.0.0 8000
docker run --rm --network try-net alpine:3.24 wget -qO- -T 2 http://try-local:8000/
docker run --rm --network try-net alpine:3.24 wget -qO- -T 2 http://try-any:8000/ | head -3
docker exec try-local python -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8000/").status)'
docker run --rm -e CREW=okafor python:3.14.10-slim python -c 'import os; print(os.environ.get("CREW", "nobody"), os.environ.get("SHIFT", "day"))'
docker rm -f try-local try-any
docker network rm try-net
```

`python -m http.server --bind ADDRESS PORT` is a small web server that comes with Python, and
`urllib.request` is the standard library's way to fetch a URL: the slim image has no `curl` or
`wget`. The
first `wget` fails with `Connection refused`: `try-local` listens on `127.0.0.1`, so only its own
container can reach it, as the `docker exec` line shows by printing `200`. `try-any`, on `0.0.0.0`,
answers with the start of a page, `<!DOCTYPE HTML>`. `-T 2` gives up after 2 seconds. The last
`docker run` prints `okafor day`: `CREW` was set with `-e`, and `SHIFT` wasn't, so its default came
back.
