from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "hearthstone-assistant"
    debug: bool = True
    cors_origins: str = "http://localhost:5173"

    database_url: str = "sqlite:///./data/app.db"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7

    sync_api_token: str = "dev-sync-token"

    blizzard_client_id: str = ""
    blizzard_client_secret: str = ""
    blizzard_region: str = "us"
    blizzard_locale: str = "zh_CN"

    llm_provider: str = "mock"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = "gpt-4o-mini"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
