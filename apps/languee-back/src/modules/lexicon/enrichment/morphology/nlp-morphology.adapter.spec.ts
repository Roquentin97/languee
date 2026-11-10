import { ConfigService } from '@nestjs/config';
import {
  RequestFailure,
  RequestService,
} from '../../../system/core/http/request.service';
import { NlpService } from '../nlp/nlp.service';
import { NlpInputInvalidError, NlpUnavailableError } from '../nlp/nlp.errors';
import { PartOfSpeech } from '../../types/part-of-speech.enum';

describe('NlpService morphology HTTP contract', () => {
  const getJson = jest.fn();
  const postJson = jest.fn();
  const config = new ConfigService({
    nlp: {
      baseUrl: 'http://nlp',
      basicAuthLogin: 'user',
      basicAuthPassword: 'pass',
    },
  });
  const adapter = new NlpService(
    { getJson, postJson } as unknown as RequestService,
    config,
  );
  beforeEach(() => jest.resetAllMocks());
  it('authenticates without invoking contextual analysis', async () => {
    const candidates = [
      { lemma: 'well', partOfSpeech: 'adverb' },
      { lemma: 'good', partOfSpeech: 'adjective' },
    ];
    getJson.mockResolvedValue(candidates);
    expect(await adapter.findLemmaCandidates('BETTER', 'en')).toEqual(
      candidates,
    );
    expect(getJson).toHaveBeenCalledWith(
      'http://nlp/morphology/lemmas?text=better&language=en',
      expect.objectContaining({
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      }),
    );
  });
  it('keeps all spellings and grammatical types', async () => {
    const forms = [
      { form: 'was', formType: 'past' },
      { form: 'were', formType: 'past' },
    ];
    getJson.mockResolvedValue(forms);
    expect(await adapter.getInflections('be', PartOfSpeech.VERB, 'en')).toEqual(
      forms,
    );
  });
  it.each([null, {}, [{ form: 'x', formType: 'unknown' }]])(
    'rejects malformed payload %s',
    async (payload) => {
      getJson.mockResolvedValue(payload);
      await expect(
        adapter.getInflections('be', PartOfSpeech.VERB, 'en'),
      ).rejects.toBeInstanceOf(NlpUnavailableError);
    },
  );
  it('maps input rejection and outages separately', async () => {
    getJson.mockRejectedValueOnce(new RequestFailure('http', 'bad', 400));
    await expect(adapter.findLemmaCandidates('x', 'fr')).rejects.toBeInstanceOf(
      NlpInputInvalidError,
    );
    getJson.mockRejectedValueOnce(new RequestFailure('http', 'outage', 503));
    await expect(adapter.findLemmaCandidates('x', 'en')).rejects.toBeInstanceOf(
      NlpUnavailableError,
    );
  });
  it('deduplicates and chunks batch requests and preserves empty paradigms', async () => {
    postJson.mockImplementation(
      (
        _url: string,
        body: { entries: { lemma: string; partOfSpeech: PartOfSpeech }[] },
      ) =>
        Promise.resolve({
          results: body.entries.map((entry) => ({ ...entry, forms: [] })),
        }),
    );
    const entries = Array.from({ length: 101 }, (_, i) => ({
      lemma: `word${i}`,
      partOfSpeech: PartOfSpeech.NOUN,
    }));
    const result = await adapter.getInflectionsBatch(
      [...entries, entries[0]],
      'en',
    );
    expect(result).toHaveLength(101);
    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson.mock.calls[0][1].entries).toHaveLength(100);
    expect(postJson.mock.calls[1][1].entries).toHaveLength(1);
    expect(postJson.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        timeoutMs: 10000,
        operation: 'nlp inflections batch',
      }),
    );
  });
  it('rejects missing and malformed batch results', async () => {
    postJson.mockResolvedValue({ results: [] });
    await expect(
      adapter.getInflectionsBatch(
        [{ lemma: 'go', partOfSpeech: PartOfSpeech.VERB }],
        'en',
      ),
    ).rejects.toBeInstanceOf(NlpUnavailableError);
  });
});

it('does not request inflections for unsupported parts of speech', async () => {
  const getJson = jest.fn();
  const service = new NlpService(
    { getJson } as unknown as RequestService,
    new ConfigService(),
  );
  await expect(
    service.getInflections('the', PartOfSpeech.PRONOUN, 'en'),
  ).resolves.toEqual([]);
  expect(getJson).not.toHaveBeenCalled();
});
