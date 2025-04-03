"""
Application settings.
"""
import os
import secrets
import warnings
from typing import Literal

from pydantic import (HttpUrl, PostgresDsn, computed_field, model_validator )
from pydantic_core import Url
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
  """
  Application settings.
  """
  model_config = SettingsConfigDict(
    # Use top level .env file (one level above ./backend/)
    env_file="../.env",
    env_ignore_empty=True,
    extra="ignore",
  )
  API_V1_STR: str = "/api/v1"
  SECRET_KEY: str = secrets.token_urlsafe(32)
  ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 8)))
  FRONTEND_HOST: str = os.getenv("FRONTEND_HOST", "http://localhost:5173")
  ENVIRONMENT: Literal["local", "staging", "production"] = "local"
  BUILD_PATH: str = os.getenv('BUILD_PATH', 'frontend/dist')

  BACKEND_CORS_ORIGINS: str = os.getenv("BACKEND_CORS_ORIGINS", "*")

  @computed_field
  @property
  def all_cors_origins(self) -> list[str]:
    """
    Return a list of all CORS origins.
    """
    return self.BACKEND_CORS_ORIGINS.split(",") + [self.FRONTEND_HOST]

  PROJECT_NAME: str = os.getenv("PROJECT_NAME", "FastAPI Template")
  SENTRY_DSN: HttpUrl | None = os.getenv("SENTRY_DSN", None)
  POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
  POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5432"))
  POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
  POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "change-this")
  POSTGRES_DB: str = os.getenv("POSTGRES_DB", "fastapi_template")

  @computed_field
  @property
  def sqlalchemy_database_uri(self) -> PostgresDsn:
    """
    Build the database URL.
    """
    return Url.build(
      scheme="postgresql",
      username=self.POSTGRES_USER,
      password=self.POSTGRES_PASSWORD,
      host=self.POSTGRES_SERVER,
      port=self.POSTGRES_PORT,
      path=self.POSTGRES_DB,
    )

  SMTP_TLS: bool = True
  SMTP_SSL: bool = False
  SMTP_PORT: int = 587
  SMTP_HOST: str | None = None
  SMTP_USER: str | None = None
  SMTP_PASSWORD: str | None = None
  # TODO: update type to EmailStr when sqlmodel supports it
  EMAILS_FROM_EMAIL: str | None = None
  emails_from_name: str | None = None

  @model_validator(mode="after")
  def _set_default_emails_from(self) -> Self:
    if not self.emails_from_name:
      self.emails_from_name = self.PROJECT_NAME
    return self

  EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

  @computed_field
  @property
  def emails_enabled(self) -> bool:
    """
    Check if emails are enabled.
    """
    return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

  EMAIL_TEST_USER: str = "test@example.com"
  FIRST_SUPERUSER: str = os.getenv("FIRST_SUPERUSER", "mkrnaqeebi@gmail.com")
  FIRST_SUPERUSER_PASSWORD: str = os.getenv("FIRST_SUPERUSER_PASSWORD", "change-this")

  def _check_default_secret(self, var_name: str, value: str | None) -> None:
    if value == "change-this":
      message = (
        f'The value of {var_name} is "change-this", '
        "for security, please change it, at least for deployments."
      )
      if self.ENVIRONMENT == "local":
        warnings.warn(message, stacklevel=1)
      else:
        raise ValueError(message)

  @model_validator(mode="after")
  def _enforce_non_default_secrets(self) -> Self:
    self._check_default_secret("SECRET_KEY", self.SECRET_KEY)
    self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
    self._check_default_secret(
        "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
    )
    return self


settings = Settings()
