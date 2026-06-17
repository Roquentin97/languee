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
}
