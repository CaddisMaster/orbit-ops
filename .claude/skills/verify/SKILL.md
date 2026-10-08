---
name: verify
description: Drive the real Orbit Ops HTTP surface at localhost:5002 — log in with a cookie jar and CSRF token, then GET/POST pages — to confirm a change works in the running app, not just in tests.
---

# Verify against the running app

Use after `docker compose up -d --build web` to check a change end-to-end. For anything that
needs JavaScript (htmx swaps, Pyodide), use Playwright instead (preferred over Claude in Chrome).

## 1. A throwaway user

```bash
docker compose exec -T web python - <<'PY'
from app.db import SessionLocal
from app.models import User
from app.security import hash_password
with SessionLocal() as db:
    if not db.query(User).filter_by(username="verify-bot").first():
        db.add(User(username="verify-bot", password_hash=hash_password("verify-bot-password")))
        db.commit()
PY
```

## 2. Log in (cookie jar + CSRF)

The CSRF token lives in the signed session cookie and is rendered into every form. Fetch the
login page with a jar, scrape the token, post it back with the same jar.

```bash
JAR=$(mktemp)
TOKEN=$(curl -s -c "$JAR" -b "$JAR" http://localhost:5002/login | sed -n 's/.*name="csrf_token" value="\([^"]*\)".*/\1/p' | head -1)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -c "$JAR" -b "$JAR" \
  --data-urlencode "username=verify-bot" --data-urlencode "password=verify-bot-password" \
  --data-urlencode "csrf_token=$TOKEN" http://localhost:5002/login     # expect 303 http://localhost:5002/
```

⚠️ Login rotates the session (and so the CSRF token). Re-scrape the token from any page after
logging in before the next POST.

## 3. Exercise the change

```bash
curl -s -b "$JAR" http://localhost:5002/ | grep -i 'mission'                    # a page
TOKEN=$(curl -s -b "$JAR" http://localhost:5002/ | sed -n 's/.*"X-CSRF-Token": "\([^"]*\)".*/\1/p' | head -1)
curl -s -b "$JAR" -H "HX-Request: true" -H "X-CSRF-Token: $TOKEN" -X POST http://localhost:5002/<route>   # an htmx POST
```

## 4. Report

State what you requested, the status codes, and the specific content you saw — not "it works".
Clean up: `rm -f "$JAR"`.
