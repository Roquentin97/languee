import type { RelationType } from '../../morphology/morphology-provider';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

export interface RawDefinitionEntry {
  partOfSpeech: PartOfSpeech;
  definition: string;
  example?: string;
}

/**
 * Pluggable adapter for any external dictionary API.
 * Structured providers expose per-sense references through fetchEntry.
 * Semantic-only providers may implement fetch alone.
 * Throws ProviderUnavailableError when the provider cannot be reached or returns an error.
 */
export interface IDictionaryApiAdapter {
  readonly providerName: string;
  fetchEntry?(lemma: string, language: string): Promise<DictionaryEntry>;
  fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]>;

  /**
   * Optional pronunciation lookup. Returns the word's IPA transcription or
   * null when the provider has none. Callers treat IPA as best-effort
   * enrichment: adapters without pronunciation data simply omit the method.
   * Throws ProviderUnavailableError on provider failure, like fetch.
   */
  fetchIpa?(lemma: string, language: string): Promise<string | null>;
}

export type DictionaryEntry = {
  definitions: RawDefinitionEntry[];
  references: DictionaryReference[];
};

export type DictionaryReference = {
  category:
    | 'morphological_reference'
    | 'alternative_spelling'
    | 'other_reference'
    | 'unresolved';
  source: string;
  sourcePos: PartOfSpeech | null;
  targets: string[];
  targetPos: PartOfSpeech | null;
  relationTypes: RelationType[];
  text: string;
};
