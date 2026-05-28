import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';

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
  tokens: NlpToken[];
} & Record<'input_text', string> &
  Record<'is_multi_word', boolean>;

export type NlpAnalysis = {
  lemma: string;
  pos: PartOfSpeech | null;
  isIrregular: boolean;
  inflectionForms: Record<string, string>;
};
