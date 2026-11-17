"""Unit 2.2, Docker fundamentals: what each module has to hold, beyond the rules every module
meets. Every module is a lab (#446): Docker can't run in the browser, so the learner pastes what
their own Docker printed, and these tests hold the checks to what any engine prints."""

import pytest

from app import lab
from tests.conftest import real_catalog


def _module(slug):
    return real_catalog().modules[slug]


def _is_complete_lab(module):
    assert module.body_html
    assert module.lab and not module.challenge and not module.terminal
    assert any(q.type == "choice" and q.code for q in module.quiz), "a scenario question"
    assert len(module.cards) >= 3  # the loader refuses a card whose section isn't a heading
    for beat in ("open", "lab_done", "complete"):
        assert getattr(module.comms, beat), beat


def _passes(module, pasted):
    return lab.grade(module.lab, pasted).passed


# --- 01 What a container is (#447) ----------------------------------------------------------
@pytest.mark.criterion(447, "Module 01 of Unit 2.2 is complete content")
def test_module_01_is_complete():
    module = _module("what-a-container-is")
    _is_complete_lab(module)
    assert module.unit == "docker" and real_catalog().unit_modules("docker")[0] is module


@pytest.mark.criterion(447, "Module 01's lab checks hold on any machine")
def test_module_01s_lab_checks_hold_on_any_machine():
    """The example is a real run on Docker Engine 29 on Linux (arm64). Docker Desktop's banner,
    another architecture, other PIDs and a slower status line still pass; an engine that isn't
    running, a missing docker group, ps run on the host and a container run with --rm don't."""
    module = _module("what-a-container-is")
    version, hello, session, leftover = (box.example for box in module.lab.boxes)
    assert _passes(module, [version, hello, session, leftover])

    desktop = version.replace("Server: Docker Engine - Community", "Server: Docker Desktop 4.52.0 (210994)").replace("linux/arm64", "linux/amd64")
    slower = leftover.replace("Less than a second ago", "3 seconds ago")
    other_pids = session.replace("    9 root      0:00 ps", "   12 root      0:00 ps")
    assert _passes(module, [desktop, hello, other_pids, slower])

    def fails(box, text):
        pasted = [version, hello, session, leftover]
        pasted[box] = text
        return not _passes(module, pasted)

    client_only = version.split("\nServer:")[0] + "\nfailed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running"
    assert fails(0, client_only)
    assert fails(0, version.split("\nServer:")[0] + "\nCannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?")
    assert fails(0, version.split("\nServer:")[0] + "\npermission denied while trying to connect to the docker API at unix:///var/run/docker.sock")
    host_ps = session.replace("    1 root      0:00 sh\n", "    1 root      0:02 /sbin/init\n 2214 sean      0:00 -bash\n")
    assert fails(2, host_ps)
    assert fails(2, session.replace("v3.24", "v3.21"))  # an older alpine than the task's
    assert fails(3, "still here\ncargo-check\n")  # run with --rm: nothing left to list or remove


def test_module_01s_comms_count_what_the_lab_runs():
    module = _module("what-a-container-is")
    said = " ".join(m.text for m in module.comms.lab_done)
    runs = module.lab.task.count("docker run ")
    assert runs == 3 and f"TEST CONTAINERS: {runs} · LEFT BEHIND: 0" in said


# --- 02 Images, tags and digests (#448): clue 1 of Unit 2.2 -------------------------------------
@pytest.mark.criterion(448, "Module 02 of Unit 2.2 is complete content")
def test_module_02_is_complete():
    _is_complete_lab(_module("images-tags-and-digests"))


@pytest.mark.criterion(448, "Module 02's lab checks hold on any machine")
def test_module_02s_lab_checks_hold_on_any_machine():
    """The example is a real run on the containerd image store. The classic store's IDs, other IDs
    and a digest written with docker.io/library/ pass; a run by tag instead of digest's output, the
    evidence tag on the wrong image, or the old build's date pasted twice don't."""
    module = _module("images-tags-and-digests")
    digest, before, dates, after = (box.example for box in module.lab.boxes)
    assert _passes(module, [digest, before, dates, after])

    other_ids = [
        "docker.io/library/" + digest,
        before.replace("da0084b573e5", "a1b2c3d4e5f6").replace("1a63198d1a17", "0f1e2d3c4b5a"),
        dates.replace("\n", "\r\n"),
        "stable a1b2c3d4e5f6\nevidence a1b2c3d4e5f6\n2026-09-28 0f1e2d3c4b5a\n",  # the other order
    ]
    assert _passes(module, other_ids)

    def fails(box, text):
        pasted = [digest, before, dates, after]
        pasted[box] = text
        return not _passes(module, pasted)

    assert fails(0, "alpine:3.24\n3.24.4\n")  # the name, not the digest
    assert fails(1, after)  # pasted after the evidence tag
    assert fails(2, "2026-09-28T07:12:00Z\n2026-09-28T07:12:00Z\n")
    assert fails(3, "evidence 1a63198d1a17\nstable da0084b573e5\n2026-09-28 1a63198d1a17\n")  # tagged the old build


