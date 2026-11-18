"""Tests for POST /analyze selection ranges and contextual word resolution."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from languee_nlp.main import app
from languee_nlp.routers.analyze import (
    _TOKEN_COUNT_DETAIL,
    _count_manual_words,
    _validate_selection_ranges,
)
from languee_nlp.schemas import SelectionRange

client = TestClient(app)
AUTH = ("admin", "changeme")


def _token(
    text: str,
    lemma: str,
    pos: str,
    idx: int,
    token_index: int,
    dep: str = "ROOT",
) -> MagicMock:
    token = MagicMock()
    token.text = text
    token.lemma_ = lemma
    token.pos_ = pos
    token.idx = idx
    token.i = token_index
    token.dep_ = dep
    token.morph.to_dict.return_value = {}
    token.children = []
    token.head = token
    return token


def _doc(tokens: list[MagicMock]) -> MagicMock:
    doc = MagicMock()
    doc.__len__.return_value = len(tokens)
    doc.__iter__.side_effect = lambda: iter(tokens)
    doc.__getitem__.side_effect = lambda index: tokens[index]
    return doc


def _nlp_for(docs: dict[str, MagicMock]) -> MagicMock:
    nlp = MagicMock(side_effect=lambda text: docs[text])
    nlp.meta = {"lang": "en", "name": "test_model", "version": "1.0"}
    return nlp


def _saw_context() -> tuple[MagicMock, MagicMock]:
    isolated = _doc([_token("saw", "saw", "NOUN", 0, 0)])
    context = _doc(
        [
            _token("I", "I", "PRON", 0, 0),
            _token("saw", "see", "VERB", 2, 1),
            _token("the", "the", "DET", 6, 2),
            _token("saw", "saw", "NOUN", 10, 3),
            _token(".", ".", "PUNCT", 13, 4),
        ]
    )
    return isolated, context


def test_analyze_requires_text_and_rejects_the_old_get_contract():
    missing = client.post("/analyze", json={"input_text": "I run"}, auth=AUTH)
    old_get = client.get("/analyze", params={"text": "run"}, auth=AUTH)

    assert missing.status_code == 422
    assert old_get.status_code == 405


def test_analyze_requires_basic_authentication():
    response = client.post("/analyze", json={"text": "run"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


def test_empty_text_keeps_the_existing_400_error():
    response = client.post("/analyze", json={"text": "   "}, auth=AUTH)

    assert response.status_code == 400
    assert response.json()["detail"] == _TOKEN_COUNT_DETAIL


def test_manual_analysis_enforces_the_six_selectable_word_limit():
    response = client.post(
        "/analyze",
        json={"text": "one two three four five six seven"},
        auth=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "SELECTION_LIMIT_EXCEEDED"


def test_manual_word_limit_counts_whitespace_components():
    assert _count_manual_words("don't") == 1
    assert _count_manual_words("state-of-the-art") == 1
    assert _count_manual_words("don t") == 2


def test_explicit_range_selects_the_requested_repeated_occurrence():
    isolated, context = _saw_context()
    nlp = _nlp_for({"saw": isolated, "I saw the saw.": context})
    payload = {
        "text": "saw",
        "input_text": "I saw the saw.",
        "selection_ranges": [{"start": 10, "end": 13}],
    }

    with (
        patch("languee_nlp.routers.analyze.get_nlp", return_value=nlp),
        patch("languee_nlp.nlp.word_service.getInflection", return_value=()),
    ):
        response = client.post("/analyze", json=payload, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["tokens"][0]["pos"] == "NOUN"
    assert body["selection_analysis"] is None
    assert body["input_text_analysis"]["matched_token_index"] == 3


def test_selected_verb_returns_lemma_pos_and_exact_head_range():
    isolated, context = _saw_context()
    nlp = _nlp_for({"saw": isolated, "I saw the saw.": context})
    payload = {
        "text": "saw",
        "input_text": "I saw the saw.",
        "selection_ranges": [{"start": 2, "end": 5}],
    }

    with (
        patch("languee_nlp.routers.analyze.get_nlp", return_value=nlp),
        patch("languee_nlp.nlp.word_service.getInflection", return_value=()),
    ):
        response = client.post("/analyze", json=payload, auth=AUTH)

    assert response.status_code == 200
    assert response.json()["selection_analysis"] == {
        "head_lemma": "see",
        "pos": "VERB",
        "head_range": {"start": 2, "end": 5},
    }


def test_invalid_explicit_range_does_not_fall_back_to_another_occurrence():
    response = client.post(
        "/analyze",
        json={
            "text": "saw",
            "input_text": "I saw the saw.",
            "selection_ranges": [{"start": 3, "end": 5}],
        },
        auth=AUTH,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "SELECTION_DOES_NOT_MATCH_INPUT"


def test_unicode_ranges_use_raw_code_points_before_nfc_comparison():
    context_text = "😀 CAFE\u0301!"
    isolated = _doc([_token("café", "café", "VERB", 0, 0)])
    context = _doc([_token("CAFE\u0301", "café", "VERB", 2, 0)])
    nlp = _nlp_for({"café": isolated, context_text: context})

    with (
        patch("languee_nlp.routers.analyze.get_nlp", return_value=nlp),
        patch("languee_nlp.nlp.word_service.getInflection", return_value=()),
    ):
        response = client.post(
            "/analyze",
            json={
                "text": "café",
                "input_text": context_text,
                "selection_ranges": [{"start": 2, "end": 7}],
            },
            auth=AUTH,
        )

    assert response.status_code == 200
    assert response.json()["selection_analysis"]["head_range"] == {
        "start": 2,
        "end": 7,
    }


def test_ranges_follow_android_letter_mark_tokens():
    _validate_selection_ranges(
        "don t",
        "don't",
        [
            SelectionRange(start=0, end=3),
            SelectionRange(start=4, end=5),
        ],
    )

    with pytest.raises(HTTPException) as exc:
        _validate_selection_ranges(
            "don't",
            "don't",
            [SelectionRange(start=0, end=5)],
        )
    assert exc.value.detail == "SELECTION_DOES_NOT_MATCH_INPUT"

    with pytest.raises(HTTPException):
        _validate_selection_ranges(
            "foo",
            "foo1bar",
            [SelectionRange(start=0, end=7)],
        )

    with pytest.raises(HTTPException):
        _validate_selection_ranges(
            "SS",
            "ß",
            [SelectionRange(start=0, end=1)],
        )


def test_context_without_ranges_remains_manual_and_has_no_selection_analysis():
    isolated = _doc([_token("run", "run", "VERB", 0, 0)])
    context = _doc([_token("run", "run", "VERB", 2, 1)])
    nlp = _nlp_for({"run": isolated, "I run": context})

    with (
        patch("languee_nlp.routers.analyze.get_nlp", return_value=nlp),
        patch("languee_nlp.nlp.word_service.getInflection", return_value=()),
    ):
        response = client.post(
            "/analyze",
            json={"text": "run", "input_text": "I run"},
            auth=AUTH,
        )

    assert response.status_code == 200
    assert response.json()["selection_analysis"] is None
    assert nlp.call_count == 2


def test_selection_range_schema_rejects_non_integer_offsets():
    response = client.post(
        "/analyze",
        json={
            "text": "run",
            "input_text": "I run",
            "selection_ranges": [{"start": 2.0, "end": 5}],
        },
        auth=AUTH,
    )

    assert response.status_code == 422
