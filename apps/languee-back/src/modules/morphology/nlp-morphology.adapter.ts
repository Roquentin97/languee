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
  InflectionResult,
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

  async getInflectionsBatch(
    entries: LemmaCandidate[],
    language: string,
  ): Promise<InflectionResult[]> {
    const supported = [
      PartOfSpeech.NOUN,
      PartOfSpeech.VERB,
      PartOfSpeech.ADJECTIVE,
      PartOfSpeech.ADVERB,
    ];
    const unique = new Map(
      entries.map((entry) => {
        const item = {
          lemma: normalizeSpelling(entry.lemma),
          partOfSpeech: entry.partOfSpeech,
        };
        return [JSON.stringify([item.lemma, item.partOfSpeech]), item];
      }),
    );
    const items = [...unique.values()];
    const results: InflectionResult[] = [];
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      const requested = chunk.filter((entry) =>
        supported.includes(entry.partOfSpeech),
      );
      const found = requested.length
        ? await this.callBatch(requested, language)
        : [];
      const byKey = new Map(
        found.map((entry) => [
          JSON.stringify([entry.lemma, entry.partOfSpeech]),
          entry,
        ]),
      );
      for (const item of chunk) {
        const result = byKey.get(
          JSON.stringify([item.lemma, item.partOfSpeech]),
        );
        if (supported.includes(item.partOfSpeech) && !result)
          throw new NlpUnavailableError();
        results.push(result ?? { ...item, forms: [] });
      }
    }
    return results;
  }

  private async callBatch(
    entries: LemmaCandidate[],
    language: string,
  ): Promise<InflectionResult[]> {
    const base = this.config.getOrThrow<string>('nlp.baseUrl');
    const login = this.config.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.config.getOrThrow<string>('nlp.basicAuthPassword');
    let body: unknown;
    try {
      body = await this.request.postJson<unknown>(
        `${base}/morphology/inflections/batch`,
        { language, entries },
        {
          target: 'nlp',
          operation: 'nlp inflections batch',
          timeoutMs: 10000,
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
    const results = (body as { results?: unknown } | null)?.results;
    if (
      !Array.isArray(results) ||
      results.length !== entries.length ||
      !results.every(
        (x: InflectionResult, i: number) =>
          x?.lemma === entries[i]?.lemma &&
          x.partOfSpeech === entries[i]?.partOfSpeech &&
          Array.isArray(x.forms) &&
          x.forms.every(
            (f) =>
              typeof f?.form === 'string' &&
              f.form.trim().length > 0 &&
              !/\s/.test(f.form.trim()) &&
              INFLECTION_TYPES.includes(f.formType),
          ),
      )
    )
      throw new NlpUnavailableError();
    return results as InflectionResult[];
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
          operation: `nlp ${operation}`,
          timeoutMs: 10000,
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
