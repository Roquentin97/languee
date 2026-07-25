import spacy

from languee_nlp.settings import settings

_SUPPORTED_LANGUAGES = {"en"}

_nlp: dict[str, spacy.Language] = {}


def _default_model_name(language: str) -> str:
    if language == "en":
        return settings.spacy_model
    raise ValueError(f"Unsupported language: {language}")


def get_nlp(language: str = "en", model_name: str | None = None) -> spacy.Language:
    if language not in _SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")

    if language not in _nlp:
        name = model_name if model_name is not None else _default_model_name(language)
        _nlp[language] = spacy.load(name)
    return _nlp[language]
