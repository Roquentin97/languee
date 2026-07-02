import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  NlpExpressionInvalidError,
  NlpMultiWordError,
  NlpUnavailableError,
} from './nlp.errors';
import type {
  NlpAnalysis,
  NlpExpressionAnalysis,
  NlpExpressionResponse,
  NlpTokenForms,
  NlpWordResponse,
} from './nlp.interfaces';
import { mapSpacyPos } from './mappers/spacy-pos.mapper';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

@Injectable()
export class NlpService {
  private readonly logger = new Logger(NlpService.name);

  constructor(private readonly configService: ConfigService) {}

  async analyzeWord(word: string, context?: string): Promise<NlpAnalysis> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.request',
      method: this.analyzeWord.name,
      data: { word, hasContext: Boolean(context?.trim()) },
    });

    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const params = new URLSearchParams({ word });
    if (context?.trim()) {
      params.set('input_text', context);
    }

    let response: Response;
    const start = Date.now();
    try {
      response = await fetch(`${baseUrl}/words?${params.toString()}`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
    } catch (err: unknown) {
      const span = trace.getActiveSpan();
      if (err instanceof Error) {
        span?.recordException(err);
      }
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'NLP service unavailable',
      });
      throw new NlpUnavailableError(err);
    }

    if (!response.ok) {
      trace.getActiveSpan()?.addEvent('nlp.response_error', {
        'http.status_code': response.status,
      });
      trace.getActiveSpan()?.setStatus({
        code: SpanStatusCode.ERROR,
        message: `NLP HTTP ${response.status}`,
      });
      throw new NlpUnavailableError();
    }

    const body = (await response.json()) as NlpWordResponse;

    if (body['is_multi_word'] || body.tokens.length !== 1) {
      trace.getActiveSpan()?.addEvent('nlp.multi_word_rejected', { word });
      this.logger.warn({
        message: 'multi-word input rejected',
        event: 'nlp.multi_word_rejected',
        method: this.analyzeWord.name,
        data: { word, tokenCount: body.tokens.length },
      });
      throw new NlpMultiWordError();
    }

    const token = body.tokens[0];
    const inflectionForms = this.buildInflectionForms(token.pos, token.forms);
    const durationMs = Date.now() - start;

    this.logger.log({
      message: 'word analyzed',
      event: 'nlp.word_analyzed',
      method: this.analyzeWord.name,
      duration_ms: durationMs,
      data: {
        word,
        lemma: token.lemma,
        pos: token.pos,
        isIrregular: token['is_irregular'],
      },
    });

    return {
      lemma: token.lemma,
      pos: mapSpacyPos(token.pos),
      isIrregular: token['is_irregular'],
      inflectionForms,
    };
  }

  async analyzeExpression(
    expression: string,
    context?: string,
  ): Promise<NlpExpressionAnalysis> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.expression_request',
      method: this.analyzeExpression.name,
      data: { expression, hasContext: Boolean(context?.trim()) },
    });

    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const params = new URLSearchParams({ expression });
    if (context?.trim()) {
      params.set('input_text', context);
    }

    let response: Response;
    const start = Date.now();
    try {
      response = await fetch(`${baseUrl}/expressions?${params.toString()}`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
    } catch (err: unknown) {
      const span = trace.getActiveSpan();
      if (err instanceof Error) {
        span?.recordException(err);
      }
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'NLP service unavailable',
      });
      throw new NlpUnavailableError(err);
    }

    if (!response.ok) {
      if (response.status === 400) {
        trace.getActiveSpan()?.addEvent('nlp.expression_invalid', {
          expression,
        });
        trace.getActiveSpan()?.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'NLP expression invalid',
        });
        this.logger.warn({
          message: 'expression input rejected',
          event: 'nlp.expression_invalid',
          method: this.analyzeExpression.name,
          data: { expression },
        });
        throw new NlpExpressionInvalidError();
      }
      trace.getActiveSpan()?.addEvent('nlp.response_error', {
        'http.status_code': response.status,
      });
      trace.getActiveSpan()?.setStatus({
        code: SpanStatusCode.ERROR,
        message: `NLP HTTP ${response.status}`,
      });
      throw new NlpUnavailableError();
    }

    const body = (await response.json()) as NlpExpressionResponse;
    const durationMs = Date.now() - start;

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
      method: this.analyzeExpression.name,
      duration_ms: durationMs,
      data: {
        expression,
        canonical: body.canonical,
        kind: body.kind,
        headLemma: body.head_lemma,
      },
    });

    return {
      canonical: body.canonical,
      kind: body.kind,
      headLemma: body.head_lemma,
      contextMatch,
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
      this.logger.debug({
        message: 'inflection forms built',
        event: 'nlp.inflection_forms_built',
        method: this.buildInflectionForms.name,
        data: { pos, formKeys: Object.keys(compact) },
      });
      return { type: 'verb', ...compact } as InflectionForms;
    }

    if (pos === 'NOUN') {
      const compact = this.compactRecord({
        singular: forms['noun_singular'],
        plural: forms['noun_plural'],
      });
      if (Object.keys(compact).length === 0) return null;
      this.logger.debug({
        message: 'inflection forms built',
        event: 'nlp.inflection_forms_built',
        method: this.buildInflectionForms.name,
        data: { pos, formKeys: Object.keys(compact) },
      });
      return { type: 'noun', ...compact } as InflectionForms;
    }

    if (pos === 'ADJ' || pos === 'ADV') {
      const compact = this.compactRecord({
        positive: forms['adj_positive'],
        comparative: forms['adj_comparative'],
        superlative: forms['adj_superlative'],
      });
      if (!compact.positive) return null;
      this.logger.debug({
        message: 'inflection forms built',
        event: 'nlp.inflection_forms_built',
        method: this.buildInflectionForms.name,
        data: { pos, formKeys: Object.keys(compact) },
      });
      return { type: 'adjective', ...compact } as InflectionForms;
    }

    return null;
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
