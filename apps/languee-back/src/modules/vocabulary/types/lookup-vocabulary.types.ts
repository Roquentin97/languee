import { PartOfSpeech } from '../enums/part-of-speech.enum';
import type { InflectionForms } from '../../dictionary/types/inflection-forms.types';

export type LookupVocabularyKind = 'word' | 'phrasal_verb' | 'expression';

export type LookupVocabularyInput = {
  word: string;
  language: string;
  userId: string;
  context?: string;
  disablePosFiltering?: boolean;
};

export type DeckRef = {
  id: string;
  name: string;
};

export type EnrichedDefinitionResult = {
  id: string;
  partOfSpeech: PartOfSpeech;
  definition: string;
  example: string | null;
  provider: string;
  hasIrregularForms: boolean;
  inflectionForms: InflectionForms | null;
  decks: DeckRef[];
};

export type LookupVocabularyOutput = {
  input: string;
  context?: string;
  lemma: string;
  language: string;
  kind: LookupVocabularyKind;
  partOfSpeech: PartOfSpeech | null;
  definitions: EnrichedDefinitionResult[];
  meta: {
    filteredByPos: boolean;
    unmatchedPos: boolean;
    availablePartsOfSpeech: PartOfSpeech[];
    isExpression: boolean;
    providerMiss: boolean;
    expressionContextFound: boolean | null;
  };
};