def test_module_02s_clue_is_what_the_setup_builds():
    """docs/story.md's clue 1: stable's created label says 2026-09-30, the 09-28 build's says 09-28, and
    the authors label and extra layer (module 10's clue) are already depot-sync's, so module 10 finds
    the same images. The build files are base64, so the setup on the page shows none of it."""
    import base64
    import re

    module = _module("images-tags-and-digests")
    setup = module.lab.setup
    built = {
        tag: base64.b64decode(encoded).decode()
        for encoded, tag in re.findall(r"^echo '([A-Za-z0-9+/=]+)' \| base64 --decode \| docker build -q -t meridian/fabricator:(\S+) -$", setup, re.M)
    }
    assert set(built) == {"2026-09-28", "stable"}
    assert 'org.opencontainers.image.created="2026-09-28T07:12:00Z"' in built["2026-09-28"]
    assert 'org.opencontainers.image.authors="fabrication bay"' in built["2026-09-28"] and "sync-agent" not in built["2026-09-28"]
    assert 'org.opencontainers.image.created="2026-09-30T03:47:00Z"' in built["stable"]
    assert 'org.opencontainers.image.authors="depot-sync"' in built["stable"] and "/usr/local/bin/sync-agent" in built["stable"]
    # Shown to copy, the setup gives none of it away (the reviewer's catch): the clues come from Docker.
    for clue in ("2026-09-30", "depot-sync", "sync-agent", "fabrication bay"):
        assert clue not in setup
    said = " ".join(m.text for m in module.comms.lab_done)
    assert "2026-09-30T03:47Z" in said and "C-323" in said
    assert "C-323" not in " ".join(m.text for m in module.comms.complete)  # a clue a task finds stays out of complete
    assert "#" not in setup  # a pasted setup has no comments for zsh to trip on (#429)


# --- 03 A container's life (#449) -------------------------------------------------------------
@pytest.mark.criterion(449, "Module 03 of Unit 2.2 is complete content")
def test_module_03_is_complete():
    _is_complete_lab(_module("a-containers-life"))


@pytest.mark.criterion(449, "Module 03's lab checks hold on any machine")
def test_module_03s_lab_checks_hold_on_any_machine():
    """The example is a real run on Docker Engine 29.7.2. Other times and tick numbers, CRLF and a
    slower machine pass; the shortcuts and slips don't."""
    module = _module("a-containers-life")
    listing, logs, stopped, retried = (box.example for box in module.lab.boxes)
    assert _passes(module, [listing, logs, stopped, retried])

    later = [
        listing.replace("4 seconds", "12 seconds"),
        logs.replace("tick 3\ntick 4\ntick 5", "tick 11\ntick 12\ntick 13").replace("\n", "\r\n"),
        stopped.replace("Less than a second ago", "3 seconds ago"),
        retried,
    ]
    assert _passes(module, later)

    def fails(box, text):
        pasted = [listing, logs, stopped, retried]
        pasted[box] = text
        return not _passes(module, pasted)

    assert fails(0, "job-watch Up 4 seconds\njob-watch Up 4 seconds\n")  # never ran -a
    assert fails(1, "cutting panel 7\ntick 5\n")  # not --tail 3
    assert fails(1, "cutting panel 7\ntick 1\ntick 2\ntick 3\ntick 4\ntick 5\n")  # every tick: no --tail
    assert fails(2, "job-watch\njob-watch Exited (0) Less than a second ago\n")  # not what stop leaves
    assert fails(3, "0 exited\nattempt\n")  # no restart policy
    assert fails(3, "2 restarting\nattempt\nattempt\nattempt\n")  # inspected too soon


def test_module_03s_comms_quote_the_labs_figures():
    """MERIDIAN's lab_done line is what the examples show: exit 3, 137 and three restarts."""
    module = _module("a-containers-life")
    listing, _, stopped, retried = (box.example for box in module.lab.boxes)
    said = " ".join(m.text for m in module.comms.lab_done)
    assert "Exited (3)" in listing and "job-fail: EXIT 3" in said
    assert "Exited (137)" in stopped and "job-watch: STOPPED, EXIT 137" in said
    assert retried.startswith("3 exited") and "job-retry: 3 RESTARTS, GAVE UP" in said
    assert "on-failure:3" in module.lab.task


