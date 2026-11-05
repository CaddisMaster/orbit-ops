"""No test may rely on `xdist_group` while `--dist loadgroup` isn't grouping (#389).

pytest 9.2.0 with xdist 3.8.0 ignores the group and raises nothing. Budget Buddy found that as
failures with a different set each run, which reads as a flake (BB #588). Nothing here groups
today, so the broken pair does no harm until the first test that does.

This runs a real two-worker session in a subprocess and reads which workers ran the tests. It
asserts the behaviour, not the pinned versions or the `@group` node ID suffix, so it stops
objecting by itself once a release fixes grouping, however that fix carries the group.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

GROUPED_TESTS = """\
import pytest

pytestmark = pytest.mark.xdist_group("together")


@pytest.mark.parametrize("n", range(12))
def test_grouped(n):
    pass
"""


def _workers_that_ran_one_group(tmp_path: Path) -> set[str]:
    (tmp_path / "test_a.py").write_text(GROUPED_TESTS)
    (tmp_path / "test_b.py").write_text(GROUPED_TESTS)
    # This test may be on a worker itself, and its PYTEST_* variables mustn't reach the inner run.
    env = {key: value for key, value in os.environ.items() if not key.startswith("PYTEST_")}
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-n", "2", "--dist", "loadgroup", "-v",
         "-p", "no:cacheprovider", "--rootdir", str(tmp_path), str(tmp_path)],
        capture_output=True, text=True, cwd=tmp_path, env=env, timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "24 passed" in result.stdout, result.stdout
    return set(re.findall(r"^\[(gw\d+)\]", result.stdout, flags=re.MULTILINE))


def _test_files_that_group() -> list[str]:
    files = [path for path in (ROOT / "tests").rglob("*.py") if path != Path(__file__).resolve()]
    return sorted(str(path.relative_to(ROOT)) for path in files if "xdist_group" in path.read_text())


@pytest.mark.criterion(389, "The grouping trap is either held or recorded")
def test_no_test_groups_while_loadgroup_is_not_grouping(tmp_path):
    workers = _workers_that_ran_one_group(tmp_path)
    grouped = _test_files_that_group()
    assert len(workers) == 1 or not grouped, (
        f"{grouped} use xdist_group, but --dist loadgroup spread one group across {sorted(workers)}, "
        "so they would fail at random. See docs/testing.md (#389)."
    )
