---
# A lab (#454), like every Docker module. Every output quoted here is from a real run on Docker
# Engine 29.7.2, with BuildKit (buildx 0.36.1) and with the legacy builder (DOCKER_BUILDKIT=0), on
# python:3.14.10-slim and alpine:3.24 (2026-11-17). The cache checks accept BuildKit's plain and
# terminal output and the legacy builder's, since which one a learner gets depends on their install.
title: Layers and the build cache
minutes: 20
story: |
  **Mission log, day 63.** The bay's image works, and every change to it is a wait. A one-line fix
  to the cutter's script, and the build downloads and installs every package again. "Minutes, for one
  line," says Okafor. "And while you're in there: the image is carrying the depot token. Find out
  what else it's carrying that it shouldn't."
quiz:
  - type: choice
    q: "Only `app.py` changed since the last build. Why did `pip install` run again, and what fixes it?"
    code: |-
      FROM python:3.14.10-slim
      WORKDIR /app
      COPY . .
      RUN pip install --no-cache-dir -r requirements.txt
      CMD ["python", "app.py"]
    lang: dockerfile
    options:
      - "`--no-cache-dir` turns the build cache off: remove it"
      - "`pip install` always runs: Docker never caches a `RUN`"
      - "`COPY . .` copies `app.py`, so its layer changed and every step after it was rebuilt. Copy `requirements.txt` and install first, then `COPY . .`"
      - "The base image was updated: pin it by digest"
    answer: 2
    explain: >-
      A step's cache is used only if everything before it was cached too. `COPY . .` sees a changed
      file, so it misses, and the `RUN` after it runs again whatever it says. `--no-cache-dir` is
      pip's own download cache, not Docker's: it keeps the image smaller, and has nothing to do with
      the build cache.
  - type: choice
    q: "Which of these does `docker history IMAGE` show?"
    options:
      - "Every container that was ever started from the image"
      - "The image's layers, newest first, with the instruction that made each and its size"
      - "Every build of the image, with the time each one took"
      - "The files that changed since the image was pulled"
    answer: 1
    explain: >-
      One line per layer, newest at the top: your own instructions first, then the base image's
      below them. `<missing>` in the ID column is normal: those layers have no image of their own.
  - type: choice
    q: "A `.dockerignore` says `*.md`, but `docs/calibration.md` is still in the image. Why?"
    options:
      - "`.dockerignore` only takes effect after `docker system prune`"
      - "Markdown files are always copied: Docker reads them as documentation"
      - "`.dockerignore` must be inside `docs/` too"
      - "`*.md` matches only in the top folder of the build context: `**/*.md` matches in every folder"
    answer: 3
    explain: >-
      In `.dockerignore`, `*` stops at a `/`, so `*.md` is the top folder's `.md` files. `**` matches
      any number of folders, so `**/*.md` catches every one. Budget Buddy's image shipped its `docs/`
      folder for months from that exact gap.
  - type: fill
    q: "Which file, in the build context, lists what `docker build` should leave out of it?"
    answer: [".dockerignore", "dockerignore"]
    explain: >-
      `.dockerignore`, beside the `Dockerfile`: one pattern a line. What it matches never reaches the
      engine, so no `COPY` can put it in the image.
  - type: choice
    q: "You want to see how long each step takes and what `RUN pip install` printed. BuildKit shows each step on one line that disappears. What do you add to `docker build`?"
    options:
      - "`--progress=plain`, which prints every step's output in full"
      - "`--no-cache`, which shows the output of every step"
      - "`-t`, which gives the build a terminal"
      - "`-q`, for the full log"
    answer: 0
    explain: >-
      `--progress=plain` writes the build out line by line, as it would to a file, with each step's
      output and a `CACHED` line for each step it reused. `--no-cache` makes every step run, `-t`
      names the image, and `-q` prints only the image's ID.