# --- 04 Inside a running container (#450) ------------------------------------------------------
@pytest.mark.criterion(450, "Module 04 of Unit 2.2 is complete content")
def test_module_04_is_complete():
    _is_complete_lab(_module("inside-a-running-container"))


@pytest.mark.criterion(450, "Module 04's lab checks hold on any machine")
def test_module_04s_lab_checks_hold_on_any_machine():
    """The examples are a real run of the lab on Docker Engine 29.7.2. Other PIDs, another order
    of Env entries and CRLF pass; the slips don't."""
    module = _module("inside-a-running-container")
    printed, ps, env, survives = (box.example for box in module.lab.boxes)
    assert _passes(module, [printed, ps, env, survives])

    other = [
        printed.replace("\n", "\r\n"),
        ps.replace("    7 root", "    9 root").replace("   14 root", "   21 root"),
        "BAY=fabrication\nSHIFT=night\nMODE=cutting\nTOLERANCE=0.2\nPATH=/usr/local/sbin:/usr/bin:/bin\n",
        survives,
    ]
    assert _passes(module, other)

    def fails(box, text):
        pasted = [printed, ps, env, survives]
        pasted[box] = text
        return not _passes(module, pasted)

    assert fails(0, "fabrication\nnight\n\n\n")  # no --env-file: printenv prints nothing for those
    assert fails(0, 'fabrication\nnight\n"cutting"\n"0.2"\n')  # quotes in the env file are kept
    host_ps = "  PID TTY          TIME CMD\n 2214 pts/0    00:00:00 bash\n 2301 pts/0    00:00:00 ps\n"
    assert fails(1, host_ps)  # ps run on the machine, not with exec
    assert fails(2, env.replace("MODE=cutting\nTOLERANCE=0.2\n", ""))
    assert fails(3, "bay-controller\nbay-controller\ncat: can't open '/tmp/calibration': No such file or directory\n")
    assert fails(3, "calibrated\nbay-controller\ncalibrated\n")  # the last run reused the container


def test_module_04s_setup_is_the_settings_the_checks_expect():
    module = _module("inside-a-running-container")
    assert "printf 'MODE=cutting\\nTOLERANCE=0.2\\n' > bay.env" in module.lab.setup
    assert "#" not in module.lab.setup
    said = " ".join(m.text for m in module.comms.lab_done)
    assert "SETTINGS PASSED IN: 4" in said and module.lab.task.count("-e ") == 2


# --- 05 Ports and networks (#451) --------------------------------------------------------------
@pytest.mark.criterion(451, "Module 05 of Unit 2.2 is complete content")
def test_module_05_is_complete():
    _is_complete_lab(_module("ports-and-networks"))


@pytest.mark.criterion(451, "Module 05's lab checks hold on any machine")
def test_module_05s_lab_checks_hold_on_any_machine():
    """The examples are a real run of the lab on Docker Engine 29.7.2. Another free port and CRLF
    pass; publishing on every address, a missing --network and a reachable default network don't."""
    module = _module("ports-and-networks")
    port, page, by_name, default = (box.example for box in module.lab.boxes)
    assert _passes(module, [port, page, by_name, default])
    assert _passes(module, ["80/tcp -> 127.0.0.1:18088\r\n", page.replace("\n", "\r\n"), by_name, default])

    def fails(box, text):
        pasted = [port, page, by_name, default]
        pasted[box] = text
        return not _passes(module, pasted)

    assert fails(0, "80/tcp -> 0.0.0.0:8088\n80/tcp -> [::]:8088\n")  # -p 8088:80, every address
    assert fails(0, "80/tcp -> 127.0.0.1:8088\n80/tcp -> 0.0.0.0:8089\n")  # a second, open binding
    assert fails(2, "wget: bad address 'scanner'\n")  # the asking container wasn't on bay-net
    assert fails(3, "<title>Welcome to nginx!</title>\n")  # step 5 run with --network bay-net


# --- 06 Volumes and bind mounts (#452) ---------------------------------------------------------
@pytest.mark.criterion(452, "Module 06 of Unit 2.2 is complete content")
def test_module_06_is_complete():
    _is_complete_lab(_module("volumes-and-bind-mounts"))


