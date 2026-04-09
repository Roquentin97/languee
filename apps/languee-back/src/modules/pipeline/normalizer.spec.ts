import { Test } from '@nestjs/testing';
import { Normalizer } from './stages/normalizer';
import { PipelineModule } from './pipeline.module';
import { NORMALIZER } from './pipeline.tokens';
import type { RawInput } from './interfaces/pipeline.interfaces';

describe('Normalizer', () => {
  let normalizer: Normalizer;

  beforeEach(() => {
    normalizer = new Normalizer();
  });

  describe('happy path', () => {
    it('normalizes a plain lowercase ASCII word', () => {
      const result = normalizer.normalize({ raw: 'hello' });
      expect(result).toEqual({
        normalized_form: 'hello',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC1 — simple uppercase word', () => {
    it('lowercases "Despite" to "despite"', () => {
      const result = normalizer.normalize({ raw: 'Despite' });
      expect(result).toEqual({
        normalized_form: 'despite',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC2 — surrounding whitespace', () => {
    it('trims and lowercases "  although  "', () => {
      const result = normalizer.normalize({ raw: '  although  ' });
      expect(result).toEqual({
        normalized_form: 'although',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC3 — NFD input normalized to NFC', () => {
    it('converts NFD é (\\u0065\\u0301) to NFC é (\\u00E9)', () => {
      // "café" with NFD é: c-a-f-e + combining acute accent
      const nfdInput = 'caf\u0065\u0301';
      const result = normalizer.normalize({ raw: nfdInput });
      expect(result.normalized_form).toBe('caf\u00E9');
      expect(result).toEqual({
        normalized_form: 'caf\u00E9',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC4 — empty string', () => {
    it('returns empty normalized_form without throwing', () => {
      expect(() => normalizer.normalize({ raw: '' })).not.toThrow();
      const result = normalizer.normalize({ raw: '' });
      expect(result).toEqual({
        normalized_form: '',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC5 — whitespace-only string', () => {
    it('trims whitespace-only input to empty string', () => {
      const result = normalizer.normalize({ raw: '   ' });
      expect(result).toEqual({
        normalized_form: '',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC6 — internal whitespace preserved', () => {
    it('preserves internal space in "hello world"', () => {
      const result = normalizer.normalize({ raw: 'hello world' });
      expect(result).toEqual({
        normalized_form: 'hello world',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC7 — uppercase with NFC accented character', () => {
    it('lowercases "Café" (NFC) to "café"', () => {
      const result = normalizer.normalize({ raw: 'Café' });
      expect(result).toEqual({
        normalized_form: 'café',
        is_multi_word: false,
        pos: null,
      });
    });
  });

  describe('EC8 — is_multi_word is exactly boolean false', () => {
    it('returns is_multi_word as boolean false, not null/undefined/0', () => {
      const result = normalizer.normalize({ raw: 'test' });
      expect(result.is_multi_word).toBe(false);
      expect(typeof result.is_multi_word).toBe('boolean');
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
      const alreadyNormalized = 'caf\u00E9'; // NFC, lowercase, no surrounding whitespace
      const result = normalizer.normalize({ raw: alreadyNormalized });
      expect(result.normalized_form).toBe(alreadyNormalized);
    });
  });

  describe('EC12 — PipelineModule binds NORMALIZER token to Normalizer', () => {
    it('resolves NORMALIZER token to an instance of Normalizer', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [PipelineModule],
      }).compile();

      const resolved = moduleRef.get<Normalizer>(NORMALIZER);
      expect(resolved).toBeInstanceOf(Normalizer);
    });
  });
});
