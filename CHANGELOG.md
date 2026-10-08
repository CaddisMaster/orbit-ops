# Changelog

All notable changes to Orbit Ops. The format follows [Keep a Changelog](https://keepachangelog.com);
versions follow `VERSIONING.md`. Write entries for someone reading them in a year: what changed
and why it matters, not what the diff says.

## [Unreleased]

### Added
- The curriculum is now content: lessons are Markdown files with YAML front matter under
  `content/`, organised by `syllabus.yml` into tracks and units. The whole curriculum is
  validated at startup and in CI, so a lesson with a broken quiz fails the build with the file
  and field named, rather than breaking a page in production (#4).
- A module page with the story briefing, the lesson (syntax-highlighted code, tables) and the
  quiz, plus a syllabus page listing every track, unit and module. Quiz answers and
  explanations never reach the browser (#4).
- The first module, "The filesystem tree", and `docs/content-authoring.md` describing the format.
- Database tables for learner progress: which modules are started or complete (with a score), and
  every quiz answer submitted. Locked and available are worked out from the syllabus, never
  stored (#5).
- The daily loop works. Quiz questions are answered one at a time and replaced in place with the
  verdict, the right answer and the explanation. Answering the last question completes the module
  with a score (the first answer to each question is the one that counts) and links to the next
  module (#5).
- Modules unlock in order, and units unlock when their prerequisite units are finished. Opening a
  locked module sends you back to the bridge with what to finish first (#5).
- The full syllabus: four tracks (Life Support, Cargo & Fabrication, Fleet Command, and Comms,
  Sensors & Shields) and 19 units, with their prerequisites and story briefings (#6).
- Unit 1.1, **Linux & the shell**, is complete with ten modules: the filesystem, navigating,
  files and globs, permissions, users and sudo, processes and signals, pipes and redirection,
  text tools, environment and PATH, and apt. Every "Try it" block was run on Ubuntu 24.04 before
  merging (#6).
- The dashboard leads with today's mission, the next available module, plus overall progress.
  The syllabus marks every module complete, available or locked (#5).

### Fixed
- `HEAD` requests now get the same status and headers as `GET`, without a body, instead of
  `405 Method Not Allowed`. Uptime monitors and link checkers that use `HEAD` saw the site as
  down (#9).

## [0.1.0] — 2026-10-08

First release: the station's skeleton, live at learn.seandesmet.com.

**Server:** `/opt/orbit-ops/.env` is set up (RUNBOOK §2). After the deploy, set the `orbit_app`
password and `DB_APP_USER`/`DB_APP_PASSWORD` (RUNBOOK §3).

### Added
- The station is built: a FastAPI app with login, a dashboard placeholder and `/healthz`
  (reports the version the image was built as, so a deploy can be verified).
- Security carried over from Budget Buddy: argon2 password hashing, signed session cookies that
  can be revoked by rotating a per-user token, CSRF on every POST (htmx header or form field), a
  login rate limit (10/min), and a nonce-based Content-Security-Policy with framing denied.
- PostgreSQL schema managed by Alembic, with a least-privilege `orbit_app` role whose grants
  extend automatically to tables added by future migrations.
- Docker image (non-root, digest-pinned base, fully pinned dependencies) and a compose file sized
  for the droplet it shares with Budget Buddy: no published database port, 256 MB caps.
- CI (ruff, tests against real Postgres, a migration round-trip, image build), changelog and
  acceptance-criteria checks, and a Release workflow that backs up, migrates, deploys and verifies
  — plus a manual Rollback.