@pytest.mark.criterion(452, "Module 06's lab checks hold on any machine")
def test_module_06s_lab_checks_hold_on_any_machine():
    """The examples are a real run of the lab on Docker Engine 29.7.2 on Linux. A Mac's uid 501,
    Git Bash's large uids and CRLF pass; a > that replaced job 1, a mount without ./ (an empty
    volume), one without :ro, a --user that didn't take, runs pasted out of order, and a volume left
    behind don't. Box 3 reads id -u, not file owners, which Docker Desktop maps its own way."""
    module = _module("volumes-and-bind-mounts")
    log, spec, uids, after = (box.example for box in module.lab.boxes)
    assert _passes(module, [log, spec, uids, after])
    assert _passes(module, [log.replace("\n", "\r\n"), spec, uids.replace("1000", "501").replace("\n", "\r\n"), after])
    assert _passes(module, [log, spec, uids.replace("1000", "197609"), after])

    def fails(box, text):
        pasted = [log, spec, uids, after]
        pasted[box] = text
        return not _passes(module, pasted)

    assert fails(0, "job 2: bracket\n")  # the second job used >
    assert fails(0, "job 2: bracket\njob 1: hull plate\n")
    assert fails(1, "sh: can't create /specs/spec.txt: Read-only file system\n")  # -v bay-specs:/specs
    assert fails(1, "tolerance 0.1 mm\n")  # no :ro, so the write worked
    assert fails(2, uids.replace("1000", "0"))  # --user didn't take, or Docker run as root
    assert fails(2, "1000\n0\nmade-as-me\nmade-inside\nspec.txt\n")  # pasted in the wrong order
    assert fails(2, "0\n1000\nmade-as-me\nspec.txt\n")  # the first run's file isn't there
    assert fails(3, "DRIVER    VOLUME NAME\nlocal     fab-log\n")


def test_module_06s_comms_count_what_the_lab_runs():
    """MERIDIAN's lab_done line counts the jobs and the containers that touch fab-log."""
    module = _module("volumes-and-bind-mounts")
    said = " ".join(m.text for m in module.comms.lab_done)
    assert "2 JOBS KEPT ACROSS 3 CONTAINERS" in said
    task = module.lab.task
    assert task.count("-v fab-log:/log") == 3 and task.count('echo "job ') == 2


# --- 07 Your first Dockerfile (#453) ------------------------------------------------------------
@pytest.mark.criterion(453, "Module 07 of Unit 2.2 is complete content")
def test_module_07_is_complete():
    _is_complete_lab(_module("your-first-dockerfile"))


@pytest.mark.criterion(453, "Module 07's lab checks hold on any machine")
def test_module_07s_lab_checks_hold_on_any_machine():
    """The examples are a real run of the lab on Docker Engine 29.7.2 with BuildKit. A lowercase
    Dockerfile, COPY . ., python3 (the image has both names), the summary last (as with -t) and CRLF
    pass; a moving tag, shell-form CMD,
    options given without the command, and an image built without RUN don't."""
    module = _module("your-first-dockerfile")
    dockerfile, everything, deck_c, inside = (box.example for box in module.lab.boxes)
    assert _passes(module, [dockerfile, everything, deck_c, inside])
    lower = dockerfile.replace("FROM", "from").replace("COPY bay_report.py received.csv ./", "copy . .")
    summary_last = everything.replace("14 crates, 306.0 kg\n", "") + "14 crates, 306.0 kg\n"
    assert _passes(module, [lower.replace("\n", "\r\n"), summary_last, deck_c.replace("\n", "\r\n"), inside])
    assert _passes(module, [dockerfile.replace('"python"', '"python3"').replace("RUN python ", "RUN python3 "), everything, deck_c, inside])

    def fails(box, text):
        pasted = [dockerfile, everything, deck_c, inside]
        pasted[box] = text
        return not _passes(module, pasted)

    assert fails(0, dockerfile.replace("python:3.14.10-slim", "python:3-slim"))
    assert fails(0, dockerfile.replace('CMD ["python", "bay_report.py", "received.csv"]', "CMD python bay_report.py received.csv"))
    assert fails(2, 'docker: Error response from daemon: failed to create task for container: exec: "--deck": executable file not found in $PATH\n')
    assert fails(2, everything)  # CMD ran: no command after the image
    assert fails(3, inside.replace("__pycache__\n", ""))


def test_module_07s_figures_are_what_the_setup_gives():
    """MERIDIAN's lab_done line and the checks quote the report over the setup's CSV."""
    module = _module("your-first-dockerfile")
    rows = [line.split(",") for line in module.lab.setup.split("cat > received.csv <<'CSV'\n")[1].split("\nCSV")[0].splitlines()[1:]]
    masses = [float(r[3]) for r in rows]
    deck_c = [float(r[3]) for r in rows if r[2] == "C" and float(r[3]) >= 10]
    assert f"{len(masses)} crates, {sum(masses)} kg" == "14 crates, 306.0 kg"
    assert f"{len(deck_c)} crates, {sum(deck_c)} kg" == "3 crates, 87.75 kg"
    said = " ".join(m.text for m in module.comms.lab_done)
    assert "14 CRATES, 306.0 KG" in said and "3 CRATES, 87.75 KG" in said
