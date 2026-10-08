"""Create (or reset the password of) the learner account.

    docker compose exec web python -m scripts.create_user <username>

Prompts for the password so it never lands in shell history. Resetting rotates
the session token, which logs out every existing session.
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, new_session_token
from app.security import hash_password

MIN_LENGTH = 12


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("username")
    args = parser.parse_args()

    password = getpass.getpass("Password: ")
    if len(password) < MIN_LENGTH:
        print(f"Password must be at least {MIN_LENGTH} characters.", file=sys.stderr)
        return 1
    if getpass.getpass("Repeat: ") != password:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username))
        if user is None:
            db.add(User(username=args.username, password_hash=hash_password(password)))
            action = "Created"
        else:
            user.password_hash = hash_password(password)
            user.session_token = new_session_token()
            action = "Reset password for"
        db.commit()
    print(f"{action} {args.username}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
