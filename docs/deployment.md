# Deployment checklist

The operational detail is in `RUNBOOK.md`. This file is the checklist for changes that affect a
deploy.

## Adding an environment variable

1. Add it to `Settings` in `app/config.py` with a safe default (or make startup fail loudly).
2. Add it to `.env.example` with a comment (`tests/test_repo_hardening.py` enforces this).
3. Note it under the release's CHANGELOG entry as **"Server: add `X=` to `.env`"**.
4. Before approving the deploy, add it to `/opt/orbit-ops/.env` on the droplet.
5. Then add it to the `orbit-ops-env-prod` item in Bitwarden, so the recovery copy keeps up
   (RUNBOOK §3). Locally, add it to `orbit-ops-env-local` and rerun `./bw-env.sh`.

## Adding an Alembic revision

1. Its own PR. Expand-only: new tables, nullable or defaulted columns, new indexes.
2. Real `downgrade()` — CI round-trips it.
3. Deploy order is automatic: the release runs `alembic upgrade head` from the new image *before*
   the new image starts serving.
4. A contract step (drop/rename) ships in a **later** release than the code that stopped using it.

## Cutting a release

Run the `release-prep` agent first: it reports go/no-go, the version, new env vars, Alembic
revisions and the exact deploy sequence.


1. `CHANGELOG.md`: rename `[Unreleased]` to `[X.Y.Z] — YYYY-MM-DD`, start a fresh `[Unreleased]`.
2. Merge that PR, then publish a GitHub Release `vX.Y.Z` from `main` with the entry as notes.
3. Optionally rehearse it on the VM while the deployment waits (RUNBOOK §5, #323). Approve the
   `production` deployment when the smoke and scan jobs are green. A failed scan
   is a CRITICAL vulnerability with a fix available (#265): ship the fix, usually a base-image
   bump, as a patch release; accept it in `.grype.yaml` with its reason only if it can't ship.
   The image is built for `linux/amd64` and `linux/arm64` (#321), the arm64 half under QEMU, and
   each is scanned in its own leg. The smoke test and the droplet run amd64; arm64 is for
   staging on the VM.
4. Confirm `https://learn.seandesmet.com/healthz` reports `X.Y.Z` **and** Budget Buddy's
   `/healthz` is still green; glance at `free -m` on the droplet.
