import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

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
} & Record<'is_irregular', boolean> &
  Partial<Record<'extra_forms', Record<string, string> | null>>;

export type NlpWordResponse = {
  kind: 'word';
  tokens: NlpToken[];
} & Record<'input_text', string> &
  Record<'is_multi_word', boolean> &
  Partial<Record<'language', string>>;

export type NlpAnalysis = {
  lemma: string;
  pos: PartOfSpeech | null;
  isIrregular: boolean;
  inflectionForms: InflectionForms | null;
  extraForms: Record<string, string> | null;
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
  Partial<Record<'context_match', NlpExpressionContextMatch>> &
  Partial<Record<'language', string>>;

export type NlpExpressionAnalysis = {
  canonical: string;
  kind: NlpExpressionKind;
  headLemma: string;
  contextMatch: {
    found: boolean;
    matchedText: string | null;
    confidence: 'high' | 'low' | null;
  } | null;
};

export type NlpAnalyzeResponse = NlpWordResponse | NlpExpressionResponse;

export type NlpAnalyzeResult = NlpWordAnalysis | NlpExpressionAnalysis;
