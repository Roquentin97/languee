import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from languee_nlp.main import app
from languee_nlp.nlp.morphology import TAGS, find_candidates, get_inflections

CORPUS = json.loads((Path(__file__).parent / "fixtures/morphology.json").read_text())
UPOS = {
    "noun": "NOUN",
    "verb": "VERB",
    "adjective": "ADJ",
    "adverb": "ADV",
    "auxiliary": "AUX",
}


@pytest.mark.parametrize(
    "case", CORPUS["lemminflect_candidate_cases"], ids=lambda c: c["id"]
)
def test_candidates_contract(case):
    observed = case["observed_lemminflect_candidates_by_pos"]
    with patch(
        "languee_nlp.nlp.morphology.getAllLemmas",
        return_value={UPOS[p]: tuple(v) for p, v in observed.items()},
    ) as provider:
        result = find_candidates(case["surface"].upper())
    assert {(r.lemma, r.partOfSpeech) for r in result} == {
        (lemma, "verb" if p == "auxiliary" else p)
        for p, values in observed.items()
        for lemma in values
    }
    provider.assert_called_once_with(case["surface"])


@pytest.mark.parametrize(
    "case", CORPUS["lemminflect_paradigm_cases"], ids=lambda c: c["id"]
)
def test_all_spellings_and_only_supported_tags(case):
    pos = case["part_of_speech"]
    observed = case["observed_lemminflect_tags"]
    with patch(
        "languee_nlp.nlp.morphology.getAllInflections", return_value=observed
    ) as provider:
        result = get_inflections(case["lemma"], pos)
    assert {(r.form, r.formType) for r in result} == {
        (form, relation)
        for tag, spellings in observed.items()
        for relation in TAGS[pos].get(tag, ())
        for form in spellings
    }
    provider.assert_called_once_with(case["lemma"], upos=UPOS[pos])


def test_no_spacy_pass_and_no_periphrastic_forms():
    with patch(
        "languee_nlp.nlp.morphology.getAllInflections",
        return_value={"VBN": ("written", "has written")},
    ):
        assert [(x.form, x.formType) for x in get_inflections("write", "verb")] == [
            ("written", "past_participle")
        ]


def test_authenticated_endpoint_validation():
    client = TestClient(app)
    assert (
        client.get("/morphology/lemmas", params={"text": "better"}).status_code == 401
    )
    with patch("languee_nlp.routers.morphology.find_candidates", return_value=[]):
        assert (
            client.get(
                "/morphology/lemmas",
                params={"text": "better"},
                auth=("admin", "changeme"),
            ).json()
            == []
        )
        assert (
            client.get(
                "/morphology/lemmas",
                params={"text": "better", "language": "fr"},
                auth=("admin", "changeme"),
            ).status_code
            == 400
        )
        assert (
            client.get(
                "/morphology/lemmas",
                params={"text": "two words"},
                auth=("admin", "changeme"),
            ).status_code
            == 400
        )


def test_batch_contract_and_validation():
    client = TestClient(app)
    url = "/morphology/inflections/batch"
    entries = [
        {"lemma": " GO ", "partOfSpeech": "verb"},
        {"lemma": "well", "partOfSpeech": "adverb"},
        {"lemma": "go", "partOfSpeech": "verb"},
    ]
    payload = {"language": "en", "entries": entries}
    assert client.post(url, json=payload).status_code == 401
    with patch(
        "languee_nlp.routers.morphology.get_inflections", return_value=[]
    ) as get:
        response = client.post(url, json=payload, auth=("admin", "changeme"))
    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {"lemma": "go", "partOfSpeech": "verb", "forms": []},
            {"lemma": "well", "partOfSpeech": "adverb", "forms": []},
        ]
    }
    assert get.call_count == 2
    for invalid in (
        {"language": "en", "entries": []},
        {"language": "fr", "entries": entries},
        {"language": "en", "entries": [{"lemma": "two words", "partOfSpeech": "verb"}]},
        {"language": "en", "entries": [{"lemma": "go", "partOfSpeech": "invalid"}]},
        {
            "language": "en",
            "entries": [{"lemma": str(i), "partOfSpeech": "noun"} for i in range(101)],
        },
    ):
        assert client.post(
            url, json=invalid, auth=("admin", "changeme")
        ).status_code in (400, 422)


@pytest.mark.parametrize(
    "case", CORPUS["lemminflect_candidate_cases"], ids=lambda c: c["id"]
)
def test_installed_dictionary_lemma_candidates(case):
    result = find_candidates(case["surface"])
    assert {(r.lemma, r.partOfSpeech) for r in result} == {
        (lemma, "verb" if pos == "auxiliary" else pos)
        for pos, lemmas in case["observed_lemminflect_candidates_by_pos"].items()
        for lemma in lemmas
    }


@pytest.mark.parametrize(
    "case", CORPUS["lemminflect_paradigm_cases"], ids=lambda c: c["id"]
)
def test_installed_resource_preserves_observed_paradigm(case):
    pos = case["part_of_speech"]
    result = get_inflections(case["lemma"], pos)
    assert {(r.form, r.formType) for r in result} == {
        (form, relation)
        for tag, spellings in case["observed_lemminflect_tags"].items()
        for relation in TAGS[pos].get(tag, ())
        for form in spellings
    }


def test_batch_limit_counts_normalized_distinct_pairs():
    client = TestClient(app)
    entries = [{"lemma": str(i), "partOfSpeech": "noun"} for i in range(100)]
    entries.append(entries[0])
    with patch(
        "languee_nlp.routers.morphology.get_inflections", return_value=[]
    ) as get:
        response = client.post(
            "/morphology/inflections/batch",
            json={"language": "en", "entries": entries},
            auth=("admin", "changeme"),
        )
    assert response.status_code == 200
    assert len(response.json()["results"]) == 100
    assert get.call_count == 100
