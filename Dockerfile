# ⚠️ STAGE ORDER IS LOAD-BEARING. `prod` must stay LAST.
# An untargeted build (CI, the release workflow, a bare `docker build .`) builds
# the FINAL stage. If `dev` ever ends up last, production ships pytest.
#
# Base image pinned by digest (same reasoning as Budget Buddy #405): a tag is
# movable, a digest is not. The tag names the Python PATCH so Dependabot's
# docker updater always sees a name change.
FROM python:3.14.7-slim@sha256:51dafde81dbdb6ebde285137a295cf18a47ca95234fe388a343719cb97305b3d AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# pg_dump for the pre-deploy backup runs in the db container, but psql here is
# handy for `docker compose exec web psql` debugging and costs ~10 MB.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 appuser
COPY --chown=appuser:appuser . .

# The version this image WAS BUILT AS, so a deploy can be verified (BB #305).
# A build arg, not a runtime env var: .env records what compose was told to
# pull; this records what the image is.
ARG APP_VERSION=dev
ARG APP_COMMIT=dev
ENV APP_VERSION=${APP_VERSION}
ENV APP_COMMIT=${APP_COMMIT}

USER appuser
EXPOSE 8000
# ONE process on purpose: the droplet is shared with Budget Buddy (2 GB), and the
# login rate limiter is in-process memory, which is only correct with one
# process. Plain uvicorn rather than gunicorn+UvicornWorker: compose's
# `restart: always` already supervises the process, and uvicorn deprecated its
# gunicorn worker class. --proxy-headers trusts host Nginx's X-Forwarded-*.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]

# Local development only — selected by docker-compose.override.yml.
FROM base AS dev
USER root
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
USER appuser

# The shipped image. Deliberately empty: it exists so that this, not `dev`, is
# the final stage.
FROM base AS prod
