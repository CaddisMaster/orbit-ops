// Robust scripts on the station console (#65): functions, set -euo pipefail
// with bash's own exceptions, trap, here-documents and mktemp. Expected
// outputs were checked against bash 5.2, script by script.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");

const dir = (owner = "cadet", mode = 0o755) => ({ type: "dir", mode, owner, group: owner === "root" ? "root" : "crew", contents: "" });

function station() {
  return new Shell({ user: "cadet", group: "crew", cwd: "/station", fs: { "/": dir("root"), "/station": dir(), "/tmp": dir("root", 0o1777) } });
}
const out = (sh, line) => sh.run(line).output;
// Write a script into the console's filesystem and run it with bash.
function script(sh, text, args = "") {
  sh.fs["/station/s.sh"] = { type: "file", mode: 0o755, owner: "cadet", group: "crew", contents: text, mtime: new Date() };
  return out(sh, `./s.sh ${args}; echo "status $?"`);
}

// --- the scenarios ---------------------------------------------------------------------
test("Functions take arguments and return a status", () => {
  const sh = station();
  assert.equal(
    script(sh, 'greet() { local name=$1; echo "hi $name"; return 3; }\ngreet okafor\necho $?\necho "name=[${name-unset}]"\n'),
    "hi okafor\n3\nname=[unset]\nstatus 0\n"
  );
  assert.equal(out(sh, 'f() { echo "$# [$1] [$2]"; shift; echo "then: $*"; }; f "a b" c d'), "3 [a b] [c]\nthen: c d\n");
  assert.equal(out(sh, "function g { echo in-g; }; g; type g"), "in-g\ng is a function\n");
  assert.equal(out(sh, 'f() { local x=inner; g2; }; g2() { echo "g2 sees $x"; }; x=outer; f; echo "after $x"'), "g2 sees inner\nafter outer\n");
  assert.equal(out(sh, "f() { local a=\"x y\"; local b=$a; echo \"$b\"; }; f"), "x y\n"); // local NAME=value isn't split
  assert.equal(out(sh, "f() { for i in 1 2 3; do [ $i = 2 ] && return 7; echo $i; done; }; f; echo $?"), "1\n7\n");
  assert.equal(out(sh, "fact() { if [ $1 -le 1 ]; then echo 1; else echo $(( $1 * $(fact $(( $1 - 1 ))) )); fi; }; fact 5"), "120\n");
  assert.equal(out(sh, "x=1; f() { x=2; }; f; echo $x; f() { echo $FUNCNAME; }; f"), "2\nf\n"); // without local, it's the caller's x
  assert.equal(out(sh, "return 1; echo $?"), "bash: return: can only `return' from a function or sourced script\n2\n");
  assert.equal(out(sh, "local x=1"), "bash: local: can only be used in a function\n");
  assert.equal(out(sh, "r() { r; }; r"), "bash: r: maximum function nesting level exceeded (100)\n");
});

