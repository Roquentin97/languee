import { Test, TestingModule } from '@nestjs/testing';
import { WiktionaryApiAdapter } from './wiktionary-api.adapter';
import {
  WIKTIONARY_API_BASE_URL,
  WIKTIONARY_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
import { PartOfSpeech } from '../../vocabulary/enums/part-of-speech.enum';
import { RequestService } from '../../core/http/request.service';
import { ConfigService } from '@nestjs/config';

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
    text: jest.fn().mockResolvedValue(''),
    json: jest.fn(),
  } as unknown as Response);
}

describe('WiktionaryApiAdapter', () => {
  let adapter: WiktionaryApiAdapter;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      providers: [
        WiktionaryApiAdapter,
        RequestService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest
              .fn()
              .mockReturnValue('languee-test (contact: test@example.com)'),
            get: jest.fn().mockReturnValue('wiktionary'),
          },
        },
      ],
    }).compile();
    adapter = module.get<WiktionaryApiAdapter>(WiktionaryApiAdapter);
  });

  afterEach(async () => {
    await module.close();
  });

  it('providerName equals the WIKTIONARY_PROVIDER_NAME constant', () => {
    expect(adapter.providerName).toBe(WIKTIONARY_PROVIDER_NAME);
  });

  it('providerName is "wiktionary"', () => {
    expect(adapter.providerName).toBe('wiktionary');
  });

  describe('happy path', () => {
    it('returns parsed RawDefinitionEntry[] for a valid response', async () => {
      global.fetch = mockFetchOk({
        en: [
          {
            partOfSpeech: 'Verb',
            language: 'English',
            definitions: [
              {
                definition: 'To <b>collide</b> with.',
                examples: ['He ran into a tree.'],
              },
            ],
          },
        ],
      });

      const result = await adapter.fetch('run', 'en');

      expect(result).toEqual([
        {
          partOfSpeech: PartOfSpeech.VERB,
          definition: 'To collide with.',
          example: 'He ran into a tree.',
        },
      ]);
    });

    it('requests the URL-encoded lemma against WIKTIONARY_API_BASE_URL', async () => {
      global.fetch = mockFetchOk({ en: [] });

      await adapter.fetch('run into', 'en');

      expect(global.fetch).toHaveBeenCalledWith(
        `${WIKTIONARY_API_BASE_URL}/run%20into`,
        expect.anything(),
      );
    });

    it('sends a User-Agent header on the request', async () => {
      global.fetch = mockFetchOk({ en: [] });

      await adapter.fetch('run', 'en');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(init.headers['User-Agent']).toEqual(expect.any(String));
      expect(init.headers['User-Agent'].length).toBeGreaterThan(0);
    });
  });

  describe('404 response', () => {
    it('returns empty array when the API responds with 404 (word not found)', async () => {
      global.fetch = mockFetchStatus(404);

      const result = await adapter.fetch('zzznonsense', 'en');
      expect(result).toEqual([]);
    });
  });

  describe('missing language key', () => {
    it('returns empty array when the response has no entry for the requested language', async () => {
      global.fetch = mockFetchOk({ fr: [] });

      const result = await adapter.fetch('run', 'en');
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('500 response throws ProviderUnavailableError', async () => {
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
  });
});
