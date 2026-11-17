---
# A lab (#453), like every Docker module. Every output quoted here is from a real run on Docker
# Engine 29.7.2 with BuildKit (buildx 0.36.1) and python:3.14.10-slim (2026-11-17). The setup writes
# the bay's copy of module 09's bay_report.py, so a learner who skipped that lab, or works on another
# machine, still has the script to containerise.
title: Your first Dockerfile
minutes: 20
story: |
  **Mission log, day 62.** Your `bay_report.py` has become the bay's favourite tool, and the trouble
  has started. One console has an older Python, one has none, and the night shift's prints something
  different from the day shift's. "One tool, one result, on every console," says Okafor. "Package it
  with the Python it needs, and the data it reads. Then nobody's console decides what it prints."
quiz:
  - type: choice
    q: "The image's `CMD` is `[\"python\", \"bay_report.py\", \"received.csv\"]`. Why does this fail, and what works?"
    code: |-
      $ docker run --rm bay-report:1.0 --deck C
      docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: error during container init: exec: "--deck": executable file not found in $PATH
    options:
      - "`--deck` needs a value in quotes: `--deck \"C\"`"
      - "Anything after the image name replaces `CMD` whole, so Docker tried to run a program called `--deck`. Give the whole command: `python bay_report.py received.csv --deck C`"
      - "Options for the program have to come before the image name: `docker run --rm --deck C bay-report:1.0`"
      - "The image was built without `bay_report.py`: rebuild it"
    answer: 1
    explain: >-
      With a command after the image, Docker runs that instead of `CMD`, not as well as it. Its first
      word is the program, so `--deck` was looked for as one and not found. Options before the image
      name are `docker run`'s own, and `--deck` isn't one of them.
  - type: choice
    q: "When does a Dockerfile's `RUN` line run?"
    options:
      - "Every time a container starts from the image, before `CMD`"
      - "Only when you pass `--run` to `docker run`"
      - "Once for each `COPY` above it"
      - "Once, while `docker build` makes the image; what it leaves in the filesystem is saved into the image"
    answer: 3
    explain: >-
      `RUN` is build time: installing packages, compiling, making folders. Its result is part of the
      image, so every container starts with it already done. `CMD` is the one that runs each time a
      container starts.
  - type: choice
    q: "You fix a bug in `bay_report.py` on your machine, then run `docker run --rm bay-report:1.0` again. It still has the bug. Why?"
    options:
      - "The image holds the copy `COPY` made when it was built. Run `docker build` again for a new image with the fix"
      - "Docker caches the output of the last run: add `--no-cache` to `docker run`"
      - "The container is still running from last time: `docker stop` it first"
      - "`COPY` links to the file, so the fix only shows after you log in again"
    answer: 0
    explain: >-
      `COPY` copies the file into the image at build time, and the image never changes after that. A
      change on your machine needs a new build, which makes a new image under the same tag.
  - type: fill
    q: "Which Dockerfile instruction sets the folder that later instructions, and the container's command, work in?"
    answer: ["WORKDIR", "workdir"]
    explain: >-
      `WORKDIR /app` makes `/app` (creating it if it's missing), and every `COPY`, `RUN` and `CMD`
      after it works there, as if you'd `cd`'d into it.
  - type: choice
    q: "In `docker build -t bay-report:1.0 .`, what is the `.` at the end?"
    options:
      - "The tag's separator: it ends the name"
      - "Where to save the finished image"
      - "The build context: the folder whose files `COPY` can see, here the one you're in"
      - "A wildcard meaning every Dockerfile in the folder"
    answer: 2
    explain: >-
      `docker build` sends the context, here `.`, the folder you're in, to the engine, and `COPY` takes
      its files from there. It also finds `Dockerfile` there. Images aren't saved to a folder of yours:
      the engine keeps them, and `docker images` lists them.
cards:
  - id: dockerfile-instructions
    section: "A Dockerfile"
    front: "What do `FROM`, `WORKDIR`, `COPY`, `RUN` and `CMD` each do?"
    back: "Start from an image; set the folder to work in; copy files from the build context in; run a command at build time; set the command a container runs by default."
  - id: run-vs-cmd
    section: "Build time and run time"
    front: "`RUN` against `CMD`: when does each one run?"
    back: "`RUN` once, during `docker build`, and its result is saved in the image. `CMD` each time a container starts, unless the `docker run` line gives a command."
  - id: args-replace-cmd
    section: "Running it with arguments"
    front: "What happens to `CMD` when `docker run IMAGE` is followed by more words?"
    back: "They replace it whole: the first word is the program to run. Give the full command, not just its options."
  - id: build-tag-context
    section: "Building it"
    front: "What does `docker build -t NAME:TAG .` do?"
    accept: ["docker build -t NAME:TAG .", "docker build -t NAME .", "docker build --tag NAME:TAG ."]
    back: "Builds an image from the `Dockerfile` in `.`, the build context, and names it `NAME:TAG` (`latest` if no tag)."
  - id: rebuild-after-change
    section: "Build time and run time"
    front: "You changed a file the Dockerfile copies. What do you have to do before a container sees it?"
    back: "Build again: the image holds the copy made at the last build."
lab:
  from: okafor
  task: |-
    Package `bay_report.py`, the bay's report from Unit 2.1 module 09, into an image with its Python and
    its data, and run it. On Windows, use Git Bash (module 01).

    1. Run the setup below. It makes `~/meridian/bay-image` with the bay's copy of `bay_report.py` and
       `received.csv`. Stay in that folder.
    2. Write a file called `Dockerfile` there, in `nano` (Unit 1.2, *Reading and editing*) or any editor, with five
       instructions, in this order:
       1. Start from `python:3.14.10-slim`.
       2. Work in `/app`.
       3. Copy `bay_report.py` and `received.csv` in.
       4. Check the script at build time with `python -m py_compile bay_report.py`, which turns it into
          bytecode, Python's own compiled form, in a `__pycache__` folder beside the script, and fails
          the build if the script has a syntax error.
       5. Run `python bay_report.py received.csv` by default, in exec form.
    3. Build it, named `bay-report` with the tag `1.0`: `docker build -t bay-report:1.0 .`. The first
       build downloads `python:3.14.10-slim`, which takes a minute.
    4. Run each command in the boxes below, and paste what it prints. The summary line, `N crates, T kg`,
       may come first: that's expected (the lesson's *Why the summary can come first* says why).
    5. When the boxes pass, clean up: `docker rmi bay-report:1.0`, then
       `cd ~ && rm -r ~/meridian/bay-image`.
  setup: |-
    mkdir -p ~/meridian/bay-image && cd ~/meridian/bay-image
    cat > bay_report.py <<'PY'
    import argparse
    import csv
    import sys


    def main():
        parser = argparse.ArgumentParser(description="List the crates the bay received.")
        parser.add_argument("path", help="the bay's received CSV")
        parser.add_argument("--deck", help="only this deck's crates")
        parser.add_argument("--min-mass", type=float, default=0, help="only crates at least this heavy, in kg")
        args = parser.parse_args()
        try:
            with open(args.path, newline="") as f:
                rows = list(csv.DictReader(f))
        except OSError:
            print(f"bay_report: can't read {args.path}", file=sys.stderr)
            return 1
        count, total = 0, 0.0
        for row in rows:
            mass = float(row["mass"])
            if args.deck and row["deck"] != args.deck:
                continue
            if mass < args.min_mass:
                continue
            print(row["date"], row["crate"], mass)
            count += 1
            total += mass
        print(f"{count} crates, {total} kg", file=sys.stderr)
        return 0


    if __name__ == "__main__":
        sys.exit(main())
    PY
    cat > received.csv <<'CSV'
    date,crate,deck,mass
    2026-09-16,C-301,A,40.5
    2026-09-16,C-302,B,12.0
    2026-09-16,C-303,A,7.25
    2026-09-23,C-313,B,4.0
    2026-09-23,C-311,C,15.0
    2026-09-23,C-314,C,11.75
    2026-09-23,C-312,A,26.5
    2026-09-30,C-321,B,30.0
    2026-09-30,C-322,A,18.5
    2026-09-30,C-323,C,61.0
    2026-09-30,C-324,B,9.0
    2026-10-07,C-331,A,22.0
    2026-10-07,C-332,C,8.5
    2026-10-07,C-333,B,40.0
    CSV
  boxes:
    - prompt: "What `cat Dockerfile` prints."
      checks:
        - {regex: '(?i)^FROM\s+python:3\.14\.10-slim\s*$', says: "FROM python:3.14.10-slim, pinned by its full tag", hint: "Is it exactly python:3.14.10-slim, with nothing after it?"}
        - {regex: '(?i)^WORKDIR\s+/app/?\s*$', says: "WORKDIR /app"}
        - {regex: '(?i)^COPY\s+\S', says: "A COPY line", hint: "COPY takes the files, then where to put them: . is the WORKDIR."}
        - {regex: '(?i)^RUN\s+python3?\s+-m\s+py_compile\s+bay_report\.py\s*$', says: "RUN checks the script at build time"}
        - {regex: '(?i)^CMD\s*\[\s*"python3?"\s*,\s*"bay_report\.py"\s*,\s*"received\.csv"\s*\]\s*$', says: "CMD in exec form: a list of words in double quotes", hint: "Exec form is a list in square brackets, each word in double quotes (not single), separated by commas."}
      example: |
        FROM python:3.14.10-slim
        WORKDIR /app
        COPY bay_report.py received.csv ./
        RUN python -m py_compile bay_report.py
        CMD ["python", "bay_report.py", "received.csv"]
    - prompt: "What `docker run --rm bay-report:1.0` prints."
      checks:
        - {contains: "14 crates, 306.0 kg", says: "CMD ran the report over every crate", hint: "Is the image built from this Dockerfile, with received.csv copied in? Build it again after any change."}
        - {contains: "2026-09-16 C-301 40.5", says: "The first crate of the CSV"}
        - {contains: "2026-10-07 C-333 40.0", says: "The last crate of the CSV"}
        - {lines: {min: 15, max: 15}, says: "Fourteen crates and the summary", hint: "Did something else print, such as a usage line or an error?"}
      example: |
        14 crates, 306.0 kg
        2026-09-16 C-301 40.5
        2026-09-16 C-302 12.0
        2026-09-16 C-303 7.25
        2026-09-23 C-313 4.0
        2026-09-23 C-311 15.0
        2026-09-23 C-314 11.75
        2026-09-23 C-312 26.5
        2026-09-30 C-321 30.0
        2026-09-30 C-322 18.5
        2026-09-30 C-323 61.0
        2026-09-30 C-324 9.0
        2026-10-07 C-331 22.0
        2026-10-07 C-332 8.5
        2026-10-07 C-333 40.0
    - prompt: "What `docker run --rm bay-report:1.0 python bay_report.py received.csv --deck C --min-mass 10` prints."
      checks:
        - {contains: "3 crates, 87.75 kg", says: "The command after the image ran, with the options", hint: "Is the whole command after the image name, python and all?"}
        - {contains: "2026-09-30 C-323 61.0", says: "Deck C's crates over 10 kg"}
        - {not_contains: "14 crates", says: "Not CMD: the command given replaced it"}
        - {not_contains: "executable file not found", says: "Docker found the program to run", hint: "The first word after the image is the program. Did it start with python?"}
      example: |
        3 crates, 87.75 kg
        2026-09-23 C-311 15.0
        2026-09-23 C-314 11.75
        2026-09-30 C-323 61.0
    - prompt: "What `docker run --rm bay-report:1.0 sh -c 'pwd; ls'` prints."
      checks:
        - {regex: '^/app\s*$', says: "The container starts in the WORKDIR, /app"}
        - {regex: '^bay_report\.py\s*$', says: "COPY put the script there"}
        - {regex: '^received\.csv\s*$', says: "and the data"}
        - {regex: '^__pycache__\s*$', says: "RUN's work is in the image: py_compile's __pycache__ folder", hint: "Did RUN python -m py_compile bay_report.py run during the build, after WORKDIR and COPY?"}
      example: |
        /app
        __pycache__
        bay_report.py
        received.csv
