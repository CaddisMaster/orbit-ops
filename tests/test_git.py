"""Unit 1.3, Git: each module is complete content, and its lab's checks pass what a
real run prints on any machine and refuse the likely mistakes.

That the steps can be done for real is checked by hand in ubuntu:24.04, and each
box's `example` is pasted from that run (docs/content-authoring.md)."""

import re

import pytest

from app import lab
from app.content import load_catalog


def _module(slug):
    return load_catalog().modules[slug]


def _complete_content(module):
    assert module.body_html and '<h2 id="sec-try-it">Try it</h2>' in module.body_html
    assert any(q.code for q in module.quiz), "a scenario question: a script or output, then a question"
    assert len(module.cards) >= 3
    assert module.lab and module.terminal is None
    assert {"open", "lab_done", "complete"} <= module.comms_html.keys()


def _passes(module, *pastes):
    return lab.grade(module.lab, list(pastes)).passed


# --- 01: Your first repository (#125) -----------------------------------------------------
CLEAN = "On branch master\nnothing to commit, working tree clean\n"


@pytest.mark.criterion(125, "Module 01 of Unit 1.3 is complete content")
def test_module_01_is_complete_content():
    module = load_catalog().unit_modules("git")[0]
    assert module.slug == "your-first-repository"
    _complete_content(module)


@pytest.mark.parametrize(
    "log",
    [
        "1d1ba4d (HEAD -> master) Set the O2 floor to 19.5%\nf474e13 Track airmix.conf\n",  # a terminal
        "1d1ba4d Set the O2 floor to 19.5%\nf474e13 Track airmix.conf\n",  # piped
        "1d1ba4d (HEAD -> main) Set the O2 floor to 19.5%\r\nf474e13 Track airmix.conf\r\n",  # newer git, Windows
        "\n1d1ba4dbe (HEAD -> main) Set the O2 floor to 19.5%  \nf474e13ab Track airmix.conf\n\n",  # a loose paste
    ],
)
def test_module_01s_lab_passes_any_machines_log(log):
    assert _passes(_module("your-first-repository"), log, CLEAN.replace("master", "main"))


@pytest.mark.parametrize(
    "log, status",
    [
        ("1d1ba4d (HEAD -> master) Track airmix.conf\n", CLEAN),  # both changes in one commit
        ("1d1ba4d Set O2 floor to 19.5\nf474e13 Track airmix.conf\n", CLEAN),  # not the task's message
        (
            "f474e13 (HEAD -> master) Track airmix.conf\n",  # the edit was never committed
            "On branch master\nChanges not staged for commit:\n\tmodified:   airmix.conf\n\n"
            'no changes added to commit (use "git add" and/or "git commit -a")\n',
        ),
        (
            "1d1ba4d Set the O2 floor to 19.5%\nf474e13 Track airmix.conf\n",
            "fatal: not a git repository (or any of the parent directories): .git\n",  # run elsewhere
        ),
    ],
)
def test_module_01s_lab_refuses_the_likely_mistakes(log, status):
    assert not _passes(_module("your-first-repository"), log, status)


# --- 02: Staging and diffs (#126) ---------------------------------------------------------
SHOW_ALARM = """commit 198ea12cdefa0695ef6002a4a645d6e24e113ec5 (HEAD -> main)
Author: Ada <ada@example.com>
Date:   Tue Oct 13 12:12:37 2026 +0000

    Lower the pressure-drop alarm to 2.5 kPa

-pressure_drop_alarm_kpa = 4.0
+pressure_drop_alarm_kpa = 2.5
"""
REGEN_LEFT = "@@ -10,4 +10,4 @@ regen_vent = overboard\n-regen_temp_c = 200\n+regen_temp_c = 240\n"


@pytest.mark.criterion(126, "Module 02 of Unit 1.3 is complete content")
def test_module_02_is_complete_content():
    module = load_catalog().unit_modules("git")[1]
    assert module.slug == "staging-and-diffs"
    _complete_content(module)


