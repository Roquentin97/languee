"""Pure string-based German inflection helpers.

spaCy's German pipeline provides lemma/POS/morph but no conjugation or
declension tables. These functions generate regular (weak) German verb forms
from a lemma using rule-based suffix substitution. They take only primitive
inputs (strings/dicts) so they are testable without loading any spaCy model.

Deliberate omissions (kept conservative because every generated value feeds
downstream answer-checking and masking, so wrong guesses are worse than
absent forms):

- No noun plurals: German plural formation (-e/-er/-en/-s plus umlaut) is
  not reliably predictable from the singular surface form, so nouns expose
  only the singular lemma.
- No adjective declension: German adjective endings depend on gender, case,
  and the preceding article (strong/weak/mixed declension), which cannot be
  derived from the lemma alone.
"""


def conjugate_weak_verb(lemma: str) -> dict[str, str] | None:
    """Conjugate a weak (regular) German infinitive ending in -en, -eln, or
    -ern into present tense forms and the Partizip II. Returns None if
    `lemma` is not a recognized infinitive ending.

    Applies the e-insertion rule for stems ending in -t or -d
    (arbeiten -> arbeitest / arbeitet / gearbeitet).

    Approximation: the Partizip II always uses the ge- prefix, which is
    wrong for inseparable-prefix verbs (besuchen -> besucht, not
    *gebesucht); callers should treat these forms as regular-pattern
    guesses only.
    """
    if lemma.endswith("eln"):
        # sammeln: stem "sammel"; ich-form drops the stem e -> "sammle"
        stem = lemma[:-1]
        return {
            "present_ich": lemma[:-3] + "le",
            "present_du": stem + "st",
            "present_er": stem + "t",
            "present_wir": lemma,
            "present_ihr": stem + "t",
            "present_sie": lemma,
            "partizip_ii": "ge" + stem + "t",
        }
    if lemma.endswith("ern"):
        # wandern: stem "wander"; ich-form keeps the e -> "wandere"
        stem = lemma[:-1]
        return {
            "present_ich": stem + "e",
            "present_du": stem + "st",
            "present_er": stem + "t",
            "present_wir": lemma,
            "present_ihr": stem + "t",
            "present_sie": lemma,
            "partizip_ii": "ge" + stem + "t",
        }
    if lemma.endswith("en"):
        stem = lemma[:-2]
        e_insert = "e" if stem.endswith(("t", "d")) else ""
        return {
            "present_ich": stem + "e",
            "present_du": stem + e_insert + "st",
            "present_er": stem + e_insert + "t",
            "present_wir": lemma,
            "present_ihr": stem + e_insert + "t",
            "present_sie": lemma,
            "partizip_ii": "ge" + stem + e_insert + "t",
        }
    return None


def build_german_extra_forms(
    lemma: str, pos: str, morph: dict[str, str]
) -> dict[str, str] | None:
    """Build the `extra_forms` payload for a German token based on its POS.

    Only real word forms are included. NOUN exposes just the singular lemma
    (no plural) and ADJ gets no declension table; see the module docstring
    for why those are omitted.
    """
    if pos == "VERB":
        return conjugate_weak_verb(lemma)
    if pos == "NOUN":
        return {"singular": lemma}
    return None


_PRESENT_PERSON_NUMBER_KEYS = {
    ("1", "Sing"): "present_ich",
    ("2", "Sing"): "present_du",
    ("3", "Sing"): "present_er",
    ("1", "Plur"): "present_wir",
    ("2", "Plur"): "present_ihr",
    ("3", "Plur"): "present_sie",
}


def is_irregular_de(token_text: str, lemma: str, morph: dict[str, str]) -> bool:
    """Conservatively detect German verb irregularity: only compares present
    tense observed forms against the regularly-generated weak form for the
    same person/number. Returns False whenever the comparison cannot be
    made (missing morph info or non-infinitive lemma) rather than guessing.
    """
    if morph.get("Tense") != "Pres":
        return False

    person = morph.get("Person")
    number = morph.get("Number")
    key = (person, number)
    if key not in _PRESENT_PERSON_NUMBER_KEYS:
        return False

    forms = conjugate_weak_verb(lemma)
    if forms is None:
        return False

    expected = forms[_PRESENT_PERSON_NUMBER_KEYS[key]]
    return token_text.lower() != expected.lower()
