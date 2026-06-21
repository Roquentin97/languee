import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NlpMultiWordError, NlpUnavailableError } from './nlp.errors';
import { NlpService } from './nlp.service';
import type { NlpWordResponse } from './nlp.interfaces';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerbResponse(
  overrides: Partial<NlpWordResponse> = {},
): NlpWordResponse {
  return {
    input_text: 'walk',
    is_multi_word: false,
    tokens: [
      {
        text: 'walked',
        lemma: 'walk',
        pos: 'VERB',
        is_irregular: false,
        morphology: {
          tense: 'Past',
          verb_form: 'Fin',
          number: null,
          degree: null,
        },
        forms: {
          verb_base: 'walk',
          verb_past: 'walked',
          verb_gerund_participle: 'walking',
          verb_past_participle: 'walked',
          verb_present_non_3sg: 'walk',
          verb_present_3sg: 'walks',
          noun_singular: null,
          noun_plural: null,
          adj_positive: null,
          adj_comparative: null,
          adj_superlative: null,
        },
      },
    ],
    ...overrides,
  };
}

function makeNounResponse(): NlpWordResponse {
  return {
    input_text: 'dog',
    is_multi_word: false,
    tokens: [
      {
        text: 'dog',
        lemma: 'dog',
        pos: 'NOUN',
        is_irregular: false,
        morphology: {
          tense: null,
          verb_form: null,
          number: 'Sing',
          degree: null,
        },
        forms: {
          verb_base: null,
          verb_past: null,
          verb_gerund_participle: null,
          verb_past_participle: null,
          verb_present_non_3sg: null,
          verb_present_3sg: null,
          noun_singular: 'dog',
          noun_plural: 'dogs',
          adj_positive: null,
          adj_comparative: null,
          adj_superlative: null,
        },
      },
    ],
  };
}

function makeAdjResponse(): NlpWordResponse {
  return {
    input_text: 'fast',
    is_multi_word: false,
    tokens: [
      {
        text: 'fast',
        lemma: 'fast',
        pos: 'ADJ',
        is_irregular: false,
        morphology: {
          tense: null,
          verb_form: null,
          number: null,
          degree: 'Pos',
        },
        forms: {
          verb_base: null,
          verb_past: null,
          verb_gerund_participle: null,
          verb_past_participle: null,
          verb_present_non_3sg: null,
          verb_present_3sg: null,
          noun_singular: null,
          noun_plural: null,
          adj_positive: 'fast',
          adj_comparative: 'faster',
          adj_superlative: 'fastest',
        },
      },
    ],
  };
}

