"""
Application settings.
"""
# Standard library imports
from enum import Enum
import os
from pathlib import Path
from urllib.parse import quote_plus
import warnings

# Third-party imports
from dotenv import load_dotenv
from pydantic import HttpUrl, PostgresDsn, computed_field, model_validator
from pydantic_core import Url
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self

load_dotenv()

class Environment(str, Enum):
    """Application environment types.

    Defines the possible environments the application can run in:
    development, staging, production, and test.
    """

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"
    LOCAL = "local"

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
    
    # Outlook OAuth2 settings
    OUTLOOK_CLIENT_ID: str = os.getenv("OUTLOOK_CLIENT_ID", "")
    OUTLOOK_CLIENT_SECRET: str = os.getenv("OUTLOOK_CLIENT_SECRET", "")
    OUTLOOK_REDIRECT_URI: str = os.getenv("OUTLOOK_REDIRECT_URI", "http://localhost:8000/api/v1/outlook/callback/")
    
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "this-is-my-secret-key-change-this")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 8)))
    FRONTEND_HOST: str = os.getenv("FRONTEND_HOST", "http://localhost:5173")
    ENVIRONMENT: Environment = Environment.DEVELOPMENT
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
    FIRST_SUPERUSER_PASSWORD: str = os.getenv(
        "FIRST_SUPERUSER_PASSWORD", "change-this")

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

    OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")

    # Gmail OAuth2 configuration
    GOOGLE_CLIENT_ID: str | None = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: str | None = os.getenv("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/google/callback/")
    GOOGLE_AUTH_URI: str = "https://accounts.google.com/o/oauth2/auth"
    GOOGLE_TOKEN_URI: str = "https://oauth2.googleapis.com/token"
    GMAIL_SCOPES: list[str] = [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid"
    ]

    # GitHub OAuth2 configuration
    GITHUB_CLIENT_ID: str | None = os.getenv("GITHUB_CLIENT_ID")
    GITHUB_CLIENT_SECRET: str | None = os.getenv("GITHUB_CLIENT_SECRET")
    GITHUB_REDIRECT_URI: str = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/api/v1/github/callback/")
    GITHUB_AUTH_URI: str = "https://github.com/login/oauth/authorize"
    GITHUB_TOKEN_URI: str = "https://github.com/login/oauth/access_token"
    GITHUB_SCOPES: list[str] = [
        "repo",
        "user",
        "read:org"
    ]

    # Logging configuration
    LOG_DIR: Path = Path(os.getenv("LOG_DIR", "./logs"))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "json")

    # LLM configuration
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-5")
    DEFAULT_LLM_TEMPERATURE: float = float(os.getenv("DEFAULT_LLM_TEMPERATURE", "1"))
    LLM_API_KEY: str | None = os.getenv("LLM_API_KEY", os.getenv("OPENAI_API_KEY"))
    MAX_TOKENS: int = int(os.getenv("MAX_TOKENS", "2000"))
    MAX_LLM_CALL_RETRIES: int = int(os.getenv("MAX_LLM_CALL_RETRIES", "3"))

    # PostgreSQL configuration for LangGraph
    POSTGRES_POOL_SIZE: int = int(os.getenv("POSTGRES_POOL_SIZE", "10"))

    @computed_field
    @property
    def POSTGRES_URL(self) -> str:
        """Build the PostgreSQL URL for async connections."""
        # Percent-encode user & password to avoid breaking URL when they contain
        # special characters like @, /, :, %, # etc.
        user_enc = quote_plus(self.POSTGRES_USER)
        pwd_enc = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql://{user_enc}:{pwd_enc}@"
            f"{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # LangGraph checkpoint tables
    CHECKPOINT_TABLES: list[str] = ["checkpoints", "checkpoint_blobs", "checkpoint_writes"]

    # Knowledge search configuration
    KNOWLEDGE_SEARCH_SIMILARITY_THRESHOLD: float = float(os.getenv("KNOWLEDGE_SEARCH_SIMILARITY_THRESHOLD", "1.2"))
    KNOWLEDGE_SEARCH_MAX_RESULTS: int = int(os.getenv("KNOWLEDGE_SEARCH_MAX_RESULTS", "3"))
    KNOWLEDGE_SEARCH_ORGANIZATION_ID: str = os.getenv("KNOWLEDGE_SEARCH_ORGANIZATION_ID", "default_org")

settings = Settings()
