from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from languee_nlp.main import app

client = TestClient(app)


def _make_mock_nlp(
    lemma: str = "run",
    part_of_speech: str = "VERB",
    is_out_of_vocabulary: bool = False,
    has_vector: bool = True,
    probability: float = -8.5,
) -> MagicMock:
    mock_token = MagicMock()
    mock_token.lemma_ = lemma
    mock_token.pos_ = part_of_speech
    mock_token.is_oov = is_out_of_vocabulary
    mock_token.has_vector = has_vector
    mock_token.prob = probability

    mock_doc = [mock_token]

    mock_nlp = MagicMock()
    mock_nlp.return_value = mock_doc
    return mock_nlp


def test_words_returns_analysis_for_single_word():
    mock_nlp = _make_mock_nlp(lemma="run")

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.get("/words", params={"word": "running"})

    assert response.status_code == 200
    assert response.json() == {
        "word": "running",
        "lemma": "run",
        "part_of_speech": "VERB",
        "is_out_of_vocabulary": False,
        "has_vector": True,
        "probability": -8.5,
    }
    mock_nlp.assert_called_once_with("running")


def test_words_trims_word_before_processing():
    mock_nlp = _make_mock_nlp(lemma="child")

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.get("/words", params={"word": " child "})

    assert response.status_code == 200
    assert response.json() == {
        "word": "child",
        "lemma": "child",
        "part_of_speech": "VERB",
        "is_out_of_vocabulary": False,
        "has_vector": True,
        "probability": -8.5,
    }
    mock_nlp.assert_called_once_with("child")


def test_words_returns_vocabulary_diagnostics():
    mock_nlp = _make_mock_nlp(
        lemma="sunnnynnn",
        part_of_speech="NOUN",
        is_out_of_vocabulary=True,
        has_vector=False,
        probability=-20.0,
    )

    with patch("languee_nlp.routers.words.get_nlp", return_value=mock_nlp):
        response = client.get("/words", params={"word": "sunnnynnn"})

    assert response.status_code == 200
    assert response.json() == {
        "word": "sunnnynnn",
        "lemma": "sunnnynnn",
        "part_of_speech": "NOUN",
        "is_out_of_vocabulary": True,
        "has_vector": False,
        "probability": -20.0,
    }


def test_words_rejects_multiple_words():
    response = client.get("/words", params={"word": "look up"})

    assert response.status_code == 422