comms:
  open:
    - {from: meridian, text: "BAY REPORT · RUNS ON 4 OF 6 CONSOLES · NIGHT SHIFT'S TOTAL DIFFERS FROM DAY SHIFT'S"}
    - {from: okafor, text: "Your report's popular. And every console runs it on whatever Python it happens to have."}
    - {from: okafor, text: "Package it with its Python and its data. One image, one answer."}
  lab_done:
    - {from: meridian, text: "BAY REPORT · IMAGE bay-report:1.0 · 14 CRATES, 306.0 KG · DECK C OVER 10 KG: 3 CRATES, 87.75 KG"}
    - {from: okafor, text: "Same numbers on my console as on yours. That's the whole point."}
  complete:
    - {from: okafor, text: "A Dockerfile is the recipe written down. Anyone can build it, and everyone gets the same thing."}
---

## A Dockerfile

**A Dockerfile is a text file, named `Dockerfile`, of instructions for building an image, one per
line, read from the top.** Each instruction starts with its name in capitals, and these five make a
working image:

| Instruction | What it does |
|---|---|
| `FROM IMAGE` | starts from an existing image: the first line of every Dockerfile |
| `WORKDIR /path` | makes the folder if it's missing, and works there for every instruction after it, as `cd` would; a container from the image starts there too |
| `COPY FILE… DEST` | copies files from your machine into the image; `.` or `./` as DEST is the `WORKDIR` |
| `RUN COMMAND` | runs a command while the image is built, and keeps what it changed |
| `CMD ["PROGRAM", "ARG", …]` | the command a container runs when it starts, unless `docker run` gives one |