cards:
  - id: one-layer-per-instruction
    section: "One layer per instruction"
    front: "Which Dockerfile instructions add a layer, and how do you list an image's layers?"
    back: "Each instruction that changes the files (`RUN`, `COPY`, `WORKDIR`) adds one; `docker history IMAGE` lists them, newest first."
  - id: cache-miss-cascades
    section: "The build cache"
    front: "One step's cache misses. What happens to the steps after it?"
    back: "They all run again: a step's cache is used only if every step before it was cached too."
  - id: requirements-first
    section: "Order for the cache"
    front: "In what order should a Python Dockerfile copy and install, so a code change doesn't reinstall everything?"
    back: "`COPY requirements.txt .`, then `RUN pip install -r requirements.txt`, then `COPY . .`."
  - id: dockerignore-double-star
    section: "Leaving things out: .dockerignore"
    front: "In `.dockerignore`, what's the difference between `*.md` and `**/*.md`?"
    back: "`*.md` matches only the top folder's; `**/*.md` matches in every folder."
  - id: cached-in-the-output
    section: "Reading the build"
    front: "How does a build's output say a step was reused from the cache?"
    back: "BuildKit: `CACHED` (`#8 CACHED` with `--progress=plain`, `=> CACHED [4/5]` in a terminal). The older builder: `---> Using cache`."
