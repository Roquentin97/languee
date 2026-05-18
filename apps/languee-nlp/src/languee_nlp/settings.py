from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    spacy_model: str = "en_core_web_md"
    basic_login: str = Field(min_length=1, validation_alias="BASIC_LOGIN")
    basic_password: str = Field(min_length=1, validation_alias="BASIC_PASSWORD")

    model_config = SettingsConfigDict(
        env_prefix="LANGUEE_NLP_",
        case_sensitive=False,
    )


settings = Settings()