@pytest.mark.parametrize("status", [" M scrubber.conf\r\n", "M scrubber.conf\n"])  # a drag-select can drop the space
def test_module_02s_lab_passes_any_machines_output(status):
    assert _passes(_module("staging-and-diffs"), status, SHOW_ALARM.replace("\n", "\r\n"), REGEN_LEFT)


def test_module_02s_status_check_still_refuses_a_staged_file():
    status_check = _module("staging-and-diffs").lab.boxes[0].checks[0]
    for staged in ("M  scrubber.conf", "MM scrubber.conf", "?? scrubber.conf"):
        assert not lab.check(status_check, staged)


@pytest.mark.parametrize(
    "status, show, diff",
    [
        ("", SHOW_ALARM + "-regen_temp_c = 200\n+regen_temp_c = 240\n", ""),  # the whole file went in
        ("MM scrubber.conf\n", SHOW_ALARM.replace("Lower the pressure-drop", "Track scrubber.conf #"), REGEN_LEFT),  # staged, never committed
        ("", SHOW_ALARM, ""),  # the untested change was thrown away with git restore
        (" M scrubber.conf\n", SHOW_ALARM.replace("2.5 kPa\n", "2.5kPa\n"), REGEN_LEFT),  # not the task's message
        (" M scrubber.conf\n", SHOW_ALARM + "+regen_temp_c = 240\n", REGEN_LEFT),  # regen committed too
        (" M scrubber.conf\n", SHOW_ALARM, "-pressure_drop_alarm_kpa = 4.0\n+pressure_drop_alarm_kpa = 2.5\n"),  # the wrong hunk left over
    ],
)
def test_module_02s_lab_refuses_the_likely_mistakes(status, show, diff):
    assert not _passes(_module("staging-and-diffs"), status, show, diff)


# --- 03: Reading history (#127) -----------------------------------------------------------
BLAME = "cb9b8e19 (Nakamura 2026-09-22 09:00:00 +0000 3) co2_alarm_ppm = 5000\n"
PICKAXE = "025b30b Quieten the galley alarms\n"
SHOW_PETROV = """commit 025b30b6f43d729166e305726c2a8172866618f6
Author: Petrov <petrov@meridian.example>
Date:   Mon Sep 14 09:00:00 2026 +0000

    Quieten the galley alarms

-co2_alarm_ppm=2000
+co2_alarm_ppm=5000
"""


@pytest.mark.criterion(127, "Module 03 of Unit 1.3 is complete content")
def test_module_03_is_complete_content():
    module = load_catalog().unit_modules("git")[2]
    assert module.slug == "reading-history"
    _complete_content(module)


def test_module_03s_lab_passes_any_machines_output():
    whole_blame = "^a952dc3 (Okafor   2026-09-01 09:00:00 +0000 1) # Alarm thresholds, habitat ring.\r\n" + BLAME.replace("\n", "\r\n")
    assert _passes(
        _module("reading-history"), whole_blame, "025b30b (HEAD -> main) Quieten the galley alarms\n", SHOW_PETROV,
        (DEPOT_PICKAXE + SHOW_DEPOT).replace("\n", "\r\n"),
    )


@pytest.mark.parametrize(
    "blame, pickaxe, show",
    [
        ("025b30b6 (Petrov   2026-09-14 09:00:00 +0000 3) co2_alarm_ppm = 5000\n", PICKAXE, SHOW_PETROV),  # git blame -w
        (BLAME, "cb9b8e1 Align the settings\n", SHOW_PETROV),  # searched for the line as it reads today
        (BLAME, PICKAXE, "commit cb9b8e19\nAuthor: Nakamura <nakamura@meridian.example>\n\n    Align the settings\n\n-co2_alarm_ppm=5000\n+co2_alarm_ppm = 5000\n"),  # showed blame's commit
    ],
)
def test_module_03s_lab_refuses_the_likely_mistakes(blame, pickaxe, show):
    assert not _passes(_module("reading-history"), blame, pickaxe, show, DEPOT_PICKAXE + SHOW_DEPOT)


