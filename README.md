# Orbit Ops

> One DevOps module a day. Bring the space station *Meridian* back online, one system at a time.

A personal, gamified learning platform: a structured curriculum of ~15–20 minute daily modules
covering Linux, Bash, Git and networking; Python, Docker and Compose; Kubernetes and Helm; and
CI/CD, Terraform, Ansible, observability and DevSecOps. Each module has a story briefing, a lesson,
a quiz, and an exercise (an in-browser Python challenge or a hands-on lab), and feeds a
spaced-repetition flashcard deck. Progress earns XP, ranks, streaks and badges, and lights up a
map of the station.

Built with FastAPI, SQLAlchemy, Alembic, Jinja2 + htmx and PostgreSQL, in Docker. It is also an
exercise in a stack different from its sibling project, Budget Buddy, whose workflow it borrows.

## Run it locally

```bash
cp .env.example .env            # then set DB_PASSWORD and SECRET_KEY
docker compose up -d --build
docker compose exec web alembic upgrade head
docker compose exec web python -m scripts.create_user <username>
open http://localhost:5002
./test.sh                       # lint + tests
```

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow, conventions, how to add things
- [`docs/roadmap.md`](docs/roadmap.md) — the plan: curriculum, gamification, milestones
- [`docs/architecture.md`](docs/architecture.md) — how the code fits together
- [`RUNBOOK.md`](RUNBOOK.md) — production operations
- [`CHANGELOG.md`](CHANGELOG.md) · [`VERSIONING.md`](VERSIONING.md)

## Licence

MIT — see [`LICENSE`](LICENSE). htmx is vendored under its own 0BSD licence (`app/static/`).
