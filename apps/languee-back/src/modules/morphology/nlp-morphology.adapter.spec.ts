import { ConfigService } from '@nestjs/config';
import { RequestFailure, RequestService } from '../core/http/request.service';
import { NlpMorphologyAdapter } from './nlp-morphology.adapter';
import { NlpInputInvalidError, NlpUnavailableError } from '../nlp/nlp.errors';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';

describe('NlpMorphologyAdapter HTTP contract', () => {
  const getJson = jest.fn();
  const config = new ConfigService({
    nlp: {
      baseUrl: 'http://nlp',
      basicAuthLogin: 'user',
      basicAuthPassword: 'pass',
    },
  });
  const adapter = new NlpMorphologyAdapter(
    { getJson } as unknown as RequestService,
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
});
