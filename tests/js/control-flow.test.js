// Control flow on the station console (#64): if, test and [[ ]], loops, case,
// $( ) and $(( )), read, and commands that span lines. Expected outputs were
// checked against bash 5.2.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Shell } = require("../../app/static/js/shell.js");

const file = (contents, mode = 0o644, owner = "cadet") => ({ type: "file", mode, owner, group: owner === "root" ? "root" : "crew", contents });
const dir = (owner = "cadet") => ({ type: "dir", mode: 0o755, owner, group: owner === "root" ? "root" : "crew", contents: "" });

function station(extra) {
  return new Shell({
    user: "cadet",
    group: "crew",
    cwd: "/station",
    password: "meridian",
    groups: ["sudo"],
    fs: {
      "/": dir("root"),
      "/etc": dir("root"),
      "/etc/passwd": file("root:x:0:0:root:/root:/bin/bash\ncadet:x:1000:1000::/home/cadet:/bin/bash\n", 0o644, "root"),
      "/etc/group": file("root:x:0:\nsudo:x:27:cadet\ncrew:x:1000:\n", 0o644, "root"),
      "/etc/shadow": file("root:*:19000:0:99999:7:::\n", 0o640, "root"),
      "/station": dir(),
      "/station/notes.txt": file("b\na\nb\nc\n"),
      "/station/crew.csv": file("okafor,engineer,deck 2\nmeridian,ai,core\n"),
      "/station/logs": dir(),
      "/station/logs/app.log": file("ok\nERROR one\n"),
      "/station/logs/net.log": file("ERROR two\n"),
      ...extra,
    },
  });
}
const out = (sh, line) => sh.run(line).output;
// Run a multi-line script at the prompt, a line at a time, as typed.
const typed = (sh, text) => text.split("\n").map((line) => sh.run(line).output).join("");

// --- the scenarios ---------------------------------------------------------------------
test("if chooses a branch", () => {
  const sh = station();
  assert.equal(out(sh, "if [ -f /etc/passwd ]; then echo yes; else echo no; fi"), "yes\n");
  assert.equal(out(sh, "if [ -d /etc/passwd ]; then echo dir; elif [ -s notes.txt ]; then echo notes; else echo none; fi"), "notes\n");
  assert.equal(out(sh, "if false; then echo never; fi; echo $?"), "0\n"); // no branch ran: status 0
  assert.equal(out(sh, "if grep -q ERROR logs/app.log; then echo found; fi"), "found\n");
  assert.equal(out(sh, "if ! [ -e nope ]; then echo missing; fi"), "missing\n");
});

test("Loops run over words, files and lines", () => {
  const sh = station();
  assert.equal(out(sh, 'for f in /station/logs/*.log; do echo "$f"; done'), "/station/logs/app.log\n/station/logs/net.log\n");
  assert.equal(out(sh, 'while read -r line; do echo "> $line"; done < notes.txt'), "> b\n> a\n> b\n> c\n");
  assert.equal(out(sh, "for i in {1..3}; do echo $i; done"), "1\n2\n3\n");
  assert.equal(out(sh, "i=0; while [ $i -lt 3 ]; do i=$((i + 1)); echo \"i=$i\"; done"), "i=1\ni=2\ni=3\n");
  assert.equal(out(sh, "i=2; until [ $i -eq 0 ]; do echo $i; i=$((i - 1)); done"), "2\n1\n");
  assert.equal(out(sh, "cat notes.txt | while read -r l; do echo \"got $l\"; done | sort -u"), "got a\ngot b\ngot c\n");
  assert.equal(out(sh, "for i in 1 2 3 4 5; do [ $i -eq 2 ] && continue; [ $i -eq 4 ] && break; echo $i; done"), "1\n3\n");
  assert.equal(out(sh, "for x in a b c; do for y in 1 2; do [ $x = b ] && break 2; echo $x$y; done; done"), "a1\na2\n");
});

