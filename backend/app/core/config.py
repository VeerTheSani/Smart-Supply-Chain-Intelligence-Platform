"""
Smart Supply Chain — Core Configuration.
Loads environment variables using pydantic-settings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    ENV: str = "development"
    PORT: int = 8000
    MONGO_URI: str = "mongodb://localhost:27017/smart_supply_chain"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 24
    CORS_ORIGINS: str = "http://localhost:5173, http://localhost:5174"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into a list."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance — created once per app lifecycle."""
    return Settings()