function getFirstFetchUrl(mockFetch: jest.MockedFunction<typeof fetch>): URL {
  const [url] = mockFetch.mock.lastCall ?? [];
  if (typeof url !== 'string') {
    throw new Error('Expected fetch to be called with a string URL');
  }
  return new URL(url);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NlpService', () => {
  let service: NlpService;

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'nlp.baseUrl': 'http://nlp-service:8001',
        'nlp.basicAuthLogin': 'user',
        'nlp.basicAuthPassword': 'pass',
      };
      if (key in values) return values[key];
      throw new Error(`Config key not found: ${key}`);
    }),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        'nlp.baseUrl': 'http://nlp-service:8001',
        'nlp.basicAuthLogin': 'user',
        'nlp.basicAuthPassword': 'pass',
      };
      if (key in values) return values[key];
      throw new Error(`Config key not found: ${key}`);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NlpService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NlpService>(NlpService);
  });

  // -------------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------------

  describe('analyzeWord() — happy paths', () => {
    it('VERB word with full forms returns NlpAnalysis with compact inflectionForms', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      const result = await service.analyzeWord('walked');

      expect(result.lemma).toBe('walk');
      expect(result.pos).toBe(PartOfSpeech.VERB);
      expect(result.isIrregular).toBe(false);
      expect(result.inflectionForms).toEqual({
        type: 'verb',
        base: 'walk',
        past: 'walked',
        gerundParticiple: 'walking',
        pastParticiple: 'walked',
        presentNon3sg: 'walk',
        present3sg: 'walks',
      });
    });

    it('NOUN word returns compact noun forms', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNounResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyzeWord('dog');

      expect(result.lemma).toBe('dog');
      expect(result.pos).toBe(PartOfSpeech.NOUN);
      expect(result.inflectionForms).toEqual({
        type: 'noun',
        singular: 'dog',
        plural: 'dogs',
      });
    });

    it('ADJ word returns compact adj forms', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeAdjResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyzeWord('fast');

      expect(result.lemma).toBe('fast');
      expect(result.pos).toBe(PartOfSpeech.ADJECTIVE);
      expect(result.inflectionForms).toEqual({
        type: 'adjective',
        positive: 'fast',
        comparative: 'faster',
        superlative: 'fastest',
      });
    });

    it('unknown POS returns empty inflectionForms object', async () => {
      const response: NlpWordResponse = {
        input_text: 'hmm',
        is_multi_word: false,
        tokens: [
          {
            text: 'hmm',
            lemma: 'hmm',
            pos: 'INTJ',
            is_irregular: false,
            morphology: {
              tense: null,
              verb_form: null,
              number: null,
              degree: null,
            },
            forms: {
              verb_base: null,
              verb_past: null,
              verb_gerund_participle: null,
              verb_past_participle: null,
              verb_present_non_3sg: null,
              verb_present_3sg: null,
              noun_singular: null,
              noun_plural: null,
              adj_positive: null,
              adj_comparative: null,
              adj_superlative: null,
            },
          },
        ],
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyzeWord('hmm');

      expect(result.inflectionForms).toBeNull();
    });

    it('VERB POS with all verb forms null returns null inflectionForms', async () => {
      const response = makeVerbResponse();
      const token = response.tokens[0];
      token.forms.verb_base = null;
      token.forms.verb_past = null;
      token.forms.verb_gerund_participle = null;
      token.forms.verb_past_participle = null;
      token.forms.verb_present_non_3sg = null;
      token.forms.verb_present_3sg = null;

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyzeWord('walked');

      expect(result.inflectionForms).toBeNull();
    });

    it('NLP returns lemma different from input: result contains NLP lemma', async () => {
      const response = makeVerbResponse();
      response.tokens[0].lemma = 'walk';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyzeWord('walked');

      expect(result.lemma).toBe('walk');
    });
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  describe('analyzeWord() — error cases', () => {
    it('non-2xx response throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyzeWord('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure (fetch throws) throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyzeWord('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure wraps original error as cause', async () => {
      const cause = new Error('ECONNREFUSED');
      const mockFetch = jest.fn().mockRejectedValue(cause);
      global.fetch = mockFetch as unknown as typeof fetch;

      const err = await service.analyzeWord('walk').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NlpUnavailableError);
      expect((err as NlpUnavailableError).cause).toBe(cause);
    });

    it('is_multi_word=true throws NlpMultiWordError', async () => {
      const response = makeVerbResponse({ is_multi_word: true });

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyzeWord('walk fast')).rejects.toBeInstanceOf(
        NlpMultiWordError,
      );
    });

    it('tokens.length !== 1 despite is_multi_word=false throws NlpMultiWordError', async () => {
      const response: NlpWordResponse = {
        input_text: 'walk run',
        is_multi_word: false,
        tokens: [
          {
            text: 'walk',
            lemma: 'walk',
            pos: 'VERB',
            is_irregular: false,
            morphology: {
              tense: null,
              verb_form: null,
              number: null,
              degree: null,
            },
            forms: {
              verb_base: 'walk',
              verb_past: 'walked',
              verb_gerund_participle: 'walking',
              verb_past_participle: 'walked',
              verb_present_non_3sg: 'walk',
              verb_present_3sg: 'walks',
              noun_singular: null,
              noun_plural: null,
              adj_positive: null,
              adj_comparative: null,
              adj_superlative: null,
            },
          },
          {
            text: 'run',
            lemma: 'run',
            pos: 'VERB',
            is_irregular: false,
            morphology: {
              tense: null,
              verb_form: null,
              number: null,
              degree: null,
            },
            forms: {
              verb_base: 'run',
              verb_past: 'ran',
              verb_gerund_participle: 'running',
              verb_past_participle: 'run',
              verb_present_non_3sg: 'run',
              verb_present_3sg: 'runs',
              noun_singular: null,
              noun_plural: null,
              adj_positive: null,
              adj_comparative: null,
              adj_superlative: null,
            },
          },
        ],
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyzeWord('walk run')).rejects.toBeInstanceOf(
        NlpMultiWordError,
      );
    });

    it('correct Authorization header is sent with Basic credentials', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.analyzeWord('walk');

      const expectedCredentials = Buffer.from('user:pass').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/words?word=walk'),
        expect.objectContaining({
          headers: { Authorization: `Basic ${expectedCredentials}` },
        }),
      );
    });

    it('context is sent as input_text query parameter when provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.analyzeWord('saw', 'The saw was sharp enough to cut oak');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.pathname).toBe('/words');
      expect(url.searchParams.get('word')).toBe('saw');
      expect(url.searchParams.get('input_text')).toBe(
        'The saw was sharp enough to cut oak',
      );
    });

    it('blank context is omitted from the NLP request', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyzeWord('walk', '   ');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('word')).toBe('walk');
      expect(url.searchParams.has('input_text')).toBe(false);
    });
  });
});
