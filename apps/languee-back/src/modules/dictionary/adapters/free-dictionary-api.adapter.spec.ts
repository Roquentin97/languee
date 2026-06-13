import { Test, TestingModule } from '@nestjs/testing';
import { FreeDictionaryApiAdapter } from './free-dictionary-api.adapter';
import {
  FREE_DICTIONARY_API_BASE_URL,
  FREE_DICTIONARY_API_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';

function mockFetchOk(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

function mockFetchStatus(status: number) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jest.fn(),
  } as unknown as Response);
}

describe('FreeDictionaryApiAdapter', () => {
  let adapter: FreeDictionaryApiAdapter;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [FreeDictionaryApiAdapter],
    }).compile();
    adapter = module.get<FreeDictionaryApiAdapter>(FreeDictionaryApiAdapter);
  });

  afterEach(async () => {
    await module.close();
  });

  it('providerName equals the FREE_DICTIONARY_API_PROVIDER_NAME constant', () => {
    expect(adapter.providerName).toBe(FREE_DICTIONARY_API_PROVIDER_NAME);
  });

  it('providerName is "freedictionaryapi"', () => {
    expect(adapter.providerName).toBe('freedictionaryapi');
  });

  describe('happy path', () => {
    it('maps a valid response to RawDefinitionEntry[] with canonical PartOfSpeech', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [{ text: '/rʌn/' }],
          meanings: [
            {
              partOfSpeech: 'verb',
              definitions: [
                { definition: 'move fast', example: 'She runs every day.' },
              ],
            },
          ],
        },
      ]);

      const result = await adapter.fetch('run', 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'move fast',
        example: 'She runs every day.',
      });
    });

    it('flattens multiple meanings and definitions into flat RawDefinitionEntry[]', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [],
          meanings: [
            {
              partOfSpeech: 'verb',
              definitions: [
                { definition: 'move fast' },
                { definition: 'operate' },
              ],
            },
            {
              partOfSpeech: 'noun',
              definitions: [{ definition: 'a sprint' }],
            },
          ],
        },
      ]);

      const result = await adapter.fetch('run', 'en');

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.partOfSpeech)).toEqual([
        PartOfSpeech.VERB,
        PartOfSpeech.VERB,
        PartOfSpeech.NOUN,
      ]);
    });

    it('entry without example omits the example field', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [],
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [{ definition: 'a sprint' }],
            },
          ],
        },
      ]);

      const result = await adapter.fetch('run', 'en');

      expect(result[0]).not.toHaveProperty('example');
    });

    it('phonetics / IPA field is silently dropped — not present in RawDefinitionEntry output', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [{ text: '/rʌn/' }],
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [{ definition: 'a sprint' }],
            },
          ],
        },
      ]);

      const result = await adapter.fetch('run', 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('ipa');
      expect(result[0]).not.toHaveProperty('phonetics');
      expect(result[0]).not.toHaveProperty('text');
    });

    it('phonetics array may be empty without throwing', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [],
          meanings: [
            {
              partOfSpeech: 'verb',
              definitions: [{ definition: 'move fast' }],
            },
          ],
        },
      ]);

      await expect(adapter.fetch('run', 'en')).resolves.toHaveLength(1);
    });

    it('phonetic entry missing text property does not throw', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [{ audio: 'some-url.mp3' }],
          meanings: [
            {
              partOfSpeech: 'verb',
              definitions: [{ definition: 'move fast' }],
            },
          ],
        },
      ]);

      await expect(adapter.fetch('run', 'en')).resolves.toHaveLength(1);
    });
  });

  describe('URL construction', () => {
    it('uses FREE_DICTIONARY_API_BASE_URL in the request URL', async () => {
      global.fetch = mockFetchOk([
        { word: 'hello', phonetics: [], meanings: [] },
      ]);
      await adapter.fetch('hello', 'en');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(FREE_DICTIONARY_API_BASE_URL),
      );
    });

    it('does NOT forward the language parameter in the URL — URL only uses lemma', async () => {
      global.fetch = mockFetchOk([
        { word: 'hello', phonetics: [], meanings: [] },
      ]);
      await adapter.fetch('hello', 'en');
      // Exact URL must be base + lemma only, no language segment
      expect(global.fetch).toHaveBeenCalledWith(
        `${FREE_DICTIONARY_API_BASE_URL}/hello`,
      );
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/en/'),
      );
    });

    it('language parameter accepted but not forwarded in the URL regardless of value', async () => {
      global.fetch = mockFetchOk([
        { word: 'bonjour', phonetics: [], meanings: [] },
      ]);
      await adapter.fetch('bonjour', 'de');
      expect(global.fetch).toHaveBeenCalledWith(
        `${FREE_DICTIONARY_API_BASE_URL}/bonjour`,
      );
    });
  });

  describe('POS filtering', () => {
    it('meanings with unrecognised POS strings are excluded from the result', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'run',
          phonetics: [],
          meanings: [
            {
              partOfSpeech: 'unknownPos',
              definitions: [{ definition: 'should be excluded' }],
            },
            {
              partOfSpeech: 'verb',
              definitions: [{ definition: 'move fast' }],
            },
          ],
        },
      ]);

      const result = await adapter.fetch('run', 'en');
      expect(result).toHaveLength(1);
      expect(result[0].partOfSpeech).toBe(PartOfSpeech.VERB);
    });

    it('all unknown POS strings in response → returns empty array', async () => {
      global.fetch = mockFetchOk([
        {
          word: 'foo',
          phonetics: [],
          meanings: [
            {
              partOfSpeech: 'unknownPosA',
              definitions: [{ definition: 'def a' }],
            },
            {
              partOfSpeech: 'unknownPosB',
              definitions: [{ definition: 'def b' }],
            },
          ],
        },
      ]);

      const result = await adapter.fetch('foo', 'en');
      expect(result).toEqual([]);
    });

    it('empty meanings array → returns empty array', async () => {
      global.fetch = mockFetchOk([
        { word: 'foo', phonetics: [], meanings: [] },
      ]);

      const result = await adapter.fetch('foo', 'en');
      expect(result).toEqual([]);
    });

    it('empty entries array → returns empty array', async () => {
      global.fetch = mockFetchOk([]);

      const result = await adapter.fetch('foo', 'en');
      expect(result).toEqual([]);
    });
  });

  describe('404 response', () => {
    it('returns empty array when the API responds with 404 (word not found)', async () => {
      global.fetch = mockFetchStatus(404);

      const result = await adapter.fetch('zzznonsense', 'en');
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('429 response (rate limit) throws ProviderUnavailableError', async () => {
      global.fetch = mockFetchStatus(429);
      await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('5xx response throws ProviderUnavailableError', async () => {
      global.fetch = mockFetchStatus(500);
      await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('502 response throws ProviderUnavailableError', async () => {
      global.fetch = mockFetchStatus(502);
      await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('network / timeout error (fetch throws) propagates as ProviderUnavailableError', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
      await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('non-404, non-429 non-ok response also throws ProviderUnavailableError', async () => {
      global.fetch = mockFetchStatus(503);
      await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });
  });
});