test("Substitution and arithmetic work", () => {
  const sh = station();
  assert.equal(out(sh, 'echo "$(( $(wc -l < notes.txt) * 2 ))"'), "8\n");
  assert.equal(out(sh, 'echo "today: $(echo $(whoami))"'), "today: cadet\n"); // nested
  assert.equal(out(sh, "for w in $(cat notes.txt); do echo \"[$w]\"; done"), "[b]\n[a]\n[b]\n[c]\n"); // split
  assert.equal(out(sh, 'for w in "$(cat notes.txt)"; do echo "[$w]"; done'), "[b\na\nb\nc]\n"); // quoted: one word
  assert.equal(out(sh, "echo $((7 / 2)) $((7 % 3)) $((2 ** 10)) $((-7 / 2)) $((3 > 4 ? 10 : 20)) $((010))"), "3 1 1024 -3 20 8\n");
  assert.equal(out(sh, "echo $((5 / 0)); echo $?"), 'bash: 5 / 0: division by 0 (error token is "0")\n1\n');
  assert.equal(out(sh, "x=$(false); echo $?"), "1\n");
  assert.equal(out(sh, "x=5; y=$(x=9; echo $x); echo \"$x $y\""), "5 9\n"); // a subshell changes nothing here
  assert.equal(out(sh, "echo `echo backticks`"), "backticks\n");
});

test("A compound command can span lines", () => {
  const sh = station({
    "/station/check.sh": file(
      [
        "#!/bin/bash",
        "# Count the logs with errors.",
        'if [ -d logs ]; then',
        '  echo "checking"',
        "fi",
        "n=0",
        "for f in logs/*.log",
        "do",
        "  if grep -q ERROR \"$f\"; then",
        "    n=$((n + 1))",
        "  fi",
        "done",
        'echo "$n logs with errors"',
        "[ $n -eq 0 ]",
      ].join("\n") + "\n",
      0o755
    ),
  });
  assert.equal(out(sh, "./check.sh"), "checking\n2 logs with errors\n");
  assert.equal(out(sh, "echo $?"), "1\n"); // the last command's status: [ 2 -eq 0 ] is false

  // At the prompt, an unfinished command continues on a "> " line.
  assert.equal(out(sh, "for f in logs/*.log"), "");
  assert.equal(sh.prompt(), "> ");
  assert.equal(out(sh, "do"), "");
  assert.equal(out(sh, '  echo "log: $f"'), "");
  assert.equal(out(sh, "done"), "log: logs/app.log\nlog: logs/net.log\n");
  assert.equal(sh.prompt(), "cadet@meridian:/station$ ");
});

test("case matches patterns", () => {
  const sh = station();
  assert.equal(out(sh, 'x=app.log; case "$x" in *.log) echo log;; *) echo other;; esac'), "log\n");
  assert.equal(out(sh, 'x=app.txt; case "$x" in *.log|*.txt) echo text;; *) echo other;; esac'), "text\n");
  assert.equal(out(sh, "case B in [A-C]) echo class;; esac; case abc in a?c) echo one;; esac"), "class\none\n");
  assert.equal(out(sh, 'case "*" in "*") echo star;; esac; case x in "*") echo never;; esac'), "star\n"); // quoted: literal
  assert.equal(
    typed(sh, 'deck=core\ncase $deck in\n  core|bridge)\n    echo "upper"\n    ;;\n  *)\n    echo "lower"\nesac'),
    "upper\n"
  );
});

// --- tests ----------------------------------------------------------------------------
test("test and [ ] compare strings, numbers and files", () => {
  const sh = station();
  const status = (line) => (sh.run(line), sh.lastStatus);
  assert.equal(status('[ "a" = "a" ]'), 0);
  assert.equal(status("[ a != a ]"), 1);
  assert.equal(status('[ -z "" ]'), 0);
  assert.equal(status('[ -n "" ]'), 1);
  assert.equal(status("[ 10 -gt 9 ]"), 0);
  assert.equal(status("test 3 -le 2"), 1);
  assert.equal(status("[ -f notes.txt -a -d logs ]"), 0);
  assert.equal(status("[ -f nope -o -d logs ]"), 0);
  assert.equal(status("[ -x notes.txt ]"), 1);
  assert.equal(status("[ -r /etc/shadow ]"), 1); // mode 640, root's
  assert.equal(status("[ -w notes.txt ]"), 0);
  // The classic mistakes, with bash's messages.
  assert.equal(out(sh, "x=; [ $x = b ]; echo $?"), "bash: [: =: unary operator expected\n2\n");
  assert.equal(out(sh, 'x="a b"; [ $x = "a b" ]; echo $?'), "bash: [: too many arguments\n2\n");
  assert.equal(out(sh, "[ abc -eq 1 ]; echo $?"), "bash: [: abc: integer expression expected\n2\n");
  assert.equal(out(sh, "[ 1 -lt 2; echo $?"), "bash: [: missing `]'\n2\n");
});

