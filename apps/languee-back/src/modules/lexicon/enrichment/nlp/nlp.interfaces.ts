import { PartOfSpeech } from '../../types/part-of-speech.enum';
import type { InflectionForms } from '../../types/inflection-forms.types';
import type { CaptureRange } from '../../../learning/capture/capture-ranges';

type NlpTokenMorphologyKey = 'verb_form';

type NlpTokenFormKey =
  | 'verb_base'
  | 'verb_past'
  | 'verb_present_3sg'
  | 'verb_present_non_3sg'
  | 'verb_gerund_participle'
  | 'verb_past_participle'
  | 'noun_singular'
  | 'noun_plural'
  | 'adj_positive'
  | 'adj_comparative'
  | 'adj_superlative';

export type NlpTokenMorphology = {
  tense: string | null;
  number: string | null;
  degree: string | null;
} & Record<NlpTokenMorphologyKey, string | null>;

export type NlpTokenForms = Record<NlpTokenFormKey, string | null>;

export type NlpToken = {
  text: string;
  lemma: string;
  pos: string;
  morphology: NlpTokenMorphology;
  forms: NlpTokenForms;
} & Record<'is_irregular', boolean>;

export type NlpWordResponse = {
  kind: 'word';
  tokens: NlpToken[];
} & Record<'model_version', string> &
  Record<'input_text', string> &
  Record<'selection_analysis', NlpSelectionAnalysisResponse | null> &
  Record<'is_multi_word', boolean> &
  Partial<Record<'language', string>>;

export type NlpAnalysis = {
  lemma: string;
  pos: PartOfSpeech | null;
  rawPos?: string;
  modelVersion?: string;
  isIrregular: boolean;
  inflectionForms: InflectionForms | null;
  selectionAnalysis?: NlpSelectionAnalysis | null;
};

export type NlpSelectionAnalysisResponse = Record<'head_lemma', string> &
  Record<'pos', string> &
  Record<'head_range', CaptureRange>;

export type NlpSelectionAnalysis = {
  headLemma: string;
  pos: string;
  headRange: CaptureRange;
};

export type NlpWordAnalysis = { kind: 'word' } & NlpAnalysis;

export type NlpExpressionKind = 'phrasal_verb' | 'expression';

export type NlpExpressionToken = {
  text: string;
  lemma: string;
  pos: string;
};

export type NlpExpressionContextMatch = {
  found: boolean;
  start: number;
  end: number;
  confidence: 'high' | 'low' | null;
} & Record<'matched_text', string | null>;

export type NlpExpressionResponse = {
  canonical: string;
  kind: NlpExpressionKind;
  tokens: NlpExpressionToken[];
} & Record<'input_text', string> &
  Record<'head_lemma', string> &
  Record<'selection_analysis', NlpSelectionAnalysisResponse | null> &
  Record<'model_version', string> &
  Partial<Record<'context_match', NlpExpressionContextMatch>> &
  Partial<Record<'language', string>>;

export type NlpExpressionAnalysis = {
  canonical: string;
  kind: NlpExpressionKind;
  headLemma: string;
  modelVersion?: string;
  contextMatch: {
    found: boolean;
    matchedText: string | null;
    confidence: 'high' | 'low' | null;
  } | null;
  selectionAnalysis?: NlpSelectionAnalysis | null;
};

export type NlpExpressionCandidate = Record<'entry_id', string> &
  Record<'canonical_text', string>;

export type NlpExpressionMatch = Record<'entry_id', string> &
  Record<'canonical_text', string> &
  Record<'surface_text', string> &
  Record<'component_ranges', CaptureRange[]>;

export type NlpExpressionMatchInput = {
  language: string;
} & Record<'input_text', string> &
  Record<'selected_verb_range', CaptureRange> &
  Record<'candidates', NlpExpressionCandidate[]>;

export type NlpExpressionMatchResponse = { matches: NlpExpressionMatch[] };

export type NlpAnalyzeResponse = NlpWordResponse | NlpExpressionResponse;

export type NlpAnalyzeResult = NlpWordAnalysis | NlpExpressionAnalysis;
