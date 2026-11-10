import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';

export const MORPHOLOGY_PROVIDER = Symbol('MORPHOLOGY_PROVIDER');
export const INFLECTION_TYPES = [
  'plural',
  'singular',
  'past',
  'past_participle',
  'present_3sg',
  'present_non_3sg',
  'present_participle',
  'gerund',
  'comparative',
  'superlative',
] as const;
export type InflectionType = (typeof INFLECTION_TYPES)[number];
export type RelationType = InflectionType | 'alternative_spelling';
export type LemmaCandidate = { lemma: string; partOfSpeech: PartOfSpeech };
export type InflectionForm = { form: string; formType: InflectionType };
export type InflectionResult = LemmaCandidate & { forms: InflectionForm[] };
export interface MorphologyProvider {
  findLemmaCandidates(
    surface: string,
    language: string,
  ): Promise<LemmaCandidate[]>;
  getInflections(
    lemma: string,
    partOfSpeech: PartOfSpeech,
    language: string,
  ): Promise<InflectionForm[]>;
  getInflectionsBatch?(
    entries: LemmaCandidate[],
    language: string,
  ): Promise<InflectionResult[]>;
}
export const normalizeSpelling = (text: string): string =>
  text.trim().toLowerCase().normalize('NFC');
