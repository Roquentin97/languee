import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

const DICTIONARY_API_POS_MAP: Record<string, PartOfSpeech> = {
  noun: PartOfSpeech.NOUN,
  verb: PartOfSpeech.VERB,
  adjective: PartOfSpeech.ADJECTIVE,
  adverb: PartOfSpeech.ADVERB,
  pronoun: PartOfSpeech.PRONOUN,
  preposition: PartOfSpeech.PREPOSITION,
  conjunction: PartOfSpeech.CONJUNCTION,
  interjection: PartOfSpeech.INTERJECTION,
  exclamation: PartOfSpeech.INTERJECTION,
};

export function mapDictionaryApiPos(raw: string): PartOfSpeech | null {
  return DICTIONARY_API_POS_MAP[raw] ?? null;
}
