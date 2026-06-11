import { mapSpacyPos } from './spacy-pos.mapper';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

describe('mapSpacyPos', () => {
  describe('NOUN mapping', () => {
    it('maps "NOUN" to PartOfSpeech.NOUN', () => {
      expect(mapSpacyPos('NOUN')).toBe(PartOfSpeech.NOUN);
    });

    it('maps "PROPN" to PartOfSpeech.NOUN (proper noun treated as noun)', () => {
      expect(mapSpacyPos('PROPN')).toBe(PartOfSpeech.NOUN);
    });
  });

  describe('VERB mapping', () => {
    it('maps "VERB" to PartOfSpeech.VERB', () => {
      expect(mapSpacyPos('VERB')).toBe(PartOfSpeech.VERB);
    });

    it('maps "AUX" to PartOfSpeech.VERB (auxiliary verb treated as verb)', () => {
      expect(mapSpacyPos('AUX')).toBe(PartOfSpeech.VERB);
    });
  });

  describe('adjective and adverb mapping', () => {
    it('maps "ADJ" to PartOfSpeech.ADJECTIVE', () => {
      expect(mapSpacyPos('ADJ')).toBe(PartOfSpeech.ADJECTIVE);
    });

    it('maps "ADV" to PartOfSpeech.ADVERB', () => {
      expect(mapSpacyPos('ADV')).toBe(PartOfSpeech.ADVERB);
    });
  });

  describe('pronoun and preposition mapping', () => {
    it('maps "PRON" to PartOfSpeech.PRONOUN', () => {
      expect(mapSpacyPos('PRON')).toBe(PartOfSpeech.PRONOUN);
    });

    it('maps "ADP" to PartOfSpeech.PREPOSITION', () => {
      expect(mapSpacyPos('ADP')).toBe(PartOfSpeech.PREPOSITION);
    });
  });

  describe('conjunction mapping', () => {
    it('maps "CCONJ" to PartOfSpeech.CONJUNCTION', () => {
      expect(mapSpacyPos('CCONJ')).toBe(PartOfSpeech.CONJUNCTION);
    });

    it('maps "SCONJ" to PartOfSpeech.CONJUNCTION', () => {
      expect(mapSpacyPos('SCONJ')).toBe(PartOfSpeech.CONJUNCTION);
    });
  });

  describe('interjection mapping', () => {
    it('maps "INTJ" to PartOfSpeech.INTERJECTION', () => {
      expect(mapSpacyPos('INTJ')).toBe(PartOfSpeech.INTERJECTION);
    });
  });

  describe('null-returning tags', () => {
    it('returns null for "DET"', () => {
      expect(mapSpacyPos('DET')).toBeNull();
    });

    it('returns null for "NUM"', () => {
      expect(mapSpacyPos('NUM')).toBeNull();
    });

    it('returns null for "PART"', () => {
      expect(mapSpacyPos('PART')).toBeNull();
    });

    it('returns null for "PUNCT"', () => {
      expect(mapSpacyPos('PUNCT')).toBeNull();
    });

    it('returns null for "SYM"', () => {
      expect(mapSpacyPos('SYM')).toBeNull();
    });

    it('returns null for "X"', () => {
      expect(mapSpacyPos('X')).toBeNull();
    });

    it('returns null for "SPACE"', () => {
      expect(mapSpacyPos('SPACE')).toBeNull();
    });

    it('returns null for an entirely unknown POS tag (future-proofing)', () => {
      expect(mapSpacyPos('UNKNOWN_TAG_XYZ')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(mapSpacyPos('')).toBeNull();
    });
  });

  describe('enum value integrity', () => {
    const nonNullMappings: string[] = [
      'NOUN',
      'PROPN',
      'VERB',
      'AUX',
      'ADJ',
      'ADV',
      'PRON',
      'ADP',
      'CCONJ',
      'SCONJ',
      'INTJ',
    ];

    it('every non-null output equals a valid PartOfSpeech enum value', () => {
      const validValues = Object.values(PartOfSpeech);
      for (const tag of nonNullMappings) {
        const result = mapSpacyPos(tag);
        expect(result).not.toBeNull();
        expect(validValues).toContain(result);
      }
    });
  });
});
