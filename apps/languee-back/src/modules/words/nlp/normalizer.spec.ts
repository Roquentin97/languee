import { Normalizer } from './normalizer';
import type { RawInput } from '../interfaces/nlp.interfaces';

describe('Normalizer', () => {
  let normalizer: Normalizer;

  beforeEach(() => {
    normalizer = new Normalizer();
  });

  describe('happy path', () => {
    it('normalizes a plain lowercase ASCII word', () => {
      const result = normalizer.normalize({ raw: 'hello' });
      expect(result).toEqual({
        normalizedForm: 'hello',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC1 — simple uppercase word', () => {
    it('lowercases "Despite" to "despite"', () => {
      const result = normalizer.normalize({ raw: 'Despite' });
      expect(result).toEqual({
        normalizedForm: 'despite',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC2 — surrounding whitespace', () => {
    it('trims and lowercases "  although  "', () => {
      const result = normalizer.normalize({ raw: '  although  ' });
      expect(result).toEqual({
        normalizedForm: 'although',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC3 — NFD input normalized to NFC', () => {
    it('converts NFD é (\\u0065\\u0301) to NFC é (\\u00E9)', () => {
      // "café" with NFD é: c-a-f-e + combining acute accent
      const nfdInput = 'café';
      const result = normalizer.normalize({ raw: nfdInput });
      expect(result.normalizedForm).toBe('café');
      expect(result).toEqual({
        normalizedForm: 'café',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC4 — empty string', () => {
    it('returns empty normalizedForm without throwing', () => {
      expect(() => normalizer.normalize({ raw: '' })).not.toThrow();
      const result = normalizer.normalize({ raw: '' });
      expect(result).toEqual({
        normalizedForm: '',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC5 — whitespace-only string', () => {
    it('trims whitespace-only input to empty string', () => {
      const result = normalizer.normalize({ raw: '   ' });
      expect(result).toEqual({
        normalizedForm: '',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC6 — internal whitespace preserved', () => {
    it('preserves internal space in "hello world"', () => {
      const result = normalizer.normalize({ raw: 'hello world' });
      expect(result).toEqual({
        normalizedForm: 'hello world',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC7 — uppercase with NFC accented character', () => {
    it('lowercases "Café" (NFC) to "café"', () => {
      const result = normalizer.normalize({ raw: 'Café' });
      expect(result).toEqual({
        normalizedForm: 'café',
        isMultiWord: false,
        pos: null,
      });
    });
  });

  describe('EC8 — isMultiWord is exactly boolean false', () => {
    it('returns isMultiWord as boolean false, not null/undefined/0', () => {
      const result = normalizer.normalize({ raw: 'test' });
      expect(result.isMultiWord).toBe(false);
      expect(typeof result.isMultiWord).toBe('boolean');
    });
  });

  describe('EC9 — pos is exactly null', () => {
    it('returns pos as exactly null, not undefined or empty string', () => {
      const result = normalizer.normalize({ raw: 'test' });
      expect(result.pos).toBeNull();
      expect(result.pos).not.toBeUndefined();
      expect(result.pos).not.toBe('');
    });
  });

  describe('EC10 — no mutation of input', () => {
    it('does not mutate input.raw after normalize call', () => {
      const input: RawInput = { raw: '  Hello  ' };
      const originalRaw = input.raw;
      normalizer.normalize(input);
      expect(input.raw).toBe(originalRaw);
    });
  });

  describe('EC11 — already normalized input is unchanged', () => {
    it('returns the same string when input is already trimmed, lowercase, and NFC', () => {
      const alreadyNormalized = 'café'; // NFC, lowercase, no surrounding whitespace
      const result = normalizer.normalize({ raw: alreadyNormalized });
      expect(result.normalizedForm).toBe(alreadyNormalized);
    });
  });
});
