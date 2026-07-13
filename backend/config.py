from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://netmap:password@localhost:5432/netmap"

    model_config = {"env_file": ".env"}


settings = Settings()