**Pin `FROM`'s image by its full tag, such as `python:3.14.10-slim`, not a moving one like
`python:3`** (module 02): `-slim` is Debian with just enough to run Python, and the full version
means a rebuild next month starts from the same Python. A digest pins it harder still, as module 02
showed. **`COPY` with several files and a folder as DEST puts them all in that folder.** **The
`python` images have the program as `python`, as well as `python3`**: there's only one Python
inside, so the short name is safe there, unlike on your own machine (Unit 2.1).

## Building it

**`docker build -t NAME:TAG .` builds the image from the `Dockerfile` in `.`, the folder you're in,
and names it.** **`-t` is short for `--tag`**: the name and tag to give the image. (On `docker
run`, `-t` still means a terminal.) Leave out `:TAG` and the tag is `latest`. **The `.` is the build context: the folder
`docker build` sends to the engine, and the only place `COPY` takes files from.** The output shows a
line for each step as it runs, like `[2/4] WORKDIR /app`: `FROM` is step 1, and `CMD` isn't
counted, because it only records the command for later. And **`naming to … NAME:TAG done`
at the end means the image was made.** An older engine without BuildKit, the builder Docker has used by default since version 23, prints `Step 1/5 : FROM …`
lines instead, and ends with `Successfully tagged NAME:TAG`. **`docker images NAME` lists it, and
`docker rmi NAME:TAG` removes it**, printing `Untagged:` and `Deleted:` lines.

