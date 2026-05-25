import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';

export type NlpTokenMorphology = {
  tense: string | null;
  verb_form: string | null;
  number: string | null;
  degree: string | null;
};

export type NlpTokenForms = {
  verb_base: string | null;
  verb_past: string | null;
  verb_present_3sg: string | null;
  verb_present_non_3sg: string | null;
  verb_gerund_participle: string | null;
  verb_past_participle: string | null;
  noun_singular: string | null;
  noun_plural: string | null;
  adj_positive: string | null;
  adj_comparative: string | null;
  adj_superlative: string | null;
};

export type NlpToken = {
  text: string;
  lemma: string;
  pos: string;
  is_irregular: boolean;
  morphology: NlpTokenMorphology;
  forms: NlpTokenForms;
};

export type NlpWordResponse = {
  input_text: string;
  is_multi_word: boolean;
  tokens: NlpToken[];
};

export type NlpAnalysis = {
  lemma: string;
  pos: PartOfSpeech | null;
  isIrregular: boolean;
  inflectionForms: Record<string, string>;
};