lab:
  from: okafor
  task: |-
    Make a one-line change cheap to build, and keep what doesn't belong out of the image. On Windows,
    use Git Bash (module 01).

    Every build here is `docker build --progress=plain -t bay-cache .`. If Docker says
    `unknown flag: --progress`, your engine has the older builder: leave `--progress=plain` off every
    build, and paste what it prints just the same.

    1. Run the setup below. It makes `~/meridian/bay-cache` with the cutter's `app.py`, its pinned
       `requirements.txt`, a `Dockerfile`, and some things that don't belong in an image. Stay in that
       folder.
    2. Build it. The first build downloads the packages, which takes a minute.
    3. Make a one-line change, `echo 'print("job 2: hull plate")' >> app.py`, and build again. Paste
       everything the second build printed in the first box.
    4. In `nano` (Unit 1.2, *Reading and editing*) or any editor, change the `Dockerfile` so that it
       copies `requirements.txt` and runs the `pip install` before it copies everything else, leaving
       the other lines as they are, and the new `COPY` after `WORKDIR`. Build it once: the install runs
       again this time, because the steps changed. Then make another one-line change,
       `echo 'print("job 3: bracket")' >> app.py`, and build again. Paste everything that last build
       printed in the second box.
    5. Write a `.dockerignore` that leaves out `bay.env`, the `scans` folder, and every `.md` file in
       any folder. Build again, then run `docker run --rm bay-cache find . -type f`, and paste what it
       prints in the third box.
    6. Run `docker history bay-cache --format "{{.CreatedBy}}"`, and paste what it prints in the last
       box.
    7. When the boxes pass, clean up: `docker rmi bay-cache`, then `cd ~ && rm -r ~/meridian/bay-cache`.
  setup: |-
    mkdir -p ~/meridian/bay-cache/scans ~/meridian/bay-cache/docs && cd ~/meridian/bay-cache
    printf 'certifi==2026.10.23\ncharset-normalizer==3.5.2\nidna==3.20\nrequests==2.34.2\nurllib3==2.8.0\n' > requirements.txt
    printf 'import requests\n\nprint("cutter: ready, requests", requests.__version__)\n' > app.py
    printf 'FROM python:3.14.10-slim\nWORKDIR /app\nCOPY . .\nRUN pip install --no-cache-dir -r requirements.txt\nCMD ["python", "app.py"]\n' > Dockerfile
    printf 'DEPOT_TOKEN=bay-7f3e-not-for-images\n' > bay.env
    printf 'raw hull scan, 2026-10-01\n' > scans/hull-scan-001.raw
    printf 'Cutter notes. Not for the image.\n' > README.md
    printf 'Cutter calibration. Not for the image either.\n' > docs/calibration.md
  boxes:
    - prompt: "Everything the build after `job 2` printed."
      checks:
        - {regex: '(?i)Successfully installed|^\s*=> \[\s*\d+/\d+\] RUN pip install', says: "pip install ran again for a one-line change: the slow build", hint: "Is this the build after the echo, with the setup's Dockerfile unchanged?"}
        - {regex: '(?i)naming to \S*bay-cache|Successfully tagged bay-cache', says: "The image was built and named bay-cache", hint: "Did the build finish? Look for an error near the end."}
      example: |
        #0 building with "default" instance using docker driver

        #1 [internal] load build definition from Dockerfile
        #1 transferring dockerfile: 160B done
        #1 DONE 0.0s

        #2 [internal] load metadata for docker.io/library/python:3.14.10-slim
        #2 DONE 0.0s

        #3 [internal] load .dockerignore
        #3 transferring context: 2B done
        #3 DONE 0.0s

        #4 [1/4] FROM docker.io/library/python:3.14.10-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f
        #4 resolve docker.io/library/python:3.14.10-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f 0.0s done
        #4 DONE 0.0s

        #5 [internal] load build context
        #5 transferring context: 383B done
        #5 DONE 0.0s

        #6 [2/4] WORKDIR /app
        #6 CACHED

        #7 [3/4] COPY . .
        #7 DONE 0.0s

        #8 [4/4] RUN pip install --no-cache-dir -r requirements.txt
        #8 0.891 Collecting certifi==2026.10.23 (from -r requirements.txt (line 1))
        #8 0.986   Downloading certifi-2026.10.23-py3-none-any.whl.metadata (2.5 kB)
        #8 1.158 Collecting charset-normalizer==3.5.2 (from -r requirements.txt (line 2))
        #8 1.181   Downloading charset_normalizer-3.5.2-cp314-cp314-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl.metadata (46 kB)
        #8 1.231 Collecting idna==3.20 (from -r requirements.txt (line 3))
        #8 1.251   Downloading idna-3.20-py3-none-any.whl.metadata (7.2 kB)
        #8 1.282 Collecting requests==2.34.2 (from -r requirements.txt (line 4))
        #8 1.304   Downloading requests-2.34.2-py3-none-any.whl.metadata (4.8 kB)
        #8 1.334 Collecting urllib3==2.8.0 (from -r requirements.txt (line 5))
        #8 1.355   Downloading urllib3-2.8.0-py3-none-any.whl.metadata (7.4 kB)
        #8 1.379 Downloading certifi-2026.10.23-py3-none-any.whl (135 kB)
        #8 1.427 Downloading charset_normalizer-3.5.2-cp314-cp314-manylinux2014_aarch64.manylinux_2_17_aarch64.manylinux_2_28_aarch64.whl (247 kB)
        #8 1.473 Downloading idna-3.20-py3-none-any.whl (69 kB)
        #8 1.500 Downloading requests-2.34.2-py3-none-any.whl (73 kB)
        #8 1.528 Downloading urllib3-2.8.0-py3-none-any.whl (135 kB)
        #8 1.576 Installing collected packages: urllib3, idna, charset-normalizer, certifi, requests
        #8 1.687
        #8 1.688 WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager, possibly rendering your system unusable. It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv. Use the --root-user-action option if you know what you are doing and want to suppress this warning.
        #8 1.688 Successfully installed certifi-2026.10.23 charset-normalizer-3.5.2 idna-3.20 requests-2.34.2 urllib3-2.8.0
        #8 1.689
        #8 1.689 [notice] A new release of pip is available: 26.2.2 -> 26.3
        #8 1.689 [notice] To update, run: pip install --upgrade pip
        #8 DONE 1.8s

        #9 exporting to image
        #9 exporting layers
        #9 exporting layers 0.3s done
        #9 exporting manifest sha256:aff0fd68e579f4af8c508e30ef0603c62872f7c0f97ed8001208a2795c2918e4 done
        #9 exporting config sha256:5d5403c07b7c519b69555287c7cf9215841c94e3cde8b4615faec3e02ffd1cf5 done
        #9 exporting attestation manifest sha256:31015d9de60c186405c4387cbc254055d92c29baa89996b839d511e37107a800 0.0s done
        #9 exporting manifest list sha256:3351500abd2c2f343c5b5595e788ebcab34734f044faa0b9a01f8b97acbd6a30 0.0s done
        #9 naming to docker.io/library/bay-cache:latest done
        #9 unpacking to docker.io/library/bay-cache:latest 0.1s done
        #9 DONE 0.5s
    - prompt: "Everything the build after `job 3` printed."
      checks:
        - {regex: '^#(\d+) \[\s*\d+/\d+\] RUN pip install[^\n]*\n#\1 CACHED|CACHED \[\s*\d+/\d+\] RUN pip install|^Step \d+/\d+ : RUN pip install[^\n]*\n ---> Using cache', says: "pip install was reused from the cache", hint: "Does the Dockerfile copy requirements.txt and run pip install before COPY . .? Build once after reordering, then change app.py and build again."}
        - {not_contains: "Successfully installed", says: "Nothing was installed again"}
        - {regex: '(?i)naming to \S*bay-cache|Successfully tagged bay-cache', says: "The image was built and named bay-cache"}
      example: |
        #0 building with "default" instance using docker driver

        #1 [internal] load build definition from Dockerfile
        #1 transferring dockerfile: 186B done
        #1 DONE 0.0s

        #2 [internal] load metadata for docker.io/library/python:3.14.10-slim
        #2 DONE 0.0s

        #3 [internal] load .dockerignore
        #3 transferring context: 2B done
        #3 DONE 0.0s

        #4 [internal] load build context
        #4 transferring context: 408B done
        #4 DONE 0.0s

        #5 [1/5] FROM docker.io/library/python:3.14.10-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f
        #5 resolve docker.io/library/python:3.14.10-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f 0.0s done
        #5 DONE 0.0s

        #6 [3/5] COPY requirements.txt .
        #6 CACHED

        #7 [2/5] WORKDIR /app
        #7 CACHED

        #8 [4/5] RUN pip install --no-cache-dir -r requirements.txt
        #8 CACHED

        #9 [5/5] COPY . .
        #9 DONE 0.0s

        #10 exporting to image
        #10 exporting layers 0.0s done
        #10 exporting manifest sha256:9f98acaca40104935c9edfa01dfba0800baf79b907d174a76c538a6d0ae144bb done
        #10 exporting config sha256:146992869caa0a613ecf1bf0df8bb958d45ae4e9505d1a670d9efaa36e84e9d5 done
        #10 exporting attestation manifest sha256:eb78f99a370c1e0f7dbdda2bf47b51cea2bf837ad5672623e2b2d51d79ad6ba8 done
        #10 exporting manifest list sha256:613074687dc3f4a02abf58a923eb73cf8e65636daae2a97873c873203d99660a done
        #10 naming to docker.io/library/bay-cache:latest done
        #10 unpacking to docker.io/library/bay-cache:latest 0.0s done
        #10 DONE 0.1s
    - prompt: "What `find . -type f` printed inside the image."
      checks:
        - {contains: "./app.py", says: "The cutter's script is in the image", hint: "Was the image built again after writing .dockerignore?"}
        - {contains: "./requirements.txt", says: "and its requirements"}
        - {not_contains: "bay.env", says: "The depot token is left out", hint: "Is bay.env a line of its own in .dockerignore, spelled exactly?"}
        - {not_contains: "scans", says: "The scans folder is left out"}
        - {not_contains: "README.md", says: "The top folder's .md is left out"}
        - {not_contains: "calibration.md", says: "and the one in docs/", hint: "*.md matches only the top folder. Which pattern matches in every folder?"}
      example: |
        ./.dockerignore
        ./requirements.txt
        ./Dockerfile
        ./app.py
    - prompt: "What `docker history bay-cache --format \"{{.CreatedBy}}\"` printed."
      checks:
        - {regex: '(?:COPY \. \.|COPY dir:)[^\n]*\n[^\n]*pip install[^\n]*\n[^\n]*(?:COPY requirements\.txt|COPY file:)', says: "Newest first: COPY . ., then pip install, then COPY requirements.txt", hint: "Is this the image built after reordering, and is the order in the Dockerfile requirements first?"}
        - {regex: '(?i)CMD \["python" "app\.py"\]', says: "The image's own CMD is the newest layer's"}
      example: |
        CMD ["python" "app.py"]
        COPY . . # buildkit
        RUN /bin/sh -c pip install --no-cache-dir -r…
        COPY requirements.txt . # buildkit
        WORKDIR /app
        CMD ["python3"]
        RUN /bin/sh -c set -eux;  for src in idle3 p…
        RUN /bin/sh -c set -eux;   savedAptMark="$(a…
        ENV PYTHON_SHA256=de414a57119abef52784d8993e…
        ENV PYTHON_VERSION=3.14.10
        RUN /bin/sh -c set -eux;  apt-get update;  a…
        ENV LANG=C.UTF-8
        ENV PATH=/usr/local/bin:/usr/local/sbin:/usr…
        # debian.sh --arch 'arm64' out/ 'trixie' '@1…
