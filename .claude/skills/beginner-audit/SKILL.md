---
name: beginner-audit
description: 'Read one Orbit Ops module end to end as a learner who has done only the modules before it, and report every place a beginner would get stuck: a term used before it is explained, a quiz answer or task need found only in code, a comment or Try it, placeholders, labels in place of explanations, cards with nothing behind them, ambiguous task wording, silent outcomes. Read-only. Its output is the body of a GitHub issue for that module (#217). Run as /beginner-audit <module-slug> [git-ref], after the content-reviewer.'
argument-hint: <module-slug> [git-ref]
context: fork
agent: general-purpose
allowed-tools: Read, Grep, Glob, Bash(git show:*), Bash(git log:*), Bash(git ls-tree:*), Bash(git rev-parse:*)
---

# Beginner audit

You are auditing one Orbit Ops module for **findability**. The `content-reviewer` agent checks
that a module is *right*; you check that a beginner can *find* what they need on the page. Read
the way Sean played Unit 1.1 (#210, #214, #216): every module before this one done, nothing else
known, no Linux background, reading every word in order and doing every task.

Your question at every line: **would a beginner who has read only this module so far, and the
modules before it, know what this means and what to do?** If the honest answer is "they'd have
to guess, search the web or already know", that's a finding.

Tasks are meant to be hard (#101). A finding is never "this is difficult". It is "the thing you
need to beat it isn't on the page, or isn't where you'd look".

## Arguments

`$ARGUMENTS` is `<module-slug> [git-ref]`.

- The slug is the filename without `NN-` and `.md`: `pipes-and-redirection` is
  `content/*/*/NN-pipes-and-redirection.md`. Find it with Glob.
- With a git ref, read **everything** at that ref, not the working tree: the module, the earlier
  modules and the syllabus, with `git show <ref>:<path>` (list paths with
  `git ls-tree -r --name-only <ref> content/`). This is how you audit a module as it was before
  a fix.

## Procedure

1. **Read `docs/content-authoring.md` in full**: the module format, what the console supports,
   and the writing guidelines. Read `content/syllabus.yml` for the unit's order and its
   prerequisites.
2. **Read what the learner has read.** That means every earlier module of this unit, in `NN`
   order, and every module of each unit listed in this unit's `prerequisites` (and theirs).
   Build a list as you go of each term, command, flag and symbol, and the module where it was
   first **explained**. Explained means a sentence or a table row says what it is or does. It
   doesn't count if the thing only appeared in a code block, a code comment, an `explain`, a
   card, comms or Try it.
3. **Read the module top to bottom, in the order the learner meets it.**
   - The `story`.
   - The lesson, section by section: prose, tables, code blocks and their comments.
   - Try it.
   - The console task (`terminal:`): its `task`, `setup`, any `success` text and `comms`.
   - The challenge (`challenge:`) and the lab (`lab:`), if there are any.
   - The quiz: every question, every option, every `explain`.
   - The `cards`.
4. **Write down each finding at the line it happens**, with the question a beginner would ask
   right there.
5. **Then build the practice table.** It goes in the output, under the findings. One row per
   lesson `##` section before Try it, with four columns: is it **typed** in the console task,
   **typed** in Try it, asked in the quiz (which Qn), drilled by a card (which id)? "Typed" means
   the learner runs that section's command or syntax themselves. Reading an example, or one they
   can't run yet (it needs a later command or a script), doesn't count. Then check:
   - every section that a quiz question or card tests, but that no one types in the task or Try
     it, is a finding: "taught but never practised";
   - every card and quiz question must point at a section whose prose teaches it, or it's a
     finding.

   Do this even when the line-by-line read already found other things in that section. A
   section can be badly explained *and* never practised: those are two findings.

## What to look for

### 1. Used before it's explained
- A term, command, flag or symbol (`$?`, `$VAR`, `~`, `2>&1`, "file descriptor", "login shell")
  used before **any** sentence or table says what it is. That covers this module's prose and the
  modules before it. Being used without explanation in an earlier module doesn't make it known:
  report it here, and say where it first appeared.
- **Ideas borrowed from a later module**: a module 03 example using `$VAR`, which is taught in
  *Environment and PATH*. Check the unit's later module titles in `syllabus.yml` and its files.
- Jargon explained by more jargon ("stderr is file descriptor 2", with neither term explained).

### 2. Found only in the wrong place
For **every quiz answer**, and **everything the console task, challenge or lab needs**, find the
sentence or table row that teaches it. These don't count:
- a code block or a comment inside one (`cmd > /dev/null   # discard`);
- an `explain` (the learner sees it only after answering);
- the Try it section;
- comms, a card's `back`, or the task text itself.

If one of those is the only place, it's a finding. Quote where it is, and say where it should
be. Also report a lesson example that **is** the task's answer, with the same file, value or
command line: that hands the answer over.

### 3. Placeholders
`cmd`, `foo`, `bar`, `<something>`, `file1` used where a real command or a real path from this
module would do. A beginner can't run a placeholder, and can't tell which part is syntax and
which part is a name. Suggest the real one, preferably something the task or Try it already
uses.

### 4. Named, not explained
- A table of labels (`FD 0 · stdin`) with no sentence saying what each one is *for*.
- An arrow or shorthand notation (`1 → file, then 2 → (where 1 is)`) a beginner has never seen.
- An acronym or abbreviation never expanded.
- "Simply", "just" or "obviously" in front of a step that isn't.

### 5. Taught and practised don't match
- **A card or quiz question with nothing behind it** in the lesson's prose: something no lesson
  teaches (the `sudo-vs-su` card when `su` was never taught, #210).
- **A section the learner never types**: it's drilled by a card or a quiz question, but neither
  the console task nor Try it uses it, so review asks for something they've only read about.
  An example they can't run yet (it needs a later command or a script) doesn't count as
  practice. Say whether practice belongs in the task (if a check can see it) or in Try it.
- **A section nothing touches at all**: no task, Try it step, quiz question or card. Say whether
  it belongs in a later module.
- A section that belongs to a later unit (`pipefail` in Unit 1.1, before scripts).

### 6. Ambiguous task wording
- Two things with one name: an account and a group both called `airlock`, a file and a directory
  with one name.
- An unclear "it", "this" or "that file".
- Several parts run together in one sentence, where numbered steps would read better.
- A target that can be read two ways ("make it executable": by whom?).
- What "done" looks like isn't said, so the learner can't tell they've finished.

### 7. Silent outcomes and surprises
- A command that prints **nothing** on success (`chmod`, `kill`, `mkdir`, `>` into a file),
  where the lesson doesn't say so. A beginner reads silence as failure.
- Behaviour a beginner wouldn't expect and the lesson doesn't warn about: `groups` lagging after
  `usermod`, an error still on screen after `>`, a prompt that changes.
- In the console task: something the station console does differently from a real shell, or a
  command it lacks, with no "station console" note in that section.

## Output

Return **only** the body of an issue for this module, in this repo's format (#216 is the model).
The caller files it. Write plain English, short sentences, no filler.

````markdown
<One or two sentences: who reads this module and where they'd get stuck.>

1. **<The finding, as a short claim.>** <Where it is (section name, quiz Qn, card id, task part),
   quoted briefly. What a beginner asks at that point. Where it first appears, if earlier.>
2. …
N. **Smaller:** <minor findings, one line each.>

| Section | Typed in the task | Typed in Try it | Quiz | Cards |
|---|---|---|---|---|
| <each lesson `##` section> | yes / no | yes / no | Q2 / — | `card-id` / — |

## The module
`content/<track>/<unit>/NN-slug.md`. The slug, the checks, the card ids and the quiz order stay as they are. Questions may be reworded in place.

- **<Section or part>:** <the change that fixes the findings above, concrete enough to write
  from: the sentence to add, the real command to use, the example to show.>
- **`NEEDS`:** <new ideas the console task or lab relies on, for `tests/test_lesson_needs.py`>
  (only if the module has a console task or a lab).

## Acceptance criteria
```gherkin
Scenario: <one per finding or group of findings, each something a reader can check on the page>
  Given module NN of Unit X.Y
  Then …
```

## Does this touch
- Lesson content only
````

Order the findings most serious first: a quiz answer or task need you can't find, then terms
used before they're explained, then the rest. Number them, because the issue's sections refer
back to them.

If the module is clean, say so in one line and list what you checked. Never invent findings to
fill the issue. A module with two real findings is a good result.

## Constraints

- **Read-only.** Only Read, Grep, Glob and `git show` / `git log` / `git ls-tree` /
  `git rev-parse`. Never edit a file, never commit, never file the issue yourself, never run the
  suite or a container.
- Don't re-do the `content-reviewer`'s job: you aren't checking that answers are correct, that
  claims about the repo are true, or the Try it output. If you notice one of those is wrong,
  add it as one line under **Smaller**.
- Don't review style, story or difficulty, only whether a beginner can find their way.