test("[[ ]] has && || ! and glob matching, and needs no quotes", () => {
  const sh = station();
  assert.equal(out(sh, "[[ -f notes.txt && ! -d notes.txt ]] && echo both"), "both\n");
  assert.equal(out(sh, "f=app.log; [[ $f == *.log ]] && echo glob; [[ $f == \"*.log\" ]] || echo literal"), "glob\nliteral\n");
  assert.equal(out(sh, 'x="a b"; [[ $x = "a b" ]] && echo unsplit'), "unsplit\n");
  assert.equal(out(sh, "[[ $UNSET == '' ]] && echo empty"), "empty\n");
  assert.equal(out(sh, "[[ 10 -gt 9 ]] && echo numeric; [[ 10 > 9 ]] || echo lexical"), "numeric\nlexical\n");
  assert.equal(out(sh, "[[ ( -e nope || -e notes.txt ) && -s notes.txt ]] && echo grouped"), "grouped\n");
});

// --- read -----------------------------------------------------------------------------
test("read splits a line on $IFS, and the last name takes the rest", () => {
  const sh = station();
  assert.equal(out(sh, 'while IFS=, read -r name role where; do echo "$name|$role|$where"; done < crew.csv'),
    "okafor|engineer|deck 2\nmeridian|ai|core\n");
  assert.equal(out(sh, 'echo "a b   c" | while read -r one rest; do echo "[$one][$rest]"; done'), "[a][b   c]\n");
  assert.equal(out(sh, 'read -r first < notes.txt; echo "$first"'), "b\n");
  assert.equal(out(sh, "echo $IFS | wc -c"), "1\n"); // IFS= applied to read alone
});

test("read at the prompt takes a line from the keyboard", () => {
  const sh = station();
  const asked = sh.run('read -p "Deck? " deck; echo "deck=$deck"');
  assert.equal(asked.pending, true);
  assert.equal(sh.prompt(), "Deck? ");
  assert.equal(out(sh, "core"), "deck=core\n");
  // A script asks too, after what it has already printed.
  sh.run('echo \'echo "Report"; read -r who; echo "for $who"\' > ask.sh');
  const r = sh.run("bash ask.sh");
  assert.equal(r.output, "Report\n");
  assert.equal(r.pending, true);
  assert.equal(out(sh, "okafor"), "for okafor\n");
});

test("sudo can ask for its password inside a loop", () => {
  const sh = station();
  const asked = sh.run("for f in /etc/shadow; do sudo cat $f; done; echo after");
  assert.equal(asked.pending, true);
  assert.equal(sh.prompt(), "[sudo] password for cadet: ");
  assert.equal(out(sh, "meridian"), "root:*:19000:0:99999:7:::\nafter\n");
});

test("Ctrl-C abandons an unfinished command or a prompt", () => {
  const sh = station();
  sh.run("if true; then");
  assert.deepEqual(sh.cancel(), { output: "", clear: false });
  assert.equal(sh.prompt(), "cadet@meridian:/station$ ");
  assert.equal(out(sh, "echo fresh"), "fresh\n");
  sh.run('bash -c \'X=1; read -r y\'');
  assert.ok(sh.cancel());
  assert.equal(sh.lastStatus, 130); // as bash: 128 + SIGINT
  assert.equal(sh.pending, null);
  assert.equal(out(sh, 'echo "X=$X"'), "X=\n"); // the child's variables went with it
});

