import pytest
from pydantic import ValidationError

from languee_nlp.settings import Settings


def test_basic_login_is_required(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("BASIC_LOGIN")

    with pytest.raises(ValidationError):
        Settings()


def test_basic_password_is_required(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("BASIC_PASSWORD")

    with pytest.raises(ValidationError):
        Settings()


# ---------------------------------------------------------------------------
# log_format
# ---------------------------------------------------------------------------


def test_log_format_json(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_FORMAT", "json")
    s = Settings()
    assert s.log_format == "json"


def test_log_format_pretty(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_FORMAT", "pretty")
    s = Settings()
    assert s.log_format == "pretty"


def test_log_format_case_insensitive(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_FORMAT", "JSON")
    s = Settings()
    assert s.log_format == "json"


def test_log_format_invalid_raises_validation_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_FORMAT", "plaintext")
    with pytest.raises(ValidationError):
        Settings()


# ---------------------------------------------------------------------------
# log_level
# ---------------------------------------------------------------------------


def test_log_level_debug(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "debug")
    s = Settings()
    assert s.log_level == "debug"


def test_log_level_warning(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "warning")
    s = Settings()
    assert s.log_level == "warning"


def test_log_level_warn_alias(monkeypatch: pytest.MonkeyPatch):
    """'warn' is accepted as a valid alias for 'warning'."""
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "warn")
    s = Settings()
    assert s.log_level == "warn"


def test_log_level_case_insensitive(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "INFO")
    s = Settings()
    assert s.log_level == "info"


def test_log_level_invalid_raises_validation_error(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "verbose")
    with pytest.raises(ValidationError):
        Settings()


# ---------------------------------------------------------------------------
# service_name and environment
# ---------------------------------------------------------------------------


def test_service_name_read_from_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_SERVICE_NAME", "my-custom-service")
    s = Settings()
    assert s.service_name == "my-custom-service"


def test_service_name_default(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("LANGUEE_NLP_SERVICE_NAME", raising=False)
    s = Settings()
    assert s.service_name == "languee-nlp"


def test_environment_read_from_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LANGUEE_NLP_ENVIRONMENT", "production")
    s = Settings()
    assert s.environment == "production"


def test_environment_default(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("LANGUEE_NLP_ENVIRONMENT", raising=False)
    s = Settings()
    assert s.environment == "development"


def test_each_test_uses_fresh_settings_instance(monkeypatch: pytest.MonkeyPatch):
    """Verify that each test creates a fresh Settings() and does not rely on
    the module-level singleton. Changing env mid-test must be reflected."""
    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "error")
    s1 = Settings()
    assert s1.log_level == "error"

    monkeypatch.setenv("LANGUEE_NLP_LOG_LEVEL", "debug")
    s2 = Settings()
    assert s2.log_level == "debug"

    # The two instances are independent
    assert s1.log_level != s2.log_level
