import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';
import type { InflectionForms } from '../types/inflection-forms.types';

export interface RawDefinitionEntry {
  partOfSpeech: PartOfSpeech;
  definition: string;
  example?: string;
  hasIrregularForms?: boolean;
  inflectionForms?: InflectionForms | null;
}

/**
 * Pluggable adapter for any external dictionary API.
 * Implementations must normalize responses into RawDefinitionEntry[].
 * Throws ProviderUnavailableError when the provider cannot be reached or returns an error.
 */
export interface IDictionaryApiAdapter {
  readonly providerName: string;
  fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]>;

  /**
   * Optional pronunciation lookup. Returns the word's IPA transcription or
   * null when the provider has none. Callers treat IPA as best-effort
   * enrichment: adapters without pronunciation data simply omit the method.
   * Throws ProviderUnavailableError on provider failure, like fetch.
   */
  fetchIpa?(lemma: string, language: string): Promise<string | null>;
}
