import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestFailure, RequestService } from '../core/http/request.service';
import { NlpInputInvalidError, NlpUnavailableError } from '../nlp/nlp.errors';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';
import { INFLECTION_TYPES, normalizeSpelling } from './morphology-provider';
import type {
  MorphologyProvider,
  LemmaCandidate,
  InflectionForm,
} from './morphology-provider';

@Injectable()
export class NlpMorphologyAdapter implements MorphologyProvider {
  constructor(
    private readonly request: RequestService,
    private readonly config: ConfigService,
  ) {}

  async findLemmaCandidates(
    surface: string,
    language: string,
  ): Promise<LemmaCandidate[]> {
    const body = await this.call('lemmas', {
      text: normalizeSpelling(surface),
      language,
    });
    if (
      !Array.isArray(body) ||
      !body.every(
        (x: LemmaCandidate) =>
          typeof x?.lemma === 'string' &&
          Object.values(PartOfSpeech).includes(x.partOfSpeech),
      )
    )
      throw new NlpUnavailableError();
    return body as LemmaCandidate[];
  }

  async getInflections(
    lemma: string,
    partOfSpeech: PartOfSpeech,
    language: string,
  ): Promise<InflectionForm[]> {
    if (
      ![
        PartOfSpeech.NOUN,
        PartOfSpeech.VERB,
        PartOfSpeech.ADJECTIVE,
        PartOfSpeech.ADVERB,
      ].includes(partOfSpeech)
    )
      return [];
    const body = await this.call('inflections', {
      text: normalizeSpelling(lemma),
      partOfSpeech,
      language,
    });
    if (
      !Array.isArray(body) ||
      !body.every(
        (x: InflectionForm) =>
          typeof x?.form === 'string' && INFLECTION_TYPES.includes(x.formType),
      )
    )
      throw new NlpUnavailableError();
    return body as InflectionForm[];
  }

  private async call(
    operation: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const base = this.config.getOrThrow<string>('nlp.baseUrl');
    const login = this.config.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.config.getOrThrow<string>('nlp.basicAuthPassword');
    try {
      return await this.request.getJson<unknown>(
        `${base}/morphology/${operation}?${new URLSearchParams(params)}`,
        {
          target: 'nlp',
          headers: {
            Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
          },
        },
      );
    } catch (err: unknown) {
      if (err instanceof RequestFailure && [400, 422].includes(err.status ?? 0))
        throw new NlpInputInvalidError();
      throw new NlpUnavailableError(err);
    }
  }
}