def test_module_03s_setup_is_the_story():
    """The setup's history is what the lab and the comms say: Petrov set 5000 inside a
    galley commit, and Nakamura's re-spacing is what blame sees."""
    setup = _module("reading-history").lab.setup
    assert "edit alarms.conf 's/^co2_alarm_ppm=2000$/co2_alarm_ppm=5000/'; c Petrov 2026-09-14 \"Quieten the galley alarms\"" in setup
    assert "edit alarms.conf 's/=/ = /';" in setup and 'c Nakamura 2026-09-22 "Align the settings"' in setup
    alarms = setup.split("~/meridian/station-config")[0]
    assert len(re.findall(r"(?:^|; +)c (?:Okafor|Petrov|Nakamura) ", alarms, re.M)) == 15
    assert "\n#" not in setup, "zsh, the Mac's shell, doesn't treat # as a comment when you paste"


# --- 03, the Life Support mystery's Unit 1.3 clue (#160, docs/story.md) --------------------
DEPOT_PICKAXE = "b26750b Update drone credential list\n"
SHOW_DEPOT = """commit b26750b5eea5051761593ba452ec2163fb150f28
Author: depot-sync <depot-sync@depot.example>
Date:   Wed Sep 30 09:00:00 2026 +0000

    Update drone credential list

diff --git a/drones/md-3.list b/drones/md-3.list
-md3-key-0417
-md3-key-0418
+depot-key-a1
+depot-key-a2
+depot-key-a3
diff --git a/etc/cron.d/scrubber-maint b/etc/cron.d/scrubber-maint
new file mode 100644
+# nightly controller flush. do not remove
+35 2 * * *  root  /usr/local/sbin/scrubber-flush >/dev/null 2>&1
"""


@pytest.mark.criterion(160, "Unit 1.3 plants its clue")
def test_module_03s_setup_builds_the_depot_sync_commit():
    """Run in ubuntu:24.04 under bash and pasted into zsh: both give b26750b, and the alarms
    repo's HEAD stays 5bb59d5. The cron file is the one Unit 1.2's console finds."""
    module = _module("reading-history")
    setup = module.lab.setup
    assert 'c depot-sync 2026-09-30 "Update drone credential list" depot-sync@depot.example' in setup
    depot = setup.split('c depot-sync')[0].rsplit("\n", 3)[-3:]
    assert any("> etc/cron.d/scrubber-maint" in line for line in depot)  # added in that commit
    assert any("depot-key-a1" in line for line in depot)  # with the drone's new list
    assert 'c Okafor 2026-10-05' in setup  # and it isn't the newest commit, so it has to be searched for
    cron = load_catalog().modules["scheduling-with-cron"].terminal.files
    planted = next(f.contents for f in cron if f.path == "/etc/cron.d/scrubber-maint")
    assert "35 2 * * *  root  /usr/local/sbin/scrubber-flush >/dev/null 2>&1" in planted
    assert "scrubber-flush" in module.lab.task and "git log -S" in module.lab.task


@pytest.mark.criterion(160, "The lab checks the clue was found")
@pytest.mark.parametrize(
    "pickaxe, show",
    [
        ("", SHOW_DEPOT),  # -S scrubber-maint: a file name, so nothing found
        ("468f05b Rotate the logs at 04:00, after the backups\n", SHOW_DEPOT),  # git log -1 instead of searching
        (DEPOT_PICKAXE, "commit 468f05b\nAuthor: Okafor <okafor@meridian.example>\n\n    Rotate the logs at 04:00, after the backups\n"),  # showed HEAD
        (DEPOT_PICKAXE, SHOW_DEPOT.split("diff --git a/etc")[0]),  # a show cut short before the cron file
    ],
)
def test_module_03s_lab_refuses_a_missed_clue(pickaxe, show):
    assert not _passes(_module("reading-history"), BLAME, PICKAXE, SHOW_PETROV, pickaxe + show)


# --- 04: Branches and merging (#128) ------------------------------------------------------
GRAPH = """*   c15b2f8 (HEAD -> main) Merge branch 'pump-schedule'
|\\
| * c6781b5 Cycle the pumps on a schedule
* | 2806943 Change the filters every 21 days
|/
* aa3f114 Track the pump and filter settings
"""


