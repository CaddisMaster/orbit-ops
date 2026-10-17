// Every real terminal exercise starts unsolved and its reference solution
// solves it, run through the console's real shell (#36). The exercises come
// from tests/js/fixtures/exercises.json, which scripts/export_exercises.py
// writes from content/ and tests/test_terminal.py keeps current.
//
// That the browser's checks agree with the server's is check_cases.json's
// job: both graders run the same cases, here and in tests/test_terminal.py.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell, passes } = require("../../app/static/js/shell.js");
const exercises = require("./fixtures/exercises.json");
const parity = require("./fixtures/check_cases.json");

for (const [slug, ex] of Object.entries(exercises)) {
  test(`Every exercise starts unsolved and its reference solution solves it: ${slug}`, () => {
    const sh = new Shell(ex.spec);
    assert.equal(sh.solved(ex.spec.checks), false, `${ex.source}: solved before any command ran`);
    for (const line of ex.solution) {
      // A step may fail on purpose (07 shows an error before capturing it), but
      // it may not need a command the console doesn't have.
      const { output } = sh.run(line);
      assert.notEqual(sh.lastStatus, 127, `${ex.source}: \`${line}\` uses an unknown command:\n${output}`);
    }
    const failing = ex.spec.checks.filter((c) => !passes(c, sh.state(), sh.cwd, sh.processes()));
    assert.deepEqual(failing, [], `${ex.source}: the solution leaves these checks failing`);
  });
}

test("The browser's checks agree with the server's on every shared case", () => {
  for (const c of parity.cases) {
    assert.equal(passes(c.check, parity.state, parity.cwd, parity.processes), c.expect, c.name);
  }
});

// The console's status line counts the checks that pass (#208), the case Sean
// hit in module 04: one file right, the other `chmod 700` where 744 was wanted.
const { progressNote } = require("../../app/static/js/shell.js");

test("The console counts the checks that pass, and doesn't say which", () => {
  const { spec } = exercises.permissions;
  const sh = new Shell(spec);
  sh.run("chmod 600 scrubber.conf");
  sh.run("chmod 700 purge.sh");
  assert.equal(sh.progress(spec.checks), 1);
  const note = progressNote(sh.progress(spec.checks), spec.checks.length, true);
  assert.equal(note, "1 of 2 done");
  assert.doesNotMatch(note, /purge|scrubber|744|600/);
  sh.run("chmod 744 purge.sh");
  assert.equal(sh.progress(spec.checks), 2);
  assert.equal(sh.solved(spec.checks), true);
});

test("The status line stays empty before a change, once done, and for one-check tasks", () => {
  assert.equal(progressNote(0, 2, false), "");
  assert.equal(progressNote(1, 2, false), "");
  assert.equal(progressNote(0, 2, true), "0 of 2 done");
  assert.equal(progressNote(2, 2, true), "");
  assert.equal(progressNote(0, 1, true), "");
});
