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