comms:
  open:
    - {from: meridian, text: "BAY IMAGE · LAST REBUILD: 1-LINE CHANGE · PACKAGES REINSTALLED: 5 · DEPOT TOKEN FOUND IN IMAGE"}
    - {from: okafor, text: "Every build reinstalls everything, for one line of Python. And the depot token's in there."}
    - {from: okafor, text: "Make a one-line change cost one line of build. Then find out what else we're shipping."}
  lab_done:
    - {from: meridian, text: "BAY IMAGE · REBUILD AFTER 1-LINE CHANGE: pip install CACHED · bay.env, scans/, 2 .md FILES: LEFT OUT"}
    - {from: okafor, text: "One line, a couple of seconds. And the token stays on this side of the hatch."}
  complete:
    - {from: okafor, text: "Put what changes least at the top, what changes most at the bottom, and never send the engine anything you wouldn't hand to a stranger."}
---

## One layer per instruction

**An image is a stack of layers, and each instruction that changes the files (`RUN`, `COPY`,
`WORKDIR`) adds one on top.** A layer holds only what that step changed. Your Dockerfile's layers sit
on the base image's own, which `FROM` brings. **`docker history IMAGE` lists the layers, newest
first**: your instructions at the top, the base image's below them, each with the instruction that
made it (`CREATED BY`) and its size. Instructions that only record a setting are listed too, at `0B`: `CMD`,
and `ENV NAME=value`, which sets an environment variable for every container from the image, as `-e`
does for one (module 04). **`<missing>` in the ID column is normal: layers that came as part of the
base image have no ID on your machine.** With `--format "{{.CreatedBy}}"` it prints just the
instructions, one a line. **Long lines are cut short with `…`; `--no-trunc` prints them in full.**

