# `.claude/` — the harness half

`CLAUDE.md` says what the agreement is; this directory makes some of it execute. If anything here
disagrees with `CLAUDE.md`, `CONTRIBUTING.md` or the workflows, this directory is what needs
fixing. Ported from Budget Buddy.

```
.claude/
  agents/                   # sweeper (mechanical sweeps), test-first (make a failing test pass)
  skills/verify/            # drive the real HTTP surface at :5002 (CSRF cookie jar included)
  commands/wrap.md          # /wrap — the end-of-session sequence
  hooks/changelog-guard.sh  # Stop hook: the CHANGELOG rule, locally (mirrors changelog.yml)
  settings.json             # permission allowlist + hook wiring
```

## ⚠️ This repo is public — mind the line

| Committed `settings.json` | Gitignored `settings.local.json` |
|---|---|
| Repo-relative commands: `./test.sh`, compose, read-only `git`/`gh` | Absolute `$HOME` paths |
| Anything true for any clone | `ssh`, host names, the deploy user, backup paths |

## The Stop hook

If the branch changed `app/` and not `CHANGELOG.md`, it says so once, then stays quiet. It fails
open on anything it cannot understand. Silence it locally with `SKIP_CHANGELOG_GUARD=1`; on the PR
the escape hatch is the `skip-changelog` label.

## Not yet ported

Budget Buddy's `gotcha-auditor` and `release-prep` report agents, and its `claude-triage`
workflow. Port them when this repo has enough history for them to audit.
