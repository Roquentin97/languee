import { mapFreeDictionaryApiPos } from './free-dictionary-api-pos.mapper';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

/**
 * Lightweight spec confirming the re-exported mapper alias resolves and
 * behaves identically to the underlying mapDictionaryApiPos function.
 */
describe('mapFreeDictionaryApiPos (re-export alias)', () => {
  it('maps "noun" to PartOfSpeech.NOUN', () => {
    expect(mapFreeDictionaryApiPos('noun')).toBe(PartOfSpeech.NOUN);
  });

  it('maps "verb" to PartOfSpeech.VERB', () => {
    expect(mapFreeDictionaryApiPos('verb')).toBe(PartOfSpeech.VERB);
  });

  it('maps "adjective" to PartOfSpeech.ADJECTIVE', () => {
    expect(mapFreeDictionaryApiPos('adjective')).toBe(PartOfSpeech.ADJECTIVE);
  });

  it('maps "adverb" to PartOfSpeech.ADVERB', () => {
    expect(mapFreeDictionaryApiPos('adverb')).toBe(PartOfSpeech.ADVERB);
  });

  it('maps "exclamation" to PartOfSpeech.INTERJECTION', () => {
    expect(mapFreeDictionaryApiPos('exclamation')).toBe(
      PartOfSpeech.INTERJECTION,
    );
  });

  it('returns null for unrecognised POS string', () => {
    expect(mapFreeDictionaryApiPos('idiom')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(mapFreeDictionaryApiPos('')).toBeNull();
  });

  it('every non-null output is a valid PartOfSpeech enum value', () => {
    const knownMappings = [
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
    const validValues = Object.values(PartOfSpeech);
    for (const raw of knownMappings) {
      const result = mapFreeDictionaryApiPos(raw);
      expect(result).not.toBeNull();
      expect(validValues).toContain(result);
    }
  });
});
