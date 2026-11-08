"""Context-independent, dictionary-backed English morphology."""

import unicodedata
from typing import Literal

from lemminflect import getAllInflections, getAllLemmas
from pydantic import BaseModel

Pos = Literal["noun", "verb", "adjective", "adverb"]
Relation = Literal[
    "plural",
    "past",
    "past_participle",
    "present_3sg",
    "present_non_3sg",
    "present_participle",
    "gerund",
    "comparative",
    "superlative",
]
POS: dict[str, Pos] = {
    "NOUN": "noun",
    "VERB": "verb",
    "AUX": "verb",
    "ADJ": "adjective",
    "ADV": "adverb",
}
UPOS = {"noun": "NOUN", "verb": "VERB", "adjective": "ADJ", "adverb": "ADV"}
TAGS: dict[str, dict[str, tuple[Relation, ...]]] = {
    "noun": {"NNS": ("plural",)},
    "verb": {
        "VBD": ("past",),
        "VBN": ("past_participle",),
        "VBZ": ("present_3sg",),
        "VBP": ("present_non_3sg",),
        "VBG": ("present_participle", "gerund"),
    },
    "adjective": {"JJR": ("comparative",), "JJS": ("superlative",)},
    "adverb": {"RBR": ("comparative",), "RBS": ("superlative",)},
}


class LemmaCandidate(BaseModel):
    lemma: str
    partOfSpeech: Pos


class InflectionForm(BaseModel):
    form: str
    formType: Relation


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text.strip().lower())


def find_candidates(surface: str) -> list[LemmaCandidate]:
    candidates = {
        (normalize(lemma), POS[pos])
        for pos, lemmas in getAllLemmas(normalize(surface)).items()
        if pos in POS
        for lemma in lemmas
    }
    return [
        LemmaCandidate(lemma=lemma, partOfSpeech=pos)
        for lemma, pos in sorted(candidates)
    ]


def get_inflections(lemma: str, pos: Pos) -> list[InflectionForm]:
    forms = {
        (normalize(form), relation)
        for tag, spellings in getAllInflections(
            normalize(lemma), upos=UPOS[pos]
        ).items()
        for relation in TAGS[pos].get(tag, ())
        for form in spellings
        if form.strip() and not any(c.isspace() for c in form.strip())
    }
    return [InflectionForm(form=f, formType=t) for f, t in sorted(forms)]
