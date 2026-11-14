import { PartOfSpeech } from '../../../lexicon/types/part-of-speech.enum';
import type { LookupWordOutput } from '../../../lexicon/enrichment/dictionary/types/lookup-word.types';
import type { InflectionForms } from '../../../lexicon/types/inflection-forms.types';

export type LookupVocabularyKind = 'word' | 'phrasal_verb' | 'expression';

export type LookupVocabularyInput = {
  word: string;
  language: string;
  userId: string;
  context?: string;
  selectionStart?: number;
  selectionEnd?: number;
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

export type LookupVocabularyOutput = Omit<LookupWordOutput, 'headwords'> & {
  context?: string;
  orderedGroups?: { wordId: string; partOfSpeech: PartOfSpeech }[];
  lookupId?: string;
  headwords: (Omit<LookupWordOutput['headwords'][number], 'partsOfSpeech'> & {
    partsOfSpeech: {
      partOfSpeech: PartOfSpeech;
      definitions: EnrichedDefinitionResult[];
    }[];
  })[];
  meta: {
    analyzedLemma: string;
    analyzedPos: PartOfSpeech | null;
    filteredByPos: boolean;
    unmatchedPos: boolean;
    availablePartsOfSpeech: PartOfSpeech[];
    isExpression: boolean;
    providerMiss: boolean;
    expressionContextFound: boolean | null;
  };
};
