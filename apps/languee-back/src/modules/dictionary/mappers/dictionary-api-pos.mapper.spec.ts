import { mapDictionaryApiPos } from './dictionary-api-pos.mapper';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

describe('mapDictionaryApiPos', () => {
  describe('known DictionaryAPI POS values', () => {
    it('maps "noun" to PartOfSpeech.NOUN', () => {
      expect(mapDictionaryApiPos('noun')).toBe(PartOfSpeech.NOUN);
    });

    it('maps "verb" to PartOfSpeech.VERB', () => {
      expect(mapDictionaryApiPos('verb')).toBe(PartOfSpeech.VERB);
    });

    it('maps "adjective" to PartOfSpeech.ADJECTIVE', () => {
      expect(mapDictionaryApiPos('adjective')).toBe(PartOfSpeech.ADJECTIVE);
    });

    it('maps "adverb" to PartOfSpeech.ADVERB', () => {
      expect(mapDictionaryApiPos('adverb')).toBe(PartOfSpeech.ADVERB);
    });

    it('maps "pronoun" to PartOfSpeech.PRONOUN', () => {
      expect(mapDictionaryApiPos('pronoun')).toBe(PartOfSpeech.PRONOUN);
    });

    it('maps "preposition" to PartOfSpeech.PREPOSITION', () => {
      expect(mapDictionaryApiPos('preposition')).toBe(
        PartOfSpeech.PREPOSITION,
      );
    });

    it('maps "conjunction" to PartOfSpeech.CONJUNCTION', () => {
      expect(mapDictionaryApiPos('conjunction')).toBe(
        PartOfSpeech.CONJUNCTION,
      );
    });

    it('maps "interjection" to PartOfSpeech.INTERJECTION', () => {
      expect(mapDictionaryApiPos('interjection')).toBe(
        PartOfSpeech.INTERJECTION,
      );
    });

    it('maps "exclamation" to PartOfSpeech.INTERJECTION', () => {
      expect(mapDictionaryApiPos('exclamation')).toBe(
        PartOfSpeech.INTERJECTION,
      );
    });
  });

  describe('unrecognised POS values', () => {
    it('returns null for "phrase"', () => {
      expect(mapDictionaryApiPos('phrase')).toBeNull();
    });

    it('returns null for "idiom"', () => {
      expect(mapDictionaryApiPos('idiom')).toBeNull();
    });

    it('returns null for an entirely unknown POS string', () => {
      expect(mapDictionaryApiPos('unknownPosString')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(mapDictionaryApiPos('')).toBeNull();
    });
  });

  describe('case sensitivity', () => {
    it('returns null for "Noun" (capitalised) — mapper is case-sensitive', () => {
      expect(mapDictionaryApiPos('Noun')).toBeNull();
    });

    it('returns null for "Verb" (capitalised) — mapper is case-sensitive', () => {
      expect(mapDictionaryApiPos('Verb')).toBeNull();
    });

    it('returns null for "NOUN" (all caps) — mapper is case-sensitive', () => {
      expect(mapDictionaryApiPos('NOUN')).toBeNull();
    });
  });

  describe('enum value integrity', () => {
    const knownMappings: string[] = [
      'noun',
      'verb',
      'adjective',
      'adverb',
      'pronoun',
      'preposition',
      'conjunction',
      'interjection',
      'exclamation',
    ];

    it('every non-null output is a valid PartOfSpeech enum value', () => {
      const validValues = Object.values(PartOfSpeech);
      for (const raw of knownMappings) {
        const result = mapDictionaryApiPos(raw);
        expect(result).not.toBeNull();
        expect(validValues).toContain(result);
      }
    });
  });
});
