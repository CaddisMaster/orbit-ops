# Deployment checklist

The operational detail is in `RUNBOOK.md`. This file is the checklist for changes that affect a
deploy.

## Adding an environment variable

1. Add it to `Settings` in `app/config.py` with a safe default (or make startup fail loudly).
2. Add it to `.env.example` with a comment (`tests/test_repo_hardening.py` enforces this).
3. Note it under the release's CHANGELOG entry as **"Server: add `X=` to `.env`"**.
4. Before approving the deploy, add it to `/opt/orbit-ops/.env` on the droplet.

## Adding an Alembic revision

1. Its own PR. Expand-only: new tables, nullable or defaulted columns, new indexes.
2. Real `downgrade()` — CI round-trips it.
3. Deploy order is automatic: the release runs `alembic upgrade head` from the new image *before*
   the new image starts serving.
4. A contract step (drop/rename) ships in a **later** release than the code that stopped using it.

## Cutting a release

1. `CHANGELOG.md`: rename `[Unreleased]` to `[X.Y.Z] — YYYY-MM-DD`, start a fresh `[Unreleased]`.
2. Merge that PR, then publish a GitHub Release `vX.Y.Z` from `main` with the entry as notes.
3. Approve the `production` deployment when the smoke job is green.
4. Confirm `https://learn.seandesmet.com/healthz` reports `X.Y.Z` **and** Budget Buddy's
   `/healthz` is still green; glance at `free -m` on the droplet.
