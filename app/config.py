"""Typed settings, read once from the environment (and .env locally).

Budget Buddy reads `os.getenv` wherever it needs a value; here every setting is
declared in one place with a type, so a typo'd or missing variable fails at
startup instead of at the first request that needs it.
"""

from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    # Environment only — compose's `env_file:` injects .env. Reading the file
    # here too would fail locally anyway: the bind-mounted .env is 0600 on the
    # host and the container runs as uid 10001.
    model_config = SettingsConfigDict(extra="ignore")

    app_version: str = "dev"
    app_commit: str = "dev"

    db_host: str = "db"
    db_port: int = 5432
    db_name: str = "orbit"
    db_user: str = "orbit"
    db_password: str = ""
    # Least-privilege runtime role. Blank = connect as the owner (local dev).
    db_app_user: str = ""
    db_app_password: str = ""

    secret_key: str = Field(min_length=16)
    cookie_secure: bool = False
    templates_auto_reload: bool = False
    app_timezone: str = "UTC"

    anthropic_api_key: str = ""
    ai_monthly_budget_cents: int = 500

    # Login attempts allowed per client per minute (BB: 10/min on POST /login).
    login_rate_limit: int = 10

    @field_validator("app_timezone")
    @classmethod
    def _valid_timezone(cls, value: str) -> str:
        ZoneInfo(value)  # raises on an unknown zone, at startup
        return value

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.app_timezone)

    def database_url(self, *, owner: bool = False) -> URL:
        """The runtime URL uses the app role when one is configured; migrations
        pass owner=True because the app role cannot run DDL."""
        use_owner = owner or not self.db_app_user
        return URL.create(
            "postgresql+psycopg",
            username=self.db_user if use_owner else self.db_app_user,
            password=self.db_password if use_owner else self.db_app_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
