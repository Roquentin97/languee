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
  NlpExpressionMatch,
  NlpExpressionMatchInput,
  NlpExpressionMatchResponse,
  NlpSelectionAnalysisResponse,
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
import type { CaptureRange } from '../../../learning/capture/capture-ranges';

export const NLP_READY_TIMEOUT_MS = 2_000;
export const NLP_EXPRESSION_MATCH_TIMEOUT_MS = 2_000;

function mapSelectionAnalysis(selection: NlpSelectionAnalysisResponse | null) {
  return selection
    ? {
        headLemma: selection.head_lemma,
        pos: selection.pos,
        headRange: selection.head_range,
      }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCaptureRange(value: unknown): value is CaptureRange {
  if (!isRecord(value)) return false;
  return (
    typeof value.start === 'number' &&
    Number.isSafeInteger(value.start) &&
    value.start >= 0 &&
    typeof value.end === 'number' &&
    Number.isSafeInteger(value.end) &&
    value.end > value.start
  );
}

function isNlpExpressionMatch(value: unknown): value is NlpExpressionMatch {
  if (!isRecord(value) || !Array.isArray(value.component_ranges)) return false;
  return (
    typeof value.entry_id === 'string' &&
    typeof value.canonical_text === 'string' &&
    typeof value.surface_text === 'string' &&
    value.component_ranges.every(isCaptureRange)
  );
}

function isNlpExpressionMatchResponse(
  value: unknown,
): value is NlpExpressionMatchResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.matches) &&
    value.matches.every(isNlpExpressionMatch)
  );
}

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
      propagateCorrelation: true,
      timeoutMs: NLP_READY_TIMEOUT_MS,
    });
  }

  async analyze(
    text: string,
    context?: string,
    language = 'en',
    selectionRanges?: CaptureRange[],
  ): Promise<NlpAnalyzeResult> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.request',
      method: this.analyze.name,
      data: {
        textBytes: Buffer.byteLength(text, 'utf8'),
        language,
        hasContext: Boolean(context?.trim()),
        contextBytes:
          context === undefined ? 0 : Buffer.byteLength(context, 'utf8'),
        selectionRangeCount: selectionRanges?.length ?? 0,
      },
    });

    const start = Date.now();
    const body = await this.requestAnalysis(
      text,
      context,
      language,
      selectionRanges,
    );
    const durationMs = Date.now() - start;

    return this.mapAnalysis(body, text, language, durationMs);
  }

  private async requestAnalysis(
    text: string,
    context: string | undefined,
    language: string,
    selectionRanges?: CaptureRange[],
  ): Promise<NlpAnalyzeResponse> {
    const body: Record<string, unknown> = { text, language };
    if (context?.trim()) body.input_text = context;
    if (selectionRanges?.length) body.selection_ranges = selectionRanges;
    return this.protectedRequest<NlpAnalyzeResponse>(
      'analyze',
      undefined,
      body,
      {},
      text,
    );
  }

  async matchExpressions(
    input: NlpExpressionMatchInput,
  ): Promise<NlpExpressionMatch[]> {
    const response = await this.protectedRequest<unknown>(
      'match-expressions',
      undefined,
      input,
      {
        operation: 'nlp expression matching',
        timeoutMs: NLP_EXPRESSION_MATCH_TIMEOUT_MS,
      },
    );
    if (!isNlpExpressionMatchResponse(response)) {
      throw new NlpUnavailableError(
        new Error('NLP expression matcher returned an invalid response'),
      );
    }
    return response.matches;
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
      propagateCorrelation: true,
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
            data: {
              textBytes: Buffer.byteLength(analysisText, 'utf8'),
              status: err.status,
            },
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
    if (
      typeof body.model_version !== 'string' ||
      body.model_version.trim().length === 0
    )
      throw new NlpUnavailableError(
        new Error('NLP analysis omitted model version'),
      );
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
        textBytes: Buffer.byteLength(text, 'utf8'),
        language,
        canonicalBytes: Buffer.byteLength(body.canonical, 'utf8'),
        kind: body.kind,
        hasContext: Boolean(contextMatch),
      },
    });

    return {
      kind: body.kind,
      canonical: body.canonical,
      headLemma: body.head_lemma,
      modelVersion: body.model_version,
      contextMatch,
      selectionAnalysis: mapSelectionAnalysis(body.selection_analysis),
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
        textBytes: Buffer.byteLength(text, 'utf8'),
        language,
        lemmaBytes: Buffer.byteLength(token.lemma, 'utf8'),
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
      selectionAnalysis: mapSelectionAnalysis(body.selection_analysis),
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
