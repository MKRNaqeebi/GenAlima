"""
Application settings.
"""
import os
import secrets
import warnings
from typing import Annotated, Any, Literal

from pydantic import (
  AnyUrl,
  BeforeValidator,
  HttpUrl,
  PostgresDsn,
  computed_field,
  model_validator,
)
from pydantic_core import Url
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self
from dotenv import load_dotenv

load_dotenv()

# Environment variables
google_key = os.getenv("GOOGLE_CLOUD_PROJECT_JSON")
if google_key:
  with open("google_key.json", "w", encoding="utf-8") as f:
    f.write(google_key)
  GOOGLE_CLOUD_PROJECT = "google_key.json"
FIRE_LOGIN_API_URL = os.getenv("FIRE_LOGIN_API_URL")
FIRE_WEB_API_KEY = os.getenv('FIRE_WEB_API_KEY', '')
FIRE_LOGIN_API_URL = os.getenv(
  'FIRE_LOGIN_API_URL',
  f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIRE_WEB_API_KEY}')
SECRET_KEY = os.getenv('SECRET_KEY', 'helloQA28DT9lolMKamran-2nY5www')
CHAT_COLLECTION_NAME = os.getenv('CHAT_COLLECTION_NAME', 'chat')
MODEL_COLLECTION_NAME = os.getenv('MODEL_COLLECTION_NAME', 'model')
USER_COLLECTION_NAME = os.getenv('USER_COLLECTION_NAME', 'user')
TEMPLATE_COLLECTION_NAME = os.getenv('TEMPLATE_COLLECTION_NAME', 'template')
CONNECTOR_COLLECTION_NAME = os.getenv('CONNECTOR_COLLECTION_NAME', 'connector')
BUILD_PATH = os.getenv('BUILD_PATH', 'frontend/dist')

def parse_cors(v: Any) -> list[str] | str:
  """
  Parse CORS origins from a string or a list of strings.
  """
  if isinstance(v, str) and not v.startswith("["):
    return [i.strip() for i in v.split(",")]
  elif isinstance(v, list | str):
    return v
  raise ValueError(v)


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
  # 60 minutes * 24 hours * 8 days = 8 days
  ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
  FRONTEND_HOST: str = "http://localhost:5173"
  ENVIRONMENT: Literal["local", "staging", "production"] = "local"

  BACKEND_CORS_ORIGINS: Annotated[
      list[AnyUrl] | str, BeforeValidator(parse_cors)
  ] = []

  @computed_field  # type: ignore[prop-decorator]
  @property
  def all_cors_origins(self) -> list[str]:
    """
    Return a list of all CORS origins.
    """
    return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
      self.FRONTEND_HOST
    ]

  PROJECT_NAME: str
  SENTRY_DSN: HttpUrl | None = None
  POSTGRES_SERVER: str
  POSTGRES_PORT: int = 5432
  POSTGRES_USER: str
  POSTGRES_PASSWORD: str = ""
  POSTGRES_DB: str = ""

  @computed_field  # type: ignore[prop-decorator]
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

  @computed_field  # type: ignore[prop-decorator]
  @property
  def emails_enabled(self) -> bool:
    """
    Check if emails are enabled.
    """
    return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

  # TODO: update type to EmailStr when sqlmodel supports it
  EMAIL_TEST_USER: str = "test@example.com"
  # TODO: update type to EmailStr when sqlmodel supports it
  FIRST_SUPERUSER: str
  FIRST_SUPERUSER_PASSWORD: str

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


settings = Settings()  # type: ignore
