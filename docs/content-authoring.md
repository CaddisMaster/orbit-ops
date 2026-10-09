# Content authoring

How to write curriculum for Orbit Ops. The schema is enforced by `app/content/schema.py`, both
when the app starts and in CI (`tests/test_content.py`), so a broken lesson fails a PR and never
reaches production. Error messages name the file and the field, for example
`core/linux-shell/03-permissions.md: quiz.2.choice.answer: Value error, answer 4 is not an index into the 4 options`.

## Layout

```
content/
  syllabus.yml                        tracks → units, in teaching order, with prerequisites
  <track>/<unit>/NN-<slug>.md         one module: YAML front matter + Markdown lesson
```

- The **directory names must match the slugs** in `syllabus.yml`.
- The filename gives the module's **position** (`NN`, two digits) and its **slug**, which must be
  unique across the whole curriculum. The slug is the module's permanent ID: learner progress is
  stored against it, so **never rename a published module's slug**. Renumbering `NN` is fine.
- A unit listed in the syllabus with no files yet shows as "Coming soon".

## syllabus.yml

```yaml
ranks:                         # rank titles by level band; first at level 1, levels ascending
  - {title: Cadet, level: 1}
  - {title: Technician, level: 3}
tracks:
  - slug: core                 # lowercase-hyphenated
    title: Core Systems
    deck: Life Support         # the station deck this track brings back online
    blurb: One or two sentences.
    units:
      - slug: linux-shell
        title: Linux & the shell
        briefing: Story text for the unit (Markdown).
        prerequisites: []      # unit slugs that must be finished first; no cycles
        map: {x: 50, y: 10}    # optional: where it sits on its deck of /map, 0–100 each way
badges:                        # in the order the badges page shows them
  - slug: unit-linux-shell     # permanent ID, stored when earned: never rename an earned badge
    name: Air Scrubbers Online
    description: Complete the unit "Linux & the shell".   # shown even while locked
    emblem: life-support       # life-support | fabrication | fleet | shields | flame | star
    rule: {unit_complete: linux-shell}
```

`map` positions a unit within its track's deck on the station map, as percentages of the
deck's drawing area (`x` left to right, `y` top to bottom). Anything outside 0–100 fails
validation, naming the unit. Leave it out and the unit goes on an automatic three-column grid,
so a new unit always appears. Labels under the nodes drop any subtitle after a colon and wrap
at about 16 characters, so place nodes about 25 apart across a row.

A badge's `rule` is one of a fixed set, so content picks the rule but cannot run code:

| Rule | Earned when |
|---|---|
| `{unit_complete: <unit slug>}` | every module in that unit is complete (the unit must exist) |
| `{streak: <days>}` | the daily streak reaches that many days (2 or more) |
| `{first_perfect_quiz: true}` | any module is completed with every quiz answer right first time |

Rules are checked after every module completion against everything the learner has done, so a
badge added later is earned at the learner's next completion. Emblems are inline SVGs in
`app/templates/partials/_emblem.html`; adding one means adding it there and to `Emblem` in
`app/content/schema.py`. A new *kind* of rule is code: a model in the schema and a case in
`app/game/badges.py`.

## A module

```markdown
---
title: The filesystem tree
minutes: 15            # 5–30; aim for 15–20 including the quiz
xp: 50                 # optional, default 50; awarded once on completion (+20 for a perfect quiz)
story: |               # the mission-log briefing (Markdown)
  **Mission log, day 1.** …
quiz:                  # 1–8 questions; aim for 3–5
  - type: choice       # exactly one right option
    q: Which directory is the top of the filesystem?
    options: ["/home", "/", "/root", "~"]
    answer: 1          # 0-based index
    explain: Shown after answering, right or wrong.
  - type: multi        # several right options
    q: Which hold data that changes at runtime?
    options: ["/var/log", "/usr/bin", "/tmp", "/etc"]
    answer: [0, 2]
    explain: …
  - type: fill         # typed answer; compared trimmed and case-insensitively
    q: An absolute path starts with which character?
    answer: ["/"]      # every accepted spelling
    explain: …
cards:                 # optional flashcards for spaced repetition (v0.4.0)
  - front: What lives in /etc?
    back: System-wide configuration.
---

## Lesson heading

CommonMark plus tables. Fenced code blocks with a language (```bash, ```python,
```yaml, ```text …) are syntax-highlighted.
```

Raw HTML in lessons is **disabled**: it renders as literal text. Use Markdown.

Formatting inside a code block is literal, so `*word*` in a ```text diagram shows the asterisks.

## Writing guidelines

- **15–20 minutes, all in.** About 500–900 words of lesson, a quiz of 3–5 questions, and a
  "Try it" section with commands to run.
- **One idea per module.** If you need a second big heading that isn't about the first idea,
  that's the next module.
- **Open with the story, then teach for real.** The station story frames the lesson but never
  replaces the technical content.
- **Tie it to something real.** Point at Budget Buddy's or Orbit Ops's own setup when it
  illustrates the point (the RUNBOOKs are full of examples).
- **Quiz the idea, not the trivia.** Every `explain` should teach something, including why the
  wrong options are wrong when that's useful.
- **Fact-check AI drafts like code.** A drafted module is a starting point, not a source.
  Run every command in "Try it" yourself before merging.
