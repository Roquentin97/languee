from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)
AUTH = ("admin", "changeme")


def _token(
    text: str,
    lemma: str,
    pos: str,
    index: int,
    start: int,
    dep: str,
) -> MagicMock:
    token = MagicMock()
    token.text = text
    token.lemma_ = lemma
    token.pos_ = pos
    token.i = index
    token.idx = start
    token.dep_ = dep
    token.head = token
    token.children = []
    return token


def _doc(tokens: list[MagicMock]) -> MagicMock:
    doc = MagicMock()
    doc.__len__.return_value = len(tokens)
    doc.__iter__.side_effect = lambda: iter(tokens)
    doc.__getitem__.side_effect = lambda index: tokens[index]
    return doc


def test_contextual_verb_head_controls_expression_canonicalization():
    isolated_head = _token("saw", "saw", "NOUN", 0, 0, "ROOT")
    isolated_particle = _token("off", "off", "ADV", 1, 4, "advmod")
    isolated_particle.head = isolated_head
    isolated_head.children = [isolated_particle]
    isolated = _doc([isolated_head, isolated_particle])

    context_subject = _token("I", "I", "PRON", 0, 0, "nsubj")
    context_head = _token("saw", "see", "VERB", 1, 2, "ROOT")
    context_particle = _token("off", "off", "PART", 2, 6, "prt")
    context_particle.head = context_head
    context_head.children = [context_particle]
    context_subject.head = context_head
    context = _doc([context_subject, context_head, context_particle])

    nlp = MagicMock(side_effect=lambda text: isolated if text == "saw off" else context)
    nlp.meta = {"lang": "en", "name": "test_model", "version": "1.0"}
    request = {
        "text": "saw off",
        "input_text": "I saw off",
        "selection_ranges": [
            {"start": 2, "end": 5},
            {"start": 6, "end": 9},
        ],
    }

    with patch("languee_nlp.routers.analyze.get_nlp", return_value=nlp):
        response = client.post("/analyze", json=request, auth=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "phrasal_verb"
    assert body["head_lemma"] == "see"
    assert body["canonical"] == "see off"
    assert body["selection_analysis"] == {
        "head_lemma": "see",
        "pos": "VERB",
        "head_range": {"start": 2, "end": 5},
    }
    assert body["model_version"] == "en_test_model@1.0"
