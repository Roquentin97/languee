from languee_nlp.nlp.german_inflections import (
    build_german_extra_forms,
    conjugate_weak_verb,
    is_irregular_de,
)

# ---------------------------------------------------------------------------
# conjugate_weak_verb
# ---------------------------------------------------------------------------


def test_conjugate_weak_verb_en_verb_machen():
    assert conjugate_weak_verb("machen") == {
        "present_ich": "mache",
        "present_du": "machst",
        "present_er": "macht",
        "present_wir": "machen",
        "present_ihr": "macht",
        "present_sie": "machen",
        "partizip_ii": "gemacht",
    }


def test_conjugate_weak_verb_t_stem_e_insertion_arbeiten():
    assert conjugate_weak_verb("arbeiten") == {
        "present_ich": "arbeite",
        "present_du": "arbeitest",
        "present_er": "arbeitet",
        "present_wir": "arbeiten",
        "present_ihr": "arbeitet",
        "present_sie": "arbeiten",
        "partizip_ii": "gearbeitet",
    }


def test_conjugate_weak_verb_d_stem_e_insertion_reden():
    assert conjugate_weak_verb("reden") == {
        "present_ich": "rede",
        "present_du": "redest",
        "present_er": "redet",
        "present_wir": "reden",
        "present_ihr": "redet",
        "present_sie": "reden",
        "partizip_ii": "geredet",
    }


def test_conjugate_weak_verb_eln_verb_sammeln():
    assert conjugate_weak_verb("sammeln") == {
        "present_ich": "sammle",
        "present_du": "sammelst",
        "present_er": "sammelt",
        "present_wir": "sammeln",
        "present_ihr": "sammelt",
        "present_sie": "sammeln",
        "partizip_ii": "gesammelt",
    }


def test_conjugate_weak_verb_ern_verb_wandern():
    assert conjugate_weak_verb("wandern") == {
        "present_ich": "wandere",
        "present_du": "wanderst",
        "present_er": "wandert",
        "present_wir": "wandern",
        "present_ihr": "wandert",
        "present_sie": "wandern",
        "partizip_ii": "gewandert",
    }


def test_conjugate_weak_verb_non_infinitive_returns_none():
    assert conjugate_weak_verb("Haus") is None
    assert conjugate_weak_verb("schnell") is None


# ---------------------------------------------------------------------------
# build_german_extra_forms
# ---------------------------------------------------------------------------


def test_build_german_extra_forms_verb_delegates_to_conjugate_weak_verb():
    result = build_german_extra_forms("machen", "VERB", {})
    assert result == conjugate_weak_verb("machen")


def test_build_german_extra_forms_noun_returns_singular_only():
    result = build_german_extra_forms("Haus", "NOUN", {})
    assert result == {"singular": "Haus"}


def test_build_german_extra_forms_adj_returns_none():
    assert build_german_extra_forms("schnell", "ADJ", {}) is None


def test_build_german_extra_forms_other_pos_returns_none():
    assert build_german_extra_forms("auf", "ADP", {}) is None


# ---------------------------------------------------------------------------
# is_irregular_de
# ---------------------------------------------------------------------------


def test_is_irregular_de_sprichst_is_irregular():
    morph = {"Tense": "Pres", "Person": "2", "Number": "Sing"}
    assert is_irregular_de("sprichst", "sprechen", morph) is True


def test_is_irregular_de_mache_is_regular():
    morph = {"Tense": "Pres", "Person": "1", "Number": "Sing"}
    assert is_irregular_de("mache", "machen", morph) is False


def test_is_irregular_de_missing_morph_returns_false():
    assert is_irregular_de("sprichst", "sprechen", {}) is False


def test_is_irregular_de_non_present_tense_returns_false():
    morph = {"Tense": "Past", "Person": "1", "Number": "Sing"}
    assert is_irregular_de("sprach", "sprechen", morph) is False


def test_is_irregular_de_non_infinitive_lemma_returns_false():
    morph = {"Tense": "Pres", "Person": "1", "Number": "Sing"}
    assert is_irregular_de("bin", "sein", morph) is False