test("set -e stops at the first failure, with bash's exceptions", () => {
  const sh = station();
  assert.equal(script(sh, "set -e\necho one\nfalse\necho after\n"), "one\nstatus 1\n");
  // Not in a test, not left of && or ||, not after !, not in a compound command whose
  // failure came from one of those.
  assert.equal(
    script(sh, "set -e\nif false; then echo no; fi\nwhile false; do :; done\nfalse || echo rescued\n! true\nfalse && echo no\n{ false && true; }\necho survived\n"),
    "rescued\nsurvived\nstatus 0\n"
  );
  // A function call is a simple command: it stops, even though the failure inside was a test.
  assert.equal(script(sh, "set -e\nf() { false && true; }\nf\necho never\n"), "status 1\n");
  // Inside a function, a failure stops the whole script...
  assert.equal(script(sh, "set -e\nf() { false; echo still-in-f; }\nf\necho never\n"), "status 1\n");
  // ...unless the function is called as a test, where -e is ignored all the way down.
  assert.equal(script(sh, "set -e\nf() { false; echo inside; }\nif f; then echo ok; fi\necho end\n"), "inside\nok\nend\nstatus 0\n");
  assert.equal(script(sh, "set -e\nx=$(false)\necho never\n"), "status 1\n");
  assert.equal(script(sh, "set -e\necho \"$(false; echo sub-continues)\"\n"), "sub-continues\nstatus 0\n"); // $( ) doesn't inherit -e
  // At the prompt a real terminal would close; the console says so and carries on.
  assert.match(out(sh, "set -e; false; echo after"), /^logout\n\(set -e ended the shell/);
  assert.equal(out(sh, "set +e; false; echo after"), "after\n");
});

test("pipefail and nounset behave as in bash", () => {
  const sh = station();
  assert.equal(
    script(sh, 'set -uo pipefail\nfalse | true\necho "pipe $?"\necho "$UNSET"\necho never\n'),
    "pipe 1\n./s.sh: line 4: UNSET: unbound variable\nstatus 1\n"
  );
  assert.equal(script(sh, 'set -u\necho "${UNSET:-default} ${UNSET-x} $#"\necho "$1"\n'), "default x 0\n./s.sh: line 3: $1: unbound variable\nstatus 1\n");
  assert.equal(script(sh, "set -u\nf() { echo \"[$1]\"; }\nf a\nf\necho never\n"), "[a]\n./s.sh: line 2: $1: unbound variable\nstatus 1\n");
  assert.equal(script(sh, "set -e; set -o pipefail\nfalse | true\necho never\n"), "status 1\n");
  assert.equal(out(sh, "false | true; echo $?"), "0\n"); // without pipefail: the last command's status
  assert.equal(out(sh, "set -o pipefail; true | false | true; echo $?; set +o pipefail"), "1\n");
  assert.equal(out(sh, "set -u; echo \"[$NOPE]\"; echo carries-on; set +u"), "bash: NOPE: unbound variable\ncarries-on\n"); // the prompt doesn't exit
});

test("trap runs cleanup on every exit", () => {
  const tempFiles = (sh) => Object.keys(sh.state()).filter((p) => p.startsWith("/tmp/tmp."));
  const cleanup = 'tmp=$(mktemp)\ntrap \'rm -f "$tmp"; echo cleaned\' EXIT\necho "working in $tmp" > /dev/null\n';
  for (const [ending, expect] of [
    ["echo done\n", "done\ncleaned\nstatus 0\n"],
    ["exit 2\necho never\n", "cleaned\nstatus 2\n"],
    ["set -e\nfalse\necho never\n", "cleaned\nstatus 1\n"],
  ]) {
    const sh = station();
    assert.equal(script(sh, cleanup + ending), expect, ending);
    assert.deepEqual(tempFiles(sh), [], `the temp file is gone after: ${ending}`);
  }
  // $? in the trap is the status being exited with, and it stands.
  assert.equal(script(station(), "trap 'echo \"bye $?\"' EXIT\nset -e\nfalse\necho never\n"), "bye 1\nstatus 1\n");
});

test("Here-documents write files", () => {
  const sh = station();
  assert.equal(out(sh, "cat > motd.txt <<EOF"), ""); // at the prompt, it waits for the body
  assert.equal(sh.prompt(), "> ");
  sh.run("Welcome aboard, $USER.");
  sh.run("Deck count: $((2 + 4))");
  assert.equal(out(sh, "EOF"), "");
  assert.equal(out(sh, "cat motd.txt"), "Welcome aboard, cadet.\nDeck count: 6\n");
  assert.equal(script(sh, "cat <<'EOF'\nliteral $USER `date` \\$\nEOF\n"), "literal $USER `date` \\$\nstatus 0\n");
  assert.equal(script(sh, "\tcat <<-EOF\n\ttab stripped\n\t\ttwo tabs\n\tEOF\n"), "tab stripped\ntwo tabs\nstatus 0\n");
  assert.equal(script(sh, "x=world\ncat <<EOF | sed 's/o/0/g'\nhello $x \"quoted\" 'single' \\$x\nEOF\n"), "hell0 w0rld \"qu0ted\" 'single' $x\nstatus 0\n");
  assert.equal(script(sh, "cat <<A; cat <<B\nfirst\nA\nsecond\nB\n"), "first\nsecond\nstatus 0\n");
  assert.equal(script(sh, "f() { cat; }\nf <<EOF\nvia function\nEOF\n"), "via function\nstatus 0\n");
  assert.equal(out(sh, 'read -r a b <<< "one two three"; echo "[$a][$b]"'), "[one][two three]\n");
});

// --- the rest ------------------------------------------------------------------------------
test("set -- sets the arguments, set -x traces, set -o lists", () => {
  const sh = station();
  assert.equal(out(sh, 'set -- a "b c"; echo $#; echo "$2"; set --; echo $#'), "2\nb c\n0\n");
  assert.equal(out(sh, 'set -x; echo "a b" c; x=1; set +x'), "+ echo 'a b' c\na b c\n+ x=1\n+ set +x\n");
  assert.equal(out(sh, "set -o pipefail; set -o"), "errexit        \toff\nnounset        \toff\npipefail       \ton\nxtrace         \toff\n");
  assert.equal(out(sh, "set -q"), "bash: set: -q: invalid option\nset: usage: set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-] [arg ...]\n");
  assert.equal(out(sh, "set -o nosuch"), "bash: set: nosuch: invalid option name\n");
});

test("trap lists, resets and refuses what it can't do", () => {
  const sh = station();
  assert.equal(out(sh, "trap 'echo x' EXIT; trap; trap - EXIT; trap"), "trap -- 'echo x' EXIT\n");
  assert.equal(out(sh, "trap 'echo x' NOPE"), "bash: trap: NOPE: invalid signal specification\n");
  assert.equal(out(sh, "trap 'echo x' ERR"), "bash: trap: unsupported on the station console: ERR traps\n");
});

test("Ctrl-C runs a script's INT and EXIT traps", () => {
  const sh = station();
  sh.fs["/station/wait.sh"] = {
    type: "file", mode: 0o755, owner: "cadet", group: "crew", mtime: new Date(),
    contents: "trap 'echo interrupted' INT\ntrap 'echo cleaned up' EXIT\nread -r answer\necho never\n",
  };
  assert.equal(sh.run("./wait.sh; echo never-either").pending, true);
  assert.deepEqual(sh.cancel(), { output: "interrupted\ncleaned up\n", clear: false });
  assert.equal(sh.lastStatus, 130);
  assert.equal(out(sh, "echo fresh"), "fresh\n");
});

test("Functions belong to their shell; source brings a library's in", () => {
  const sh = station();
  sh.run("echo 'helper() { echo \"helped $1\"; }' > lib.sh");
  assert.equal(out(sh, "source lib.sh; helper x"), "helped x\n");
  assert.equal(out(sh, "f() { echo parent; }; bash -c 'f'"), "f: command not found. The Meridian's console only knows the basics; type `help` to see them.\n");
  assert.equal(out(sh, "echo 'echo start; return 5; echo never' > r.sh; source r.sh; echo $?"), "start\n5\n");
  assert.equal(out(sh, "ls() { echo shadowed; }; ls; type -t ls; unset ls; type -t ls"), "shadowed\nfunction\nfile\n");
  assert.equal(out(sh, "f() { :; }; f=1; unset f; type -t f; echo \"[$f]\"; unset -f f; type -t f"), "function\n[]\n");
});

test("mktemp makes private files and directories under /tmp", () => {
  const sh = station();
  const f = out(sh, "mktemp").trim();
  assert.match(f, /^\/tmp\/tmp\.[A-Za-z0-9]{10}$/);
  assert.equal(sh.state()[f].mode, 0o600);
  const d = out(sh, "mktemp -d").trim();
  assert.equal(sh.state()[d].type, "dir");
  assert.equal(sh.state()[d].mode, 0o700);
  assert.match(out(sh, "mktemp report.XXXX"), /^report\.[A-Za-z0-9]{4}\n$/); // a template: relative to here
  assert.equal(out(sh, "mktemp nox"), "mktemp: too few X's in template ‘nox’\n");
  assert.equal(out(sh, "ls -ld /tmp | cut -c1-10"), "drwxrwxrwt\n");
});
