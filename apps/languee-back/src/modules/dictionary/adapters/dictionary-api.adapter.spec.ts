import { Test, TestingModule } from '@nestjs/testing';
import { DictionaryApiAdapter } from './dictionary-api.adapter';
import {
  DICTIONARY_API_BASE_URL,
  DICTIONARY_API_PROVIDER_NAME,
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

describe('DictionaryApiAdapter', () => {
  let adapter: DictionaryApiAdapter;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [DictionaryApiAdapter],
    }).compile();
    adapter = module.get<DictionaryApiAdapter>(DictionaryApiAdapter);
  });

  afterEach(async () => {
    await module.close();
  });

  it('providerName equals the constant', () => {
    expect(adapter.providerName).toBe(DICTIONARY_API_PROVIDER_NAME);
  });

  it('happy path: normalises DictionaryAPI response into RawDefinitionEntry[] with canonical PartOfSpeech', async () => {
    global.fetch = mockFetchOk([
      {
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
    expect(global.fetch).toHaveBeenCalledWith(
      `${DICTIONARY_API_BASE_URL}/en/run`,
    );
  });

  it('uses DICTIONARY_API_BASE_URL constant for the request URL', async () => {
    global.fetch = mockFetchOk([{ meanings: [] }]);
    await adapter.fetch('hello', 'en');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(DICTIONARY_API_BASE_URL),
    );
  });

  it('404 response returns empty array (word not found)', async () => {
    global.fetch = mockFetchStatus(404);
    const result = await adapter.fetch('zzznonsense', 'en');
    expect(result).toEqual([]);
  });

  it('non-404 HTTP error throws ProviderUnavailableError', async () => {
    global.fetch = mockFetchStatus(500);
    await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('network error throws ProviderUnavailableError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network failure'));
    await expect(adapter.fetch('run', 'en')).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('flattens multiple meanings and definitions, producing canonical PartOfSpeech values', async () => {
    global.fetch = mockFetchOk([
      {
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

  it('meanings with unrecognised DictionaryAPI POS are excluded from the result', async () => {
    global.fetch = mockFetchOk([
      {
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

  it('exclamation POS maps to INTERJECTION and is included in the result', async () => {
    global.fetch = mockFetchOk([
      {
        meanings: [
          {
            partOfSpeech: 'exclamation',
            definitions: [{ definition: 'an expression of surprise' }],
          },
        ],
      },
    ]);

    const result = await adapter.fetch('wow', 'en');
    expect(result).toHaveLength(1);
    expect(result[0].partOfSpeech).toBe(PartOfSpeech.INTERJECTION);
  });
});
