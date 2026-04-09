export class DefinitionProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DefinitionProviderError";
  }
}

export class ProviderUnavailableError extends DefinitionProviderError {
  constructor(provider: string, cause?: unknown) {
    super(`Provider "${provider}" is unavailable`, cause);
    this.name = "ProviderUnavailableError";
  }
}

export class DefinitionNotFoundError extends DefinitionProviderError {
  constructor(lemma: string, language: string) {
    super(`No definitions found for "${lemma}" in language "${language}"`);
    this.name = "DefinitionNotFoundError";
  }
}