@pytest.mark.criterion(128, "Module 04 of Unit 1.3 is complete content")
def test_module_04_is_complete_content():
    module = load_catalog().unit_modules("git")[3]
    assert module.slug == "branches-and-merging"
    _complete_content(module)


@pytest.mark.parametrize(
    "graph",
    [
        GRAPH.replace("|\\\n", "|\\  \n").replace("|/\n", "|/  \n"),  # git's own trailing spaces
        # the two commits in the same second can come out the other way round
        GRAPH.replace("| * c6781b5 Cycle the pumps on a schedule\n* | 2806943 Change the filters every 21 days",
                      "| * 2806943 Change the filters every 21 days\n* | c6781b5 Cycle the pumps on a schedule"),
        GRAPH.replace(" (HEAD -> main)", ""),  # piped
    ],
)
def test_module_04s_lab_passes_any_machines_graph(graph):
    assert _passes(_module("branches-and-merging"), graph, "* main\n")


@pytest.mark.parametrize(
    "graph, branches",
    [
        (  # merged by fast-forward: no merge, one line
            "* c6781b5 (HEAD -> main) Cycle the pumps on a schedule\n* 2806943 Change the filters every 21 days\n* aa3f114 Track the pump and filter settings\n",
            "* main\n",
        ),
        (GRAPH, "* main\n  pump-schedule\n"),  # the branch was never deleted
        (GRAPH.replace("Merge branch 'pump-schedule'", "Merge branch 'main' into pump-schedule"), "* main\n"),  # merged the wrong way
    ],
)
def test_module_04s_lab_refuses_the_likely_mistakes(graph, branches):
    assert not _passes(_module("branches-and-merging"), graph, branches)


# --- 05: Merge conflicts (#129) -----------------------------------------------------------
RESOLVED = """# Sensor limits, habitat ring.
co2_warn_ppm = 1200
co2_alarm_ppm = 2000
o2_low_pct = 19.5
pressure_low_kpa = 94
smoke_ppm = 60
humidity_high_pct = 65
"""
MERGED = """*   a843d66 (HEAD -> main) Merge galley-warning: CO2 warning at 1200 ppm
|\\
| * 4970ef8 (galley-warning) Raise the CO2 warning so the galley stops setting it off
* | 0fadf2b Lower the humidity alarm to 65%
* | 548ab9a Lower the CO2 warning for the night shift
|/
* 1448122 Track the sensor limits
"""


@pytest.mark.criterion(129, "Module 05 of Unit 1.3 is complete content")
def test_module_05_is_complete_content():
    module = load_catalog().unit_modules("git")[4]
    assert module.slug == "merge-conflicts"
    _complete_content(module)


def test_module_05s_lab_passes_any_machines_output():
    graph = MERGED.replace(" (galley-warning)", "").replace(" (HEAD -> main)", "").replace("|\\\n", "|\\  \n")
    assert _passes(_module("merge-conflicts"), RESOLVED.replace("\n", "\r\n"), graph)


@pytest.mark.parametrize(
    "conf, graph",
    [
        (RESOLVED.replace("co2_warn_ppm = 1200\n", "<<<<<<< HEAD\nco2_warn_ppm = 1200\n=======\nco2_warn_ppm = 1500\n>>>>>>> galley-warning\n"), MERGED),  # markers left
        (RESOLVED.replace("co2_warn_ppm = 1200\n", "co2_warn_ppm = 1200\nco2_warn_ppm = 1500\n"), MERGED),  # a side's line kept as well
        (RESOLVED.replace("1200", "1500"), MERGED.replace("1200", "1500")),  # took Petrov's side
        (RESOLVED.replace("humidity_high_pct = 65", "humidity_high_pct = 70"), MERGED),  # rewrote the file from memory
        (RESOLVED, "* 0fadf2b (HEAD -> main) Lower the humidity alarm to 65%\n* 548ab9a Lower the CO2 warning for the night shift\n* 1448122 Track the sensor limits\n"),  # aborted
    ],
)
def test_module_05s_lab_refuses_the_likely_mistakes(conf, graph):
    assert not _passes(_module("merge-conflicts"), conf, graph)