// --- the rest ---------------------------------------------------------------------------
test("Parameter expansion trims, defaults and counts", () => {
  const sh = station();
  assert.equal(out(sh, "f=report.tar.gz; echo ${f%.gz} ${f%%.*} ${f#*.} ${f##*.} ${#f}"), "report.tar report tar.gz gz 13\n");
  assert.equal(out(sh, 'echo ${UNSET:-fallback} "${UNSET-x}" ${UNSET:+no}.'), "fallback x .\n");
  assert.equal(out(sh, "echo ${1:-no-args} $#"), "no-args 0\n");
});

test("Scripts get their arguments, \"$@\" keeps them whole, and exit sets the status", () => {
  const sh = station({ "/station/args.sh": file('for a in "$@"; do echo "[$a]"; done\nfor a; do echo "<$a>"; done\nexit 4\n', 0o755) });
  assert.equal(out(sh, './args.sh "one two" three'), "[one two]\n[three]\n<one two>\n<three>\n");
  assert.equal(out(sh, "echo $?"), "4\n");
});

test("A script runs up to a line it can't read", () => {
  const sh = station({ "/station/bad.sh": file("echo first\nif true; then\n  echo inside\nfi fi\necho never\n", 0o755) });
  assert.equal(out(sh, "./bad.sh; echo $?"),
    "first\n./bad.sh: line 4: syntax error near unexpected token `fi'\n./bad.sh: line 4: `fi fi'\n2\n");
  const open = station({ "/station/open.sh": file("echo one\nfor x in a b; do\n  echo $x\n", 0o755) });
  assert.equal(out(open, "./open.sh; echo $?"), "one\n./open.sh: line 4: syntax error: unexpected end of file\n2\n");
});

test("Errors and redirection work on whole compound commands", () => {
  const sh = station();
  assert.equal(out(sh, "for i in 1 2 3; do echo $i; done > counted.txt; cat counted.txt"), "1\n2\n3\n");
  assert.equal(out(sh, "{ echo a; echo b; } > pair.txt; wc -l < pair.txt"), "2\n");
  assert.equal(out(sh, "echo oops >&2 2>/dev/null"), "oops\n"); // >&2 took the terminal before 2> moved
  assert.equal(out(sh, "if true; then echo hidden >&2; fi 2> /dev/null; echo shown"), "shown\n");
  assert.equal(out(sh, "(cd logs; pwd; exit 3); echo \"$? $PWD\""), "/station/logs\n3 /station\n");
});

test("break outside a loop and keywords are explained, as bash does", () => {
  const sh = station();
  assert.equal(out(sh, "break; echo after"), "bash: break: only meaningful in a `for', `while', or `until' loop\nafter\n");
  assert.equal(out(sh, "type if [[ read"), "if is a shell keyword\n[[ is a shell keyword\nread is a shell builtin\n");
  assert.equal(out(sh, "echo start; if then fi"), "bash: syntax error near unexpected token `then'\n"); // nothing ran
  assert.match(out(sh, "help"), /scripts: +if\/elif\/else, for, while\/until, case/);
});

test("What the console doesn't do, it says so", () => {
  const sh = station();
  const refused = (line) => out(sh, line).replace(/^bash: unsupported on the station console: /, "");
  assert.match(refused("for ((i = 0; i < 3; i++)); do echo $i; done"), /^for \(\( … \)\) loops/);
  assert.match(refused("(( i++ ))"), /^\(\( \)\) arithmetic commands/);
  assert.match(refused("echo $((i++))"), /^\+\+ and --/);
  assert.match(refused("trap 'echo x' ERR"), /^bash: trap: unsupported on the station console: ERR traps/);
  assert.match(refused("[[ abc =~ b ]]"), /^\[\[ =~ \]\] regular expressions/);
  assert.equal(sh.lastStatus, 2);
});

test("A loop that never ends is stopped", () => {
  const sh = station();
  const r = sh.run("while true; do echo y > /dev/null; done; echo unreachable");
  assert.equal(r.output, "bash: stopped after 10,000 commands: is a loop running forever?\n");
  assert.equal(out(sh, "echo still here"), "still here\n");
});
