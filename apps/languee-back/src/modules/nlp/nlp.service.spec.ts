import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NlpInputInvalidError, NlpUnavailableError } from './nlp.errors';
import { NlpService } from './nlp.service';
import type { NlpExpressionResponse, NlpWordResponse } from './nlp.interfaces';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import { RequestFailure, RequestService } from '../core/http/request.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerbResponse(
  overrides: Partial<NlpWordResponse> = {},
): NlpWordResponse {
  return {
    kind: 'word',
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
    kind: 'word',
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
    kind: 'word',
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

function makeExpressionResponse(
  overrides: Partial<NlpExpressionResponse> = {},
): NlpExpressionResponse {
  return {
    input_text: 'ran into',
    canonical: 'run into',
    kind: 'phrasal_verb',
    head_lemma: 'run',
    tokens: [
      { text: 'ran', lemma: 'run', pos: 'VERB' },
      { text: 'into', lemma: 'into', pos: 'ADP' },
    ],
    ...overrides,
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
        RequestService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NlpService>(NlpService);
  });

  // -------------------------------------------------------------------------
  // Happy paths — word responses
  // -------------------------------------------------------------------------

  describe('analyze() — word happy paths', () => {
    it('VERB word with full forms returns NlpAnalysis with compact inflectionForms', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      const result = await service.analyze('walked');

      expect(result.kind).toBe('word');
      if (result.kind !== 'word') throw new Error('expected word result');
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

      const result = await service.analyze('dog');

      if (result.kind !== 'word') throw new Error('expected word result');
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

      const result = await service.analyze('fast');

      if (result.kind !== 'word') throw new Error('expected word result');
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
        kind: 'word',
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

      const result = await service.analyze('hmm');

      if (result.kind !== 'word') throw new Error('expected word result');
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

      const result = await service.analyze('walked');

      if (result.kind !== 'word') throw new Error('expected word result');
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

      const result = await service.analyze('walked');

      if (result.kind !== 'word') throw new Error('expected word result');
      expect(result.lemma).toBe('walk');
    });
  });

  // -------------------------------------------------------------------------
  // Language param and extraForms (Spanish, German)
  // -------------------------------------------------------------------------

  describe('analyze() — word language param and extraForms', () => {
    it('defaults to language=en in the request URL when language is omitted', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('walked');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('language')).toBe('en');
    });

    it('appends language=es to the request URL when language is "es"', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('corro', undefined, 'es');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('text')).toBe('corro');
      expect(url.searchParams.get('language')).toBe('es');
    });

    it('appends language=de to the request URL when language is "de"', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('laufe', undefined, 'de');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('language')).toBe('de');
    });

    it('maps extra_forms from the NLP response into NlpAnalysis.extraForms for Spanish', async () => {
      const response = makeVerbResponse();
      response.tokens[0].extra_forms = {
        indicative_present_yo: 'corro',
        indicative_preterite_yo: 'corrí',
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze('corro', undefined, 'es');

      if (result.kind !== 'word') throw new Error('expected word result');
      expect(result.extraForms).toEqual({
        indicative_present_yo: 'corro',
        indicative_preterite_yo: 'corrí',
      });
    });

    it('maps extra_forms from the NLP response into NlpAnalysis.extraForms for German', async () => {
      const response = makeVerbResponse();
      response.tokens[0].extra_forms = {
        present_ich: 'laufe',
        present_du: 'läufst',
        partizip_ii: 'gelaufen',
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze('laufe', undefined, 'de');

      if (result.kind !== 'word') throw new Error('expected word result');
      expect(result.extraForms).toEqual({
        present_ich: 'laufe',
        present_du: 'läufst',
        partizip_ii: 'gelaufen',
      });
    });

    it('extraForms is null when the NLP response omits extra_forms (English)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      const result = await service.analyze('walked');

      if (result.kind !== 'word') throw new Error('expected word result');
      expect(result.extraForms).toBeNull();
    });

    it('extraForms is null when the NLP response sets extra_forms to null', async () => {
      const response = makeVerbResponse();
      response.tokens[0].extra_forms = null;

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze('walked');

      if (result.kind !== 'word') throw new Error('expected word result');
      expect(result.extraForms).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error cases — word responses
  // -------------------------------------------------------------------------

  describe('analyze() — word error cases', () => {
    it('non-2xx response throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue(''),
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure (fetch throws) throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure wraps original error as cause', async () => {
      const cause = new Error('ECONNREFUSED');
      const mockFetch = jest.fn().mockRejectedValue(cause);
      global.fetch = mockFetch as unknown as typeof fetch;

      const err = await service.analyze('walk').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NlpUnavailableError);
      const failure = (err as NlpUnavailableError).cause;
      expect(failure).toBeInstanceOf(RequestFailure);
      expect((failure as RequestFailure).kind).toBe('network');
      expect((failure as RequestFailure).cause).toBe(cause);
    });

    it('word body with empty tokens array throws NlpUnavailableError', async () => {
      const response: NlpWordResponse = {
        kind: 'word',
        input_text: 'walk',
        is_multi_word: false,
        tokens: [],
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('correct Authorization header is sent with Basic credentials', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.analyze('walk');

      const expectedCredentials = Buffer.from('user:pass').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analyze?text=walk'),
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

      await service.analyze('saw', 'The saw was sharp enough to cut oak');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.pathname).toBe('/analyze');
      expect(url.searchParams.get('text')).toBe('saw');
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

      await service.analyze('walk', '   ');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('text')).toBe('walk');
      expect(url.searchParams.has('input_text')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Error cases — input validation (400 / 422)
  // -------------------------------------------------------------------------

  describe('analyze() — input validation errors', () => {
    it('400 response throws NlpInputInvalidError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(''),
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('a b c d e f g')).rejects.toBeInstanceOf(
        NlpInputInvalidError,
      );
    });

    it('422 response throws NlpInputInvalidError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: jest.fn().mockResolvedValue(''),
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('xyzzy')).rejects.toBeInstanceOf(
        NlpInputInvalidError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Happy paths — expression responses
  // -------------------------------------------------------------------------

  describe('analyze() — expression happy paths', () => {
    it('maps canonical, kind, and headLemma from the NLP response', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze('ran into');

      if (result.kind === 'word') throw new Error('expected expression result');
      expect(result.canonical).toBe('run into');
      expect(result.kind).toBe('phrasal_verb');
      expect(result.headLemma).toBe('run');
      expect(result.contextMatch).toBeNull();
    });

    it('maps kind "expression" from the NLP response', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeExpressionResponse({
              input_text: 'kick the bucket',
              canonical: 'kick the bucket',
              kind: 'expression',
              head_lemma: 'kick',
            }),
          ),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze('kick the bucket');

      expect(result.kind).toBe('expression');
    });

    it('maps context_match to contextMatch when context is provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeExpressionResponse({
              context_match: {
                found: true,
                matched_text: 'ran into',
                start: 5,
                end: 13,
                confidence: 'high',
              },
            }),
          ),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze(
        'ran into',
        'I ran into an old friend.',
      );

      if (result.kind === 'word') throw new Error('expected expression result');
      expect(result.contextMatch).toEqual({
        found: true,
        matchedText: 'ran into',
        confidence: 'high',
      });
    });

    it('contextMatch is null when the NLP response omits context_match', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const result = await service.analyze('ran into');

      if (result.kind === 'word') throw new Error('expected expression result');
      expect(result.contextMatch).toBeNull();
    });

    it('sends the expression as a query parameter to /analyze', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.pathname).toBe('/analyze');
      expect(url.searchParams.get('text')).toBe('ran into');
      expect(url.searchParams.has('input_text')).toBe(false);
    });

    it('sends context as input_text query parameter when provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into', 'I ran into an old friend.');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('input_text')).toBe(
        'I ran into an old friend.',
      );
    });

    it('sends correct Basic auth Authorization header', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await service.analyze('ran into');

      const expectedCredentials = Buffer.from('user:pass').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analyze?text=ran'),
        expect.objectContaining({
          headers: { Authorization: `Basic ${expectedCredentials}` },
        }),
      );
    });
  });

  describe('analyze() — expression language param', () => {
    it('defaults to language=en in the request URL when language is omitted', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('language')).toBe('en');
    });

    it('appends language=es to the request URL when language is "es"', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('darse cuenta', undefined, 'es');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('text')).toBe('darse cuenta');
      expect(url.searchParams.get('language')).toBe('es');
    });

    it('appends language=de to the request URL when language is "de"', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('Bescheid geben', undefined, 'de');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.get('language')).toBe('de');
    });
  });

  describe('analyze() — expression error cases', () => {
    it('400 response throws NlpInputInvalidError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(''),
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('a b c d e f g')).rejects.toBeInstanceOf(
        NlpInputInvalidError,
      );
    });

    it('non-400, non-2xx response throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: jest.fn().mockResolvedValue(''),
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('ran into')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure (fetch throws) throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch as unknown as typeof fetch;

      await expect(service.analyze('ran into')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure wraps original error as cause', async () => {
      const cause = new Error('ECONNREFUSED');
      const mockFetch = jest.fn().mockRejectedValue(cause);
      global.fetch = mockFetch as unknown as typeof fetch;

      const err = await service.analyze('ran into').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NlpUnavailableError);
      const failure = (err as NlpUnavailableError).cause;
      expect(failure).toBeInstanceOf(RequestFailure);
      expect((failure as RequestFailure).kind).toBe('network');
      expect((failure as RequestFailure).cause).toBe(cause);
    });

    it('blank context is omitted from the NLP request', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into', '   ');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.searchParams.has('input_text')).toBe(false);
    });
  });
});
