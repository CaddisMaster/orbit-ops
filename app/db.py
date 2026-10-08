"""SQLAlchemy engine and the per-request session dependency."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


# A small pool: one process, one user. pool_pre_ping survives a db container
# restart without the first request after it failing.
engine = create_engine(get_settings().database_url(), pool_size=5, max_overflow=2, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed. Routes
    commit explicitly; anything uncommitted is rolled back on close."""
    with SessionLocal() as session:
        yield session
