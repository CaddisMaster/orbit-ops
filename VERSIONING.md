# Versioning

Orbit Ops uses the **shape** of [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`)
while it sits in `0.x`. It is a single-deployment app with no downstream consumers, so version
numbers are discipline and a changelog anchor, not a compatibility promise. (Same scheme as
Budget Buddy.)

| Bump | When | Example |
|---|---|---|
| `0.MINOR.0` | Any release carrying a feature — even several at once | `0.1.0` → `0.2.0` |
| `0.MINOR.PATCH` | Fixes only, no new surface | `0.2.0` → `0.2.1` |
| `1.0.0` | Only when the project is deliberately declared stable | — |

New lesson content with no code change ships as a PATCH.

**The release is the unit, not the feature.** A release bundles everything merged to `main` since
the previous one; each item is listed in that release's `CHANGELOG.md` entry. There is no fixed
cadence.

**Versions only climb.** Published tags are never rewritten, moved or reused.

**Milestones** map one-to-one to MINOR releases, with exactly one open at a time. The plan for each
is in `docs/roadmap.md` §8.
