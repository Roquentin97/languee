import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RequestFailure,
  RequestService,
} from '../../../system/core/http/request.service';
import { NlpInputInvalidError, NlpUnavailableError } from './nlp.errors';
import type {
  NlpAnalyzeResponse,
  NlpAnalyzeResult,
  NlpTokenForms,
} from './nlp.interfaces';
import { mapSpacyPos } from './mappers/spacy-pos.mapper';
import { PartOfSpeech } from '../../types/part-of-speech.enum';
import {
  INFLECTION_TYPES,
  normalizeSpelling,
} from '../morphology/morphology-provider';
import type {
  LemmaCandidate,
  InflectionForm,
  InflectionResult,
} from '../morphology/morphology-provider';
import type { InflectionForms } from '../../types/inflection-forms.types';

export const NLP_READY_TIMEOUT_MS = 2_000;

@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);

  constructor(
    private readonly request: RequestService,
    private readonly configService: ConfigService,
  ) {}

  async checkReady(): Promise<void> {
    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const readyUrl = new URL('ready', `${baseUrl}/`).toString();

    await this.request.send(readyUrl, {
      target: 'nlp',
      timeoutMs: NLP_READY_TIMEOUT_MS,
    });
  }

  async analyze(
    text: string,
    context?: string,
    language = 'en',
    selection?: { start: number; end: number },
  ): Promise<NlpAnalyzeResult> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.request',
      method: this.analyze.name,
      data: { text, language, hasContext: Boolean(context?.trim()) },
    });

    const start = Date.now();
    const body = await this.requestAnalysis(text, context, language, selection);
    const durationMs = Date.now() - start;

    return this.mapAnalysis(body, text, language, durationMs);
  }

  private async requestAnalysis(
    text: string,
    context: string | undefined,
    language: string,
    selection?: { start: number; end: number },
  ): Promise<NlpAnalyzeResponse> {
    const params: Record<string, string> = { text, language };
    if (context?.trim()) params.input_text = context;
    if (selection) {
      params.selection_start = String(selection.start);
      params.selection_end = String(selection.end);
    }
    return this.protectedRequest<NlpAnalyzeResponse>(
      'analyze',
      params,
      undefined,
      {},
      text,
    );
  }

  private async protectedRequest<T>(
    path: string,
    params?: Record<string, string>,
    body?: unknown,
    options: { operation?: string; timeoutMs?: number } = {},
    analysisText?: string,
  ): Promise<T> {
    const base = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );
    const url = `${base}/${path}${params ? `?${new URLSearchParams(params)}` : ''}`;
    const requestOptions = {
      target: 'nlp' as const,
      ...options,
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
      },
    };
    try {
      return body === undefined
        ? await this.request.getJson<T>(url, requestOptions)
        : await this.request.postJson<T>(url, body, requestOptions);
    } catch (err: unknown) {
      if (
        err instanceof RequestFailure &&
        (err.status === 400 || err.status === 422)
      ) {
        if (analysisText !== undefined)
          this.logger.warn({
            message: 'input rejected',
            event: 'nlp.input_invalid',
            method: this.analyze.name,
            data: { text: analysisText, status: err.status },
          });
        throw new NlpInputInvalidError();
      }
      throw new NlpUnavailableError(err);
    }
  }

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
    const body = await this.protectedRequest<unknown>(
      'morphology/inflections/batch',
      undefined,
      { language, entries },
      { operation: 'nlp inflections batch', timeoutMs: 10000 },
    );
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
    return this.protectedRequest<unknown>(
      `morphology/${operation}`,
      params,
      undefined,
      { operation: `nlp ${operation}`, timeoutMs: 10000 },
    );
  }

  private mapAnalysis(
    body: NlpAnalyzeResponse,
    text: string,
    language: string,
    durationMs: number,
  ): NlpAnalyzeResult {
    if (body.kind === 'word')
      return this.mapWord(body, text, language, durationMs);

    const contextMatch = body.context_match
      ? {
          found: body.context_match.found,
          matchedText: body.context_match.matched_text,
          confidence: body.context_match.confidence,
        }
      : null;

    this.logger.log({
      message: 'expression analyzed',
      event: 'nlp.expression_analyzed',
      method: this.analyze.name,
      duration_ms: durationMs,
      data: {
        text,
        language,
        canonical: body.canonical,
        kind: body.kind,
        headLemma: body.head_lemma,
      },
    });

    return {
      kind: body.kind,
      canonical: body.canonical,
      headLemma: body.head_lemma,
      contextMatch,
    };
  }

  private mapWord(
    body: Extract<NlpAnalyzeResponse, { kind: 'word' }>,
    text: string,
    language: string,
    durationMs: number,
  ): NlpAnalyzeResult {
    const token = body.tokens[0];
    if (!token) {
      throw new NlpUnavailableError(
        new Error('NLP word analysis returned no tokens'),
      );
    }

    const inflectionForms = this.buildInflectionForms(token.pos, token.forms);

    this.logger.log({
      message: 'word analyzed',
      event: 'nlp.word_analyzed',
      method: this.analyze.name,
      duration_ms: durationMs,
      data: {
        text,
        language,
        lemma: token.lemma,
        pos: token.pos,
        isIrregular: token['is_irregular'],
      },
    });

    return {
      kind: 'word',
      lemma: token.lemma,
      pos: mapSpacyPos(token.pos),
      rawPos: token.pos,
      modelVersion: body.model_version,
      isIrregular: token['is_irregular'],
      inflectionForms,
    };
  }

  private buildInflectionForms(
    pos: string,
    forms: NlpTokenForms,
  ): InflectionForms | null {
    if (pos === 'VERB') {
      const compact = this.compactRecord({
        base: forms['verb_base'],
        past: forms['verb_past'],
        gerundParticiple: forms['verb_gerund_participle'],
        pastParticiple: forms['verb_past_participle'],
        presentNon3sg: forms['verb_present_non_3sg'],
        present3sg: forms['verb_present_3sg'],
      });
      if (!compact.base) return null;
      this.logInflectionForms(pos, compact);
      return { type: 'verb', ...compact } as InflectionForms;
    }

    if (pos === 'NOUN') {
      const compact = this.compactRecord({
        singular: forms['noun_singular'],
        plural: forms['noun_plural'],
      });
      if (Object.keys(compact).length === 0) return null;
      this.logInflectionForms(pos, compact);
      return { type: 'noun', ...compact };
    }

    if (pos === 'ADJ' || pos === 'ADV') {
      const compact = this.compactRecord({
        positive: forms['adj_positive'],
        comparative: forms['adj_comparative'],
        superlative: forms['adj_superlative'],
      });
      if (!compact.positive) return null;
      this.logInflectionForms(pos, compact);
      return { type: 'adjective', ...compact } as InflectionForms;
    }

    return null;
  }

  private logInflectionForms(pos: string, forms: Record<string, string>): void {
    this.logger.debug({
      message: 'inflection forms built',
      event: 'nlp.inflection_forms_built',
      method: this.buildInflectionForms.name,
      data: { pos, formKeys: Object.keys(forms) },
    });
  }

  private compactRecord(
    source: Record<string, string | null>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
      if (value !== null) {
        result[key] = value;
      }
    }
    return result;
  }
}