## The build cache

**`docker build` keeps every layer it makes, and reuses one when the same step comes round again
on the same layers below.** That's the build cache. A step is reused when:

| Step | Reused if |
|---|---|
| `RUN` | its line is the same as last time |
| `WORKDIR`, `CMD`, `ENV` | the line is the same |
| `COPY` | the files it copies are the same, byte for byte |
| any step | **every step above it was reused too** |

**The last row is the one that matters: once a step misses, every step after it runs again**, even
an unchanged `RUN`. And **a `RUN` is reused on its line alone**: `RUN pip install requests` doesn't
notice a new version on the internet. `docker build --no-cache` runs every step, for when you want
that. **`pip install --no-cache-dir` is pip's own flag, not Docker's**: it stops pip keeping a copy
of each download, so the image is smaller, and it leaves the build cache alone.

**The cache takes disk space: `docker system df` (module 06) shows it as `Build Cache`, and `docker
builder prune` clears it**, asking first. Nothing is lost but time: the next build makes the layers
again.

## Order for the cache

So the order of the steps decides what a change costs. **Put what changes least near the top, and
what changes most at the bottom.** For Python, the code changes every day, and the packages
rarely: **copy `requirements.txt` on its own, `RUN pip install`, and only then `COPY . .`.** A code
change then misses at the last `COPY`, and the `pip install` above it is reused. Change
`requirements.txt` and the install runs again, as it should. **`COPY requirements.txt .` goes after
`WORKDIR`, so the file lands where `pip install -r` looks.** **The first build after reordering still
installs everything**: `COPY requirements.txt .` is a new step, so the cache misses there. From the
next build on, a code change reuses the install.

