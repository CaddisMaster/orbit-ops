# ⚠️ STAGE ORDER IS LOAD-BEARING. `prod` must stay LAST.
# An untargeted build (CI, the release workflow, a bare `docker build .`) builds
# the FINAL stage. If `dev` ever ends up last, production ships pytest.
#
# Base image pinned by digest (same reasoning as Budget Buddy #405): a tag is
# movable, a digest is not. The tag names the Python PATCH so Dependabot's
# docker updater always sees a name change.
# Pyodide (#53): Python in the browser, fetched and checked by sha256 in a stage
# of its own, so only the five files it keeps reach the image. It lands in
# /opt/pyodide, not app/static/, because in development the source tree is
# bind-mounted over /app and would hide it.
FROM python:3.14.8-slim@sha256:fbecd461fc72d21b2143c6eaba25143738079154a6d0ea3da3aec724f50eed4a AS pyodide
COPY scripts/fetch_pyodide.py /tmp/fetch_pyodide.py
RUN python /tmp/fetch_pyodide.py /pyodide

FROM python:3.14.8-slim@sha256:fbecd461fc72d21b2143c6eaba25143738079154a6d0ea3da3aec724f50eed4a AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# No postgresql-client (#263): pg_dump and psql both run in the db container
# (`docker compose exec db psql`), so the app image doesn't need them.
# No home and no login shell: nothing reads $HOME.
RUN useradd --no-create-home --shell /usr/sbin/nologin --uid 10001 appuser
# ⚠️ Root owns the code (#263). With --chown the running app could rewrite its
# own code and lessons; nothing under /app is written at runtime. CI's image
# job fails if appuser can write anything under /app.
COPY . .
# Read-only to the app user: root owns it.
COPY --from=pyodide /pyodide /opt/pyodide

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
# Trusting every forwarding address ("*") is safe here, and deliberate (#264):
# compose publishes the port on 127.0.0.1 only, so host Nginx is the only client
# that can reach uvicorn and set those headers. Pinning the Docker bridge
# gateway's IP instead would break when the network is recreated on a new subnet.
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
