from unittest.mock import MagicMock, patch

import pytest

from languee_nlp.nlp.provider import get_nlp


@pytest.fixture(autouse=True)
def reset_provider():
    with patch("languee_nlp.nlp.provider._nlp", {}):
        yield


def test_get_nlp_loads_model_via_spacy_load():
    mock_model = MagicMock()
    with patch(
        "languee_nlp.nlp.provider.spacy.load", return_value=mock_model
    ) as mock_load:
        result = get_nlp()
    mock_load.assert_called_once()
    assert result is mock_model


def test_get_nlp_uses_default_model_name():
    mock_model = MagicMock()
    with patch(
        "languee_nlp.nlp.provider.spacy.load", return_value=mock_model
    ) as mock_load:
        get_nlp()
    call_args = mock_load.call_args[0][0]
    assert call_args == "en_core_web_md"


def test_get_nlp_caches_model_across_calls():
    mock_model = MagicMock()
    with patch(
        "languee_nlp.nlp.provider.spacy.load", return_value=mock_model
    ) as mock_load:
        first = get_nlp()
        second = get_nlp()
    mock_load.assert_called_once()
    assert first is second


def test_get_nlp_accepts_model_name_override():
    mock_model = MagicMock()
    with patch(
        "languee_nlp.nlp.provider.spacy.load", return_value=mock_model
    ) as mock_load:
        get_nlp(model_name="en_core_web_sm")
    mock_load.assert_called_once_with("en_core_web_sm")


def test_get_nlp_uses_spanish_model_name_for_es():
    mock_model = MagicMock()
    with patch(
        "languee_nlp.nlp.provider.spacy.load", return_value=mock_model
    ) as mock_load:
        get_nlp("es")
    mock_load.assert_called_once_with("es_core_news_md")


def test_get_nlp_caches_en_and_es_independently():
    en_model = MagicMock()
    es_model = MagicMock()
    with patch(
        "languee_nlp.nlp.provider.spacy.load", side_effect=[en_model, es_model]
    ) as mock_load:
        first_en = get_nlp("en")
        first_es = get_nlp("es")
        second_en = get_nlp("en")
        second_es = get_nlp("es")
    assert mock_load.call_count == 2
    assert first_en is second_en is en_model
    assert first_es is second_es is es_model


def test_get_nlp_rejects_unsupported_language():
    with pytest.raises(ValueError):
        get_nlp("fr")
