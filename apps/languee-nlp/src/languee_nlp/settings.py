from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_VALID_LOG_FORMATS = {"json", "pretty"}
_VALID_LOG_LEVELS = {"debug", "info", "warning", "warn", "error", "critical"}


class Settings(BaseSettings):
    spacy_model: str = "en_core_web_md"
    basic_login: str = Field(min_length=1, validation_alias="BASIC_LOGIN")
    basic_password: str = Field(min_length=1, validation_alias="BASIC_PASSWORD")
    log_format: str = "json"
    log_level: str = "info"
    service_name: str = "languee-nlp"
    environment: str = "development"

    model_config = SettingsConfigDict(
        env_prefix="LANGUEE_NLP_",
        case_sensitive=False,
    )

    @field_validator("log_format", mode="before")
    @classmethod
    def validate_log_format(cls, v: object) -> str:
        normalized = str(v).lower()
        if normalized not in _VALID_LOG_FORMATS:
            valid = ", ".join(sorted(_VALID_LOG_FORMATS))
            raise ValueError(f"Invalid log_format '{v}'. Must be one of: {valid}")
        return normalized

    @field_validator("log_level", mode="before")
    @classmethod
    def validate_log_level(cls, v: object) -> str:
        normalized = str(v).lower()
        if normalized not in _VALID_LOG_LEVELS:
            valid = ", ".join(sorted(_VALID_LOG_LEVELS))
            raise ValueError(f"Invalid log_level '{v}'. Must be one of: {valid}")
        return normalized


settings = Settings()
