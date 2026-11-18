import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { NlpInputInvalidError, NlpUnavailableError } from './nlp.errors';
import { NlpService } from './nlp.service';
import {
  NLP_EXPRESSION_MATCH_TIMEOUT_MS,
  NLP_READY_TIMEOUT_MS,
} from './nlp.service';
import type { NlpExpressionResponse, NlpWordResponse } from './nlp.interfaces';
import { PartOfSpeech } from '../../types/part-of-speech.enum';
import {
  RequestFailure,
  RequestService,
} from '../../../system/core/http/request.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerbResponse(
  overrides: Partial<NlpWordResponse> = {},
): NlpWordResponse {
  return {
    kind: 'word',
    input_text: 'walk',
    selection_analysis: null,
    model_version: 'en_core_web_md@3.8.0',
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
    model_version: 'en_core_web_md@3.8.0',
    selection_analysis: null,
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
    model_version: 'en_core_web_md@3.8.0',
    selection_analysis: null,
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
    selection_analysis: null,
    model_version: 'en_core_web_md@3.8.0',
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

function getFirstFetchBody(
  mockFetch: jest.MockedFunction<typeof fetch>,
): Record<string, unknown> {
  const [, init] = mockFetch.mock.lastCall ?? [];
  if (!init || typeof init.body !== 'string') {
    throw new Error('Expected fetch to send a JSON body');
  }
  const parsed: unknown = JSON.parse(init.body);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object body');
  }
  return parsed as Record<string, unknown>;
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('checkReady()', () => {
    it('checks the NLP readiness endpoint with a bounded timeout', async () => {
      const send = jest
        .spyOn(RequestService.prototype, 'send')
        .mockResolvedValue({} as Response);

      await service.checkReady();

      expect(send).toHaveBeenCalledWith('http://nlp-service:8001/ready', {
        target: 'nlp',
        timeoutMs: NLP_READY_TIMEOUT_MS,
      });
    });
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
      expect(result.rawPos).toBe('VERB');
      expect(result.modelVersion).toBe('en_core_web_md@3.8.0');
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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
        model_version: 'en_core_web_md@3.8.0',
        selection_analysis: null,
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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

      const result = await service.analyze('walked');

      if (result.kind !== 'word') throw new Error('expected word result');
      expect(result.lemma).toBe('walk');
    });
  });

  // -------------------------------------------------------------------------
  // Language param forwarding
  // -------------------------------------------------------------------------

  describe('analyze() — language param', () => {
    it('defaults to language=en in the request body when language is omitted', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('walked');

      expect(getFirstFetchUrl(mockFetch).pathname).toBe('/analyze');
      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        text: 'walked',
        language: 'en',
      });
    });

    it('forwards an explicit language param unchanged (NLP owns validity)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('walked', undefined, 'fr');

      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        text: 'walked',
        language: 'fr',
      });
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
      global.fetch = mockFetch;

      await expect(service.analyze('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure (fetch throws) throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch;

      await expect(service.analyze('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure wraps original error as cause', async () => {
      const cause = new Error('ECONNREFUSED');
      const mockFetch = jest.fn().mockRejectedValue(cause);
      global.fetch = mockFetch;

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
        model_version: 'en_core_web_md@3.8.0',
        selection_analysis: null,
        is_multi_word: false,
        tokens: [],
      };

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch;

      await expect(service.analyze('walk')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('correct Authorization header is sent with Basic credentials', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      });
      global.fetch = mockFetch;

      await service.analyze('walk');

      const expectedCredentials = Buffer.from('user:pass').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analyze'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedCredentials}`,
          }),
          method: 'POST',
        }),
      );
    });

    it('context is sent as input_text in the POST body when provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      });
      global.fetch = mockFetch;

      await service.analyze('saw', 'The saw was sharp enough to cut oak');

      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        text: 'saw',
        input_text: 'The saw was sharp enough to cut oak',
      });
    });

    it('forwards explicit occurrence ranges to NLP', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeNounResponse()),
      });
      global.fetch = mockFetch;
      await service.analyze('saw', 'I saw the saw.', 'en', [
        { start: 10, end: 13 },
      ]);
      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        text: 'saw',
        input_text: 'I saw the saw.',
        selection_ranges: [{ start: 10, end: 13 }],
      });
    });

    it('blank context is omitted from the NLP request', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeVerbResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('walk', '   ');

      expect(getFirstFetchBody(mockFetch)).toMatchObject({ text: 'walk' });
      expect(getFirstFetchBody(mockFetch)).not.toHaveProperty('input_text');
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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

      const result = await service.analyze('ran into');

      if (result.kind === 'word') throw new Error('expected expression result');
      expect(result.contextMatch).toBeNull();
    });

    it('sends the expression in the POST body to /analyze', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into');

      const url = getFirstFetchUrl(mockFetch);
      expect(url.pathname).toBe('/analyze');
      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        text: 'ran into',
        language: 'en',
      });
      expect(url.search).toBe('');
    });

    it('sends context as input_text in the POST body when provided', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into', 'I ran into an old friend.');

      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        input_text: 'I ran into an old friend.',
      });
    });

    it('sends correct Basic auth Authorization header', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      });
      global.fetch = mockFetch;

      await service.analyze('ran into');

      const expectedCredentials = Buffer.from('user:pass').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/analyze'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedCredentials}`,
          }),
          method: 'POST',
        }),
      );
    });
  });

  describe('analyze() — expression language param', () => {
    it('defaults to language=en in the request body when language is omitted', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('ran into');

      expect(getFirstFetchBody(mockFetch)).toMatchObject({ language: 'en' });
    });

    it('forwards a caller-provided language verbatim instead of defaulting to en', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeExpressionResponse()),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await service.analyze('darse cuenta', undefined, 'es');

      expect(getFirstFetchBody(mockFetch)).toMatchObject({
        text: 'darse cuenta',
        language: 'es',
      });
    });
  });

  describe('analyze() — expression error cases', () => {
    it('rejects expression responses that omit the NLP model version', async () => {
      const response: Record<string, unknown> = {
        ...makeExpressionResponse(),
      };
      delete response['model_version'];
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(response),
      });
      global.fetch = mockFetch;

      await expect(service.analyze('ran into')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('400 response throws NlpInputInvalidError', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue(''),
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch;

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
      global.fetch = mockFetch;

      await expect(service.analyze('ran into')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure (fetch throws) throws NlpUnavailableError', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      global.fetch = mockFetch;

      await expect(service.analyze('ran into')).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
    });

    it('network failure wraps original error as cause', async () => {
      const cause = new Error('ECONNREFUSED');
      const mockFetch = jest.fn().mockRejectedValue(cause);
      global.fetch = mockFetch;

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

      expect(getFirstFetchBody(mockFetch)).not.toHaveProperty('input_text');
    });
  });

  describe('matchExpressions()', () => {
    const input = {
      language: 'en',
      input_text: 'Please turn the device off.',
      selected_verb_range: { start: 7, end: 11 },
      candidates: [{ entry_id: 'entry-id', canonical_text: 'turn off' }],
    };

    it('posts the matcher contract with a two-second timeout and returns matches', async () => {
      const match = {
        entry_id: 'entry-id',
        canonical_text: 'turn off',
        surface_text: 'turn off',
        component_ranges: [
          { start: 7, end: 11 },
          { start: 23, end: 26 },
        ],
      };
      const postJson = jest
        .spyOn(RequestService.prototype, 'postJson')
        .mockResolvedValue({ matches: [match] });

      await expect(service.matchExpressions(input)).resolves.toEqual([match]);

      expect(postJson).toHaveBeenCalledWith(
        'http://nlp-service:8001/match-expressions',
        input,
        expect.objectContaining({
          timeoutMs: NLP_EXPRESSION_MATCH_TIMEOUT_MS,
          operation: 'nlp expression matching',
        }),
      );
      expect(postJson).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed matcher responses so the optional caller can omit suggestions', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ matches: [{ entry_id: 'bad' }] }),
      }) as jest.MockedFunction<typeof fetch>;
      global.fetch = mockFetch;

      await expect(service.matchExpressions(input)).rejects.toBeInstanceOf(
        NlpUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
