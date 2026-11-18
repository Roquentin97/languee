import { PartOfSpeech } from '../../../lexicon/types/part-of-speech.enum';
import type { LookupEntryOutput } from '../../../lexicon/enrichment/dictionary/types/lookup-entry.types';
import type { InflectionForms } from '../../../lexicon/types/inflection-forms.types';
import type { CaptureRange } from '../../capture/capture-ranges';

export type LookupVocabularyKind =
  'word' | 'phrasal_verb' | 'expression' | 'idiom';

export type LookupVocabularyInput = {
  text: string;
  language: string;
  userId: string;
  context?: string;
  selectionRanges?: CaptureRange[];
  disablePosFiltering?: boolean;
  includeSuggestions?: boolean;
};

export type LookupAlternative = {
  type: 'expression' | 'base_verb';
  text: string;
  lemma: string;
  entryId: string | null;
  selectionRanges: CaptureRange[];
  reason: 'context_match' | 'expression_not_found' | 'verb_alternative';
  prominence: 'normal' | 'subtle';
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
  alternatives: LookupAlternative[];
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
