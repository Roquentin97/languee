from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    spacy_model: str = "en_core_web_md"

    model_config = SettingsConfigDict(
        env_prefix="LANGUEE_NLP_",
        case_sensitive=False,
    )


settings = Settings()