def test_module_05s_setup_is_the_brief():
    """The two branches really hold the values the task and comms quote."""
    setup = _module("merge-conflicts").lab.setup
    assert "co2_warn_ppm = 1500/'\nc Petrov" in setup
    assert "co2_warn_ppm = 800/'\nc Nakamura" in setup
    assert "\n#" not in setup


# --- 06: Remotes (#130) -------------------------------------------------------------------
LOG3 = """388e174 (HEAD -> main, origin/main, origin/HEAD) Add the beacon interval
5d0e4cc Retry the uplink every 30 seconds
9c89c21 Track the relay settings
"""


@pytest.mark.criterion(130, "Module 06 of Unit 1.3 is complete content")
def test_module_06_is_complete_content():
    module = load_catalog().unit_modules("git")[5]
    assert module.slug == "remotes"
    _complete_content(module)


def test_module_06s_lab_passes_any_machines_output():
    assert _passes(_module("remotes"), "## main...origin/main\r\n", LOG3.replace(", origin/HEAD", "").replace("\n", "\r\n"))


@pytest.mark.parametrize(
    "status, log",
    [
        ("## main...origin/main [ahead 1]\n", "5d0e4cc (HEAD -> main) Retry the uplink every 30 seconds\n9c89c21 (origin/main, origin/HEAD) Track the relay settings\n"),  # never pushed
        ("## main...origin/main [behind 1]\n", "5d0e4cc (HEAD -> main) Retry the uplink every 30 seconds\n9c89c21 Track the relay settings\n"),  # fetched, never pulled
        ("## main...origin/main\n M relay.conf\n", LOG3),  # an edit left uncommitted
        ("## main...origin/main\n", "5d0e4cc Retry the uplink every 30 seconds\n388e174 Add the beacon interval\n9c89c21 Track the relay settings\n"),  # pushed after her
        ("## main\n", LOG3),  # in the setup's own copy, or a repo with no remote
    ],
)
def test_module_06s_lab_refuses_the_likely_mistakes(status, log):
    assert not _passes(_module("remotes"), status, log)


# --- 07: Undoing things (#131) ------------------------------------------------------------
LOG4 = """fbe31c0 (HEAD -> main) Revert "Turn off solar tracking to save the motors"
5b9d2d9 Raise the battery reserve to 35%
eaa8d17 Raise the heater budget to 900 W
7e744ed Turn off solar tracking to save the motors
"""
POWER = "solar_tracking = on\nbattery_reserve_pct = 35\nheater_budget_w = 900\n"
REFLOG = "5b9d2d9 HEAD@{3}: commit: Raise the battery reserve to 35%\n"


@pytest.mark.criterion(131, "Module 07 of Unit 1.3 is complete content")
def test_module_07_is_complete_content():
    module = load_catalog().unit_modules("git")[6]
    assert module.slug == "undoing-things"
    _complete_content(module)


@pytest.mark.parametrize(
    "log",
    [
        LOG4.replace("\n", "\r\n"),
        # recovered with a rescue branch and merged after the revert: the fix lands on top
        'a1b2c3d (HEAD -> main) Merge branch \'rescue\'\n5b9d2d9 (rescue) Raise the battery reserve to 35%\nfbe31c0 Revert "Turn off solar tracking to save the motors"\neaa8d17 Raise the heater budget to 900 W\n7e744ed Turn off solar tracking to save the motors\n',
    ],
)
def test_module_07s_lab_passes_any_machines_output(log):
    assert _passes(_module("undoing-things"), log, POWER, REFLOG)


@pytest.mark.parametrize(
    "log, power, reflog",
    [
        (  # reverted first, then reset --hard to the fix: the revert is gone again
            "5b9d2d9 (HEAD -> main) Raise the battery reserve to 35%\neaa8d17 Raise the heater budget to 900 W\n7e744ed Turn off solar tracking to save the motors\n9ba9096 Track the power settings\n",
            POWER.replace("= on", "= off"), REFLOG,
        ),
        (  # "undid" Petrov by rewriting history instead of reverting
            "5b9d2d9 (HEAD -> main) Raise the battery reserve to 35%\neaa8d17 Raise the heater budget to 900 W\n9ba9096 Track the power settings\n",
            POWER, REFLOG,
        ),
        (LOG4, POWER, "eaa8d17 HEAD@{0}: reset: moving to HEAD~1\n"),  # pasted the reset, not the commit
        (LOG4.replace("5b9d2d9 Raise the battery reserve to 35%\n", ""), POWER.replace("35", "30"), REFLOG),  # never recovered
    ],
)
def test_module_07s_lab_refuses_the_likely_mistakes(log, power, reflog):
    assert not _passes(_module("undoing-things"), log, power, reflog)


