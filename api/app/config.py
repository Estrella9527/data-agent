from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "重明 Data Agent"
    debug: bool = False

    # LLM Configuration — OpenAI-compatible (Backend B)
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o"
    llm_temperature: float = 0.7
    llm_max_tokens: int = 4096

    # Claude SDK Configuration (Backend A)
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    claude_haiku_model: str = "claude-haiku-4-5-20251001"
    claude_max_tokens: int = 4096

    # Database
    database_url: str = "postgresql://dataagent:dataagent123@postgres:5432/dataagent"

    # CORS
    cors_origins: list[str] = ["http://localhost:3001", "http://localhost:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