## Reading the build

**`--progress=plain` on `docker build` prints every step in full**, as it would to a file: each
step's output, its time, and whether it was reused. Without it, BuildKit draws each step on one line
in a terminal and hides what it printed. The older builder, which some Linux installs still have,
always prints in full, and refuses `--progress` with `unknown flag: --progress`. In full, `pip
install` also prints a `WARNING` about running as `root` and a `[notice]` about a newer pip: both are
expected in a build, and running as another user is Unit 2.3's.

**In BuildKit's plain output, `#8` is its own count of everything it does, `[internal]` steps such
as loading the `Dockerfile` included; `[4/5]` is the Dockerfile's step.** BuildKit runs steps that
don't depend on each other at once, so they can print out of order.

| Builder | A reused step | A step that ran |
|---|---|---|
| BuildKit, `--progress=plain` | `#8 [4/5] RUN pip …` then `#8 CACHED` | its output, then `#8 DONE 2.1s` |
| BuildKit, in a terminal | `=> CACHED [4/5] RUN pip …` | `=> [4/5] RUN pip …  2.1s` |
| the older builder | `Step 4/6 : RUN pip …` then `---> Using cache` | its output |

## Leaving things out: .dockerignore

**`docker build` sends the build context, the folder named by `.`, to the engine before any step
runs, and `COPY . .` copies all of it into the image**: secrets, scans, notes. Anyone who pulls the
image can read them. **`.dockerignore`, a file beside the `Dockerfile`, lists what to leave out of
the context, one pattern a line.** What it matches never reaches the engine, so no `COPY` can take it.

| Pattern | Leaves out |
|---|---|
| `.env` | that file, in the top folder |
| `backups/` | that folder and everything in it |
| `*.log` | `.log` files **in the top folder only**: `*` stops at a `/` |
| `**/*.log` | `.log` files in **every** folder |
| `!keep/**/*.log` | an exception: puts these back, after a pattern above left them out |

**`COPY . .` copies the `Dockerfile` and the `.dockerignore` too**: they're harmless, and can be
listed as well.

**On the real station:** this course's `.dockerignore` leaves out `.env`, backups, `.git` and more,
and has `**/*.md` with a warning learned next door: Budget Buddy's said `*.md` for months, and every
file in its `docs/` shipped in the image, unnoticed because the one file anyone checked, `CLAUDE.md`,
was left out by a line of its own. The next line here is `!content/**/*.md`, because this course's
lessons are Markdown and the app reads them. And its `Dockerfile` copies `requirements.txt` and
installs before `COPY . .`, for the cache.

## Try it

```bash
mkdir try-cache
cd try-cache
echo one > note.txt
echo token > secret.txt
printf 'FROM alpine:3.24\nRUN echo built > /built.txt\nCOPY . /ctx/\nCMD ["ls", "/ctx"]\n' > Dockerfile
docker build --progress=plain -t try-cache .
docker run --rm try-cache
echo two > note.txt
docker build --progress=plain -t try-cache .
printf 'secret.txt\n' > .dockerignore
docker build --progress=plain -t try-cache .
docker run --rm try-cache
docker history try-cache
cd ..
rm -r try-cache
docker rmi try-cache
```

The first run lists `Dockerfile`, `note.txt` and `secret.txt`: `COPY . /ctx/` took everything. After
`note.txt` changes, the second build shows a `CACHED` line under the `RUN` step and runs the `COPY` again.
With `.dockerignore`, the run lists only `Dockerfile` and `note.txt` (`ls` hides names starting with
a dot, so `.dockerignore` doesn't show). `docker history` puts `CMD`, `COPY` and `RUN` at the top and
Alpine's own two layers below, with `<missing>` for every ID but the newest. On the older builder,
leave out `--progress=plain`.
