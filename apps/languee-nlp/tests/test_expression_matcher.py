from unittest.mock import MagicMock, patch

import spacy
from fastapi.testclient import TestClient
from spacy.tokens import Doc

from languee_nlp.main import app
from languee_nlp.nlp.expression_matcher import match_expressions
from languee_nlp.schemas import MatchCandidate, SelectionRange

client = TestClient(app)
AUTH = ("admin", "changeme")


def _doc(
    words: list[str],
    heads: list[int],
    deps: list[str],
    pos: list[str],
    lemmas: list[str],
    sent_starts: list[bool] | None = None,
    spaces: list[bool] | None = None,
) -> Doc:
    if sent_starts is None:
        sent_starts = [index == 0 for index in range(len(words))]
    return Doc(
        spacy.blank("en").vocab,
        words=words,
        spaces=spaces,
        heads=heads,
        deps=deps,
        pos=pos,
        lemmas=lemmas,
        sent_starts=sent_starts,
    )


def _candidate(text: str, entry_id: str = "entry") -> MatchCandidate:
    return MatchCandidate(entry_id=entry_id, canonical_text=text)


def test_matches_inflected_head_with_a_separated_object():
    doc = _doc(
        ["She", "turned", "the", "lights", "off", "."],
        [1, 1, 3, 1, 1, 1],
        ["nsubj", "ROOT", "det", "dobj", "prt", "punct"],
        ["PRON", "VERB", "DET", "NOUN", "PART", "PUNCT"],
        ["she", "turn", "the", "light", "off", "."],
    )

    matches = match_expressions(
        doc,
        SelectionRange(start=4, end=10),
        [_candidate("turn off", "turn-off")],
    )

    assert [match.model_dump() for match in matches] == [
        {
            "entry_id": "turn-off",
            "canonical_text": "turn off",
            "surface_text": "turned off",
            "component_ranges": [
                {"start": 4, "end": 10},
                {"start": 22, "end": 25},
            ],
        }
    ]


def test_matches_nested_three_part_particle_and_preposition():
    doc = _doc(
        ["He", "put", "it", "up", "with", "them", "."],
        [1, 1, 1, 1, 3, 4, 1],
        ["nsubj", "ROOT", "dobj", "prt", "prep", "pobj", "punct"],
        ["PRON", "VERB", "PRON", "PART", "ADP", "PRON", "PUNCT"],
        ["he", "put", "it", "up", "with", "they", "."],
    )

    matches = match_expressions(
        doc,
        SelectionRange(start=3, end=6),
        [_candidate("put up with", "put-up-with")],
    )

    assert matches[0].surface_text == "put up with"
    assert [item.model_dump() for item in matches[0].component_ranges] == [
        {"start": 3, "end": 6},
        {"start": 10, "end": 12},
        {"start": 13, "end": 17},
    ]


def test_matches_only_inside_selected_verb_sentence():
    text = "They ran. Out came the sun."
    doc = _doc(
        ["They", "ran", ".", "Out", "came", "the", "sun", "."],
        [1, 1, 1, 4, 4, 6, 4, 4],
        ["nsubj", "ROOT", "punct", "advmod", "ROOT", "det", "nsubj", "punct"],
        ["PRON", "VERB", "PUNCT", "ADV", "VERB", "DET", "NOUN", "PUNCT"],
        ["they", "run", ".", "out", "come", "the", "sun", "."],
        sent_starts=[True, False, False, True, False, False, False, False],
    )

    matches = match_expressions(
        doc,
        SelectionRange(start=text.index("ran"), end=text.index("ran") + 3),
        [_candidate("run out")],
    )

    assert matches == []


def test_conservative_object_guard_rejects_preposition_after_direct_object():
    doc = _doc(
        ["They", "handed", "the", "reports", "in", "."],
        [1, 1, 3, 1, 1, 1],
        ["nsubj", "ROOT", "det", "dobj", "prep", "punct"],
        ["PRON", "VERB", "DET", "NOUN", "ADP", "PUNCT"],
        ["they", "hand", "the", "report", "in", "."],
    )

    matches = match_expressions(
        doc,
        SelectionRange(start=5, end=11),
        [_candidate("hand in")],
    )

    assert matches == []


def test_longer_candidate_ranks_first_and_wrong_head_is_ignored():
    doc = _doc(
        ["They", "ran", "out", "of", "gas", "."],
        [1, 1, 1, 2, 3, 1],
        ["nsubj", "ROOT", "prt", "prep", "pobj", "punct"],
        ["PRON", "VERB", "PART", "ADP", "NOUN", "PUNCT"],
        ["they", "run", "out", "of", "gas", "."],
    )

    matches = match_expressions(
        doc,
        SelectionRange(start=5, end=8),
        [
            _candidate("run out", "short"),
            _candidate("walk out", "wrong-head"),
            _candidate("run out of", "long"),
        ],
    )

    assert [match.entry_id for match in matches] == ["long", "short"]


def test_selected_verb_range_does_not_match_a_different_repeated_occurrence():
    text = "I saw. I saw off."
    doc = _doc(
        ["I", "saw", ".", "I", "saw", "off", "."],
        [1, 1, 1, 4, 4, 4, 4],
        ["nsubj", "ROOT", "punct", "nsubj", "ROOT", "prt", "punct"],
        ["PRON", "VERB", "PUNCT", "PRON", "VERB", "PART", "PUNCT"],
        ["i", "see", ".", "i", "see", "off", "."],
        sent_starts=[True, False, False, True, False, False, False],
        spaces=[True, False, True, True, True, False, False],
    )
    first = text.index("saw")
    second = text.rindex("saw")
    candidate = [_candidate("see off")]

    assert (
        match_expressions(
            doc,
            SelectionRange(start=first, end=first + 3),
            candidate,
        )
        == []
    )
    assert (
        match_expressions(
            doc,
            SelectionRange(start=second, end=second + 3),
            candidate,
        )[0].surface_text
        == "saw off"
    )


def test_match_expressions_http_contract_and_authentication():
    text = "She turned it off."
    doc = _doc(
        ["She", "turned", "it", "off", "."],
        [1, 1, 1, 1, 1],
        ["nsubj", "ROOT", "dobj", "prt", "punct"],
        ["PRON", "VERB", "PRON", "PART", "PUNCT"],
        ["she", "turn", "it", "off", "."],
    )
    nlp = MagicMock(return_value=doc)
    with patch("languee_nlp.routers.match_expressions.get_nlp", return_value=nlp):
        unauthorized = client.post(
            "/match-expressions",
            json={"language": "en", "input_text": text},
        )
        response = client.post(
            "/match-expressions",
            json={
                "language": "en",
                "input_text": text,
                "selected_verb_range": {"start": 4, "end": 10},
                "candidates": [{"entry_id": "turn-off", "canonical_text": "turn off"}],
            },
            auth=AUTH,
        )

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.json()["matches"][0]["component_ranges"] == [
        {"start": 4, "end": 10},
        {"start": 14, "end": 17},
    ]
    nlp.assert_called_once_with(text)


def test_match_expressions_rejects_unsupported_language():
    response = client.post(
        "/match-expressions",
        json={
            "language": "fr",
            "input_text": "Elle est partie.",
            "selected_verb_range": {"start": 5, "end": 9},
            "candidates": [],
        },
        auth=AUTH,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "LANGUAGE_NOT_SUPPORTED"
