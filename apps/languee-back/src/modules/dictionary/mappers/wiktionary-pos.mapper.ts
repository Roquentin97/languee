import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

const WIKTIONARY_POS_MAP: Record<string, PartOfSpeech> = {
  verb: PartOfSpeech.VERB,
  noun: PartOfSpeech.NOUN,
  adjective: PartOfSpeech.ADJECTIVE,
  adverb: PartOfSpeech.ADVERB,
  pronoun: PartOfSpeech.PRONOUN,
  preposition: PartOfSpeech.PREPOSITION,
  conjunction: PartOfSpeech.CONJUNCTION,
  interjection: PartOfSpeech.INTERJECTION,
  phrase: PartOfSpeech.PHRASE,
  proverb: PartOfSpeech.PHRASE,
  idiom: PartOfSpeech.PHRASE,
  'prepositional phrase': PartOfSpeech.PHRASE,
  'phrasal verb': PartOfSpeech.PHRASE,
};

/**
 * Maps a Wiktionary REST API partOfSpeech string (e.g. "Verb", "Phrasal verb")
 * to a canonical PartOfSpeech. Case-insensitive. Returns null for unrecognised values.
 */
export function mapWiktionaryPos(raw: string): PartOfSpeech | null {
  return WIKTIONARY_POS_MAP[raw.toLowerCase()] ?? null;
}
