export interface RawDefinitionEntry {
  partOfSpeech: string;
  definition: string;
  example?: string;
}

/**
 * Pluggable adapter for any external dictionary API.
 * Implementations must normalize responses into RawDefinitionEntry[].
 * Throws ProviderUnavailableError when the provider cannot be reached or returns an error.
 */
export interface IDefinitionApiAdapter {
  readonly providerName: string;
  fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]>;
}
