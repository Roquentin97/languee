# spaCy Rules

## Stack

- NLP: spaCy

## Conventions

- The spaCy model name must be configured through environment or service settings, not
  hardcoded in route handlers.
- Load the model once per application process where practical.
- spaCy model loading belongs behind a small service/provider abstraction, not directly
  in route handlers.
- Health and readiness endpoints must not require heavy NLP work unless the spec
  explicitly asks for it.
- If a feature needs a specific language model, the spec must name it.
- For spaCy features, Architect must treat unspecified model name, language, endpoint
  contract, text limits, error mapping, timeout behavior, and model loading behavior as
  blocking ambiguities.
