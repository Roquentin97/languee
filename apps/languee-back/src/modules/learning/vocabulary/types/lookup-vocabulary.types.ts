import { PartOfSpeech } from '../../../lexicon/types/part-of-speech.enum';
import type { LookupEntryOutput } from '../../../lexicon/enrichment/dictionary/types/lookup-entry.types';
import type { InflectionForms } from '../../../lexicon/types/inflection-forms.types';

export type LookupVocabularyKind =
  'word' | 'phrasal_verb' | 'expression' | 'idiom';

export type LookupVocabularyInput = {
  text: string;
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

export type LookupVocabularyOutput = Omit<LookupEntryOutput, 'headwords'> & {
  context?: string;
  orderedGroups?: { entryId: string; partOfSpeech: PartOfSpeech }[];
  lookupId?: string;
  headwords: (Omit<LookupEntryOutput['headwords'][number], 'partsOfSpeech'> & {
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