# --- 08: Working together (#132) ----------------------------------------------------------
MESSAGES = """Start night lighting at 21:00
The night shift now starts at 21:00, an hour earlier, and the lights should change with it.
---
Dim the corridors to 20% at night
The night shift sleeps off the corridors, and at 60% the light under the doors kept them awake.
---
Ignore the generated reports and the relay secret
The reports are rebuilt from the logs every night, and secrets.env holds the relay token, which must never leave this machine.
---
"""
IGNORED = "!! report/\n!! secrets.env\n"
LINEAR = """* 9964aeb (HEAD -> night-lighting) Start night lighting at 21:00
* 2e809ab Dim the corridors to 20% at night
* 69a18ac Ignore the generated reports and the relay secret
* a98dc2d (main) Track the galley lighting
* 5dd8052 Track the lighting settings
"""
CONF = "corridor_night_pct = 20\ncabin_night_pct = 40\nnight_starts = 21:00\nnight_ends = 06:00\n"


@pytest.mark.criterion(132, "Module 08 of Unit 1.3 is complete content")
def test_module_08_is_complete_content():
    module = load_catalog().unit_modules("git")[7]
    assert module.slug == "working-together"
    _complete_content(module)
    assert module.lab.ai_review and module.lab.rubric, "the unit's first lab reviewed by Claude (#122)"
    assert module.slug == load_catalog().unit_modules("git")[-1].slug, "the end of the unit"


def test_module_08s_lab_passes_any_machines_output():
    messages = "\n" + MESSAGES.replace("with it.\n", "with it.\n\nIt matches the new rota.\n").replace("\n", "\r\n")
    assert _passes(_module("working-together"), messages, IGNORED, LINEAR.replace(" (HEAD -> night-lighting)", "").replace(" (main)", ""), CONF)


@pytest.mark.parametrize(
    "messages, ignored, graph, conf",
    [
        ("Dim the corridors and start at 21:00\nBoth of Okafor's changes.\n---\nIgnore the reports\nThey're generated.\n---\n", IGNORED, LINEAR, CONF),  # two changes in one commit
        (MESSAGES.replace("Dim the corridors to 20% at night\nThe night shift sleeps off the corridors, and at 60% the light under the doors kept them awake.\n", "Dim the corridors to 20% at night\n"), IGNORED, LINEAR, CONF),  # a commit with no body
        (MESSAGES.replace("Start night", "start night"), IGNORED, LINEAR, CONF),  # lower-case subject
        (MESSAGES, "?? .gitignore\n!! report/\n!! secrets.env\n", LINEAR, CONF),  # .gitignore never committed
        (MESSAGES, "?? report/\n?? secrets.env\n", LINEAR, CONF),  # nothing ignored
        (  # merged main in instead of rebasing
            MESSAGES, IGNORED,
            "*   b1c2d3e (HEAD -> night-lighting) Merge branch 'main' into night-lighting\n|\\\n| * a98dc2d (main) Track the galley lighting\n* | df57c63 Start night lighting at 21:00\n",
            CONF,
        ),
        (MESSAGES, IGNORED, LINEAR, CONF.replace("= 20", "= 60")),  # the corridor change never made
    ],
)
def test_module_08s_lab_refuses_the_likely_mistakes(messages, ignored, graph, conf):
    assert not _passes(_module("working-together"), messages, ignored, graph, conf)


def test_module_08s_setup_leaves_the_junk_untracked():
    setup = _module("working-together").lab.setup
    assert "report/lighting-2026-10-12.html" in setup and "secrets.env" in setup
    assert setup.rstrip().endswith("unset -f c") and "\n#" not in setup
