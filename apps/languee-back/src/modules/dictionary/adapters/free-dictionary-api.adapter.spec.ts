import { Test, TestingModule } from '@nestjs/testing';
import { FreeDictionaryApiAdapter } from './free-dictionary-api.adapter';
import {
  FREE_DICTIONARY_API_BASE_URL,
  FREE_DICTIONARY_API_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';
import { RequestService } from '../../core/http/request.service';

function mockFetchOk(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  });
}

function mockFetchStatus(status: number) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: jest.fn().mockResolvedValue(''),
    json: jest.fn(),
  });
}

function makeEntry(
  partOfSpeech: string,
  senses: { definition: string; examples?: string[] }[],
) {
  return {
    language: { code: 'en', name: 'English' },
    partOfSpeech,
    pronunciations: [] as { type: string; text: string; tags: string[] }[],
    forms: [] as { word: string; tags: string[] }[],
    senses: senses.map((s) => ({
      definition: s.definition,
      tags: [] as string[],
      examples: s.examples ?? ([] as string[]),
      quotes: [] as unknown[],
      synonyms: [] as string[],
      antonyms: [] as string[],
      subsenses: [] as unknown[],
    })),
    synonyms: [] as string[],
    antonyms: [] as string[],
  };
}

function makeResponse(word: string, entries: ReturnType<typeof makeEntry>[]) {
  return { word, entries, source: {} };
}

describe('FreeDictionaryApiAdapter', () => {
  let adapter: FreeDictionaryApiAdapter;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [FreeDictionaryApiAdapter, RequestService],
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
      global.fetch = mockFetchOk(
        makeResponse('run', [
          makeEntry('verb', [
            { definition: 'move fast', examples: ['She runs every day.'] },
          ]),
        ]),
      );

      const result = await adapter.fetch('run', 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        partOfSpeech: PartOfSpeech.VERB,
        definition: 'move fast',
        example: 'She runs every day.',
      });
    });

    it('flattens multiple entries and senses into flat RawDefinitionEntry[]', async () => {
      global.fetch = mockFetchOk(
        makeResponse('run', [
          makeEntry('verb', [
            { definition: 'move fast' },
            { definition: 'operate' },
          ]),
          makeEntry('noun', [{ definition: 'a sprint' }]),
        ]),
      );

      const result = await adapter.fetch('run', 'en');

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.partOfSpeech)).toEqual([
        PartOfSpeech.VERB,
        PartOfSpeech.VERB,
        PartOfSpeech.NOUN,
      ]);
    });

    it('sense without examples omits the example field', async () => {
      global.fetch = mockFetchOk(
        makeResponse('run', [makeEntry('noun', [{ definition: 'a sprint' }])]),
      );

      const result = await adapter.fetch('run', 'en');

      expect(result[0]).not.toHaveProperty('example');
    });

    it('uses the first example string when multiple examples are present', async () => {
      global.fetch = mockFetchOk(
        makeResponse('run', [
          makeEntry('verb', [
            {
              definition: 'move fast',
              examples: ['She runs every day.', 'He ran away.'],
            },
          ]),
        ]),
      );

      const result = await adapter.fetch('run', 'en');

      expect(result[0].example).toBe('She runs every day.');
    });

    it('pronunciations are silently dropped — not present in RawDefinitionEntry output', async () => {
      global.fetch = mockFetchOk(
        makeResponse('run', [
          {
            ...makeEntry('noun', [{ definition: 'a sprint' }]),
            pronunciations: [{ type: 'ipa', text: '/rʌn/', tags: [] }],
          },
        ]),
      );

      const result = await adapter.fetch('run', 'en');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('ipa');
      expect(result[0]).not.toHaveProperty('pronunciations');
      expect(result[0]).not.toHaveProperty('text');
    });

    it('empty pronunciations array does not throw', async () => {
      global.fetch = mockFetchOk(
        makeResponse('run', [makeEntry('verb', [{ definition: 'move fast' }])]),
      );

      await expect(adapter.fetch('run', 'en')).resolves.toHaveLength(1);
    });
  });

  describe('URL construction', () => {
    it('uses FREE_DICTIONARY_API_BASE_URL in the request URL', async () => {
      global.fetch = mockFetchOk(makeResponse('hello', []));
      await adapter.fetch('hello', 'en');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(FREE_DICTIONARY_API_BASE_URL),
        expect.anything(),
      );
    });

    it('forwards the language and lemma in the URL path as /entries/{language}/{word}', async () => {
      global.fetch = mockFetchOk(makeResponse('hello', []));
      await adapter.fetch('hello', 'en');
      expect(global.fetch).toHaveBeenCalledWith(
        `${FREE_DICTIONARY_API_BASE_URL}/entries/en/hello`,
        expect.anything(),
      );
    });

    it('uses the provided language code in the URL path', async () => {
      global.fetch = mockFetchOk(makeResponse('bonjour', []));
      await adapter.fetch('bonjour', 'fr');
      expect(global.fetch).toHaveBeenCalledWith(
        `${FREE_DICTIONARY_API_BASE_URL}/entries/fr/bonjour`,
        expect.anything(),
      );
    });
  });

  describe('POS filtering', () => {
    it('entries with unrecognised POS strings are excluded from the result', async () => {
      global.fetch = mockFetchOk(
        makeResponse('run', [
          makeEntry('unknownPos', [{ definition: 'should be excluded' }]),
          makeEntry('verb', [{ definition: 'move fast' }]),
        ]),
      );

      const result = await adapter.fetch('run', 'en');
      expect(result).toHaveLength(1);
      expect(result[0].partOfSpeech).toBe(PartOfSpeech.VERB);
    });

    it('all unknown POS strings in response → returns empty array', async () => {
      global.fetch = mockFetchOk(
        makeResponse('foo', [
          makeEntry('unknownPosA', [{ definition: 'def a' }]),
          makeEntry('unknownPosB', [{ definition: 'def b' }]),
        ]),
      );

      const result = await adapter.fetch('foo', 'en');
      expect(result).toEqual([]);
    });

    it('empty senses array on an entry → that entry contributes no results', async () => {
      global.fetch = mockFetchOk(makeResponse('foo', [makeEntry('noun', [])]));

      const result = await adapter.fetch('foo', 'en');
      expect(result).toEqual([]);
    });

    it('empty entries array → returns empty array', async () => {
      global.fetch = mockFetchOk(makeResponse('foo', []));

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
