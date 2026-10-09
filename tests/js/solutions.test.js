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