## Build time and run time

**`RUN` runs once, during the build, and what it leaves in the filesystem is saved into the image.**
Installing packages, compiling and making folders go there, so every container starts with them
already done. **`CMD` runs each time a container starts.** If a `RUN` command fails, the build stops
and no image is made.

**`COPY` copies files as they are when you build.** The image never changes after that, so **after
changing a file it copies, build again**: the new image takes over the name. Try it does exactly
that.

## Running it with arguments

**`CMD`'s exec form is a list: each word in double quotes, separated by commas, in square
brackets.** Docker runs that program itself, as process 1, so `docker stop`'s TERM (module 03) goes to
the program, which can finish cleanly if it handles it. **The shell form, `CMD python
bay_report.py`, runs it under `/bin/sh -c` instead**: process 1 is the shell, which gets the TERM
and doesn't pass it on. Prefer exec form. **Single quotes aren't exec form**: `CMD ['python', …]` is
read as shell form, and the container fails with `[python,: not found`.

**Anything after the image name on `docker run` replaces `CMD` whole, and its first word is the
program to run.** So with the bay's image, `docker run --rm bay-report:1.0 python bay_report.py received.csv`
runs that command, and `docker run --rm bay-report:1.0 --deck C` fails with `exec: "--deck": executable file not found`, because
Docker looked for a program called `--deck`. Give the whole command.

## Why the summary can come first

**With no terminal, Python holds printed lines back and prints them together when it ends**, while
`stderr` comes out at once. So a summary printed to `stderr` can come before the lines printed
earlier to `stdout`. `docker run -t` gives the container a terminal (module 01), and the order comes
back.

**On the real station:** this course's own `Dockerfile` builds `FROM python:3.14.10-slim@sha256:…`,
the same Python pinned by digest too. It's in several stages, `AS base` and others, which Unit 2.3
covers: read the `base` one. It sets `WORKDIR /app`, `COPY`s the code in, `RUN`s `pip install`, and
sets `CMD ["uvicorn", "app.main:app", …]` in exec form. Release builds run in GitHub Actions, so the image that reaches the droplet is the one
CI built, not one from someone's laptop.

## Try it

```bash
mkdir try-build
cd try-build
printf 'import sys\nprint("args:", sys.argv[1:])\n' > show_args.py
printf 'FROM python:3.14.10-slim\nWORKDIR /work\nCOPY show_args.py .\nCMD ["python", "show_args.py", "default"]\n' > Dockerfile
cat Dockerfile
docker build -t try-args .
docker run --rm try-args
docker run --rm try-args python show_args.py one two
docker run --rm try-args pwd
printf 'import sys\nprint("ARGS:", sys.argv[1:])\n' > show_args.py
docker run --rm try-args
docker build -t try-args .
docker run --rm try-args
docker images try-args --format "{{.Repository}} {{.Tag}}"
cd ..
rm -r try-build
docker rmi try-args
```

`printf` writes each file, `\n` making a new line. Near its end, the build's output says `naming
to docker.io/library/try-args:latest done`: no tag given, so `latest`. The first run prints
`args: ['default']`, from `CMD`; the second, `args: ['one', 'two']`, its own command in place of
`CMD`; `pwd` prints `/work`, the `WORKDIR`. After `show_args.py` changes, the image still prints
`args: ['default']`: it holds the old copy. Built again, it prints `ARGS: ['default']`. The listing's
`{{.Repository}}` is the image's name before the colon, so it shows `try-args latest`, and `docker rmi`
prints `Untagged: try-args:latest` and a `Deleted:` line.
