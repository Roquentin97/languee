import { mapWiktionaryPos } from './wiktionary-pos.mapper';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

describe('mapWiktionaryPos', () => {
  describe('known Wiktionary POS values', () => {
    it.each([
      ['Verb', PartOfSpeech.VERB],
      ['Noun', PartOfSpeech.NOUN],
      ['Adjective', PartOfSpeech.ADJECTIVE],
      ['Adverb', PartOfSpeech.ADVERB],
      ['Pronoun', PartOfSpeech.PRONOUN],
      ['Preposition', PartOfSpeech.PREPOSITION],
      ['Conjunction', PartOfSpeech.CONJUNCTION],
      ['Interjection', PartOfSpeech.INTERJECTION],
    ])('maps "%s" to %s', (raw, expected) => {
      expect(mapWiktionaryPos(raw)).toBe(expected);
    });
  });

  describe('phrase-like POS values', () => {
    it.each([
      ['Phrase', PartOfSpeech.PHRASE],
      ['Proverb', PartOfSpeech.PHRASE],
      ['Idiom', PartOfSpeech.PHRASE],
      ['Prepositional phrase', PartOfSpeech.PHRASE],
      ['Phrasal verb', PartOfSpeech.PHRASE],
    ])('maps "%s" to PartOfSpeech.PHRASE', (raw) => {
      expect(mapWiktionaryPos(raw)).toBe(PartOfSpeech.PHRASE);
    });
  });

  describe('case insensitivity', () => {
    it('maps "verb" (lowercase) to PartOfSpeech.VERB', () => {
      expect(mapWiktionaryPos('verb')).toBe(PartOfSpeech.VERB);
    });

    it('maps "VERB" (uppercase) to PartOfSpeech.VERB', () => {
      expect(mapWiktionaryPos('VERB')).toBe(PartOfSpeech.VERB);
    });

    it('maps "PrEpOsItIoNaL pHrAsE" (mixed case) to PartOfSpeech.PHRASE', () => {
      expect(mapWiktionaryPos('PrEpOsItIoNaL pHrAsE')).toBe(
        PartOfSpeech.PHRASE,
      );
    });
  });

  describe('unrecognised POS values', () => {
    it('returns null for "Proper noun"', () => {
      expect(mapWiktionaryPos('Proper noun')).toBeNull();
    });

    it('returns null for "Numeral"', () => {
      expect(mapWiktionaryPos('Numeral')).toBeNull();
    });

    it('returns null for "Determiner"', () => {
      expect(mapWiktionaryPos('Determiner')).toBeNull();
    });

    it('returns null for an entirely unknown POS string', () => {
      expect(mapWiktionaryPos('unknownPosString')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(mapWiktionaryPos('')).toBeNull();
    });
  });

  describe('enum value integrity', () => {
    it('every non-null output is a valid PartOfSpeech enum value', () => {
      const validValues = Object.values(PartOfSpeech);
      const knownRawValues = [
        'Verb',
        'Noun',
        'Adjective',
        'Adverb',
        'Pronoun',
        'Preposition',
        'Conjunction',
        'Interjection',
        'Phrase',
        'Proverb',
        'Idiom',
      ];
      for (const raw of knownRawValues) {
        const result = mapWiktionaryPos(raw);
        expect(result).not.toBeNull();
        expect(validValues).toContain(result);
      }
    });
  });
});
