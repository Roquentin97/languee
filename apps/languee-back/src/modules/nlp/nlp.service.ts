import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { RequestFailure, RequestService } from '../core/http/request.service';
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

  constructor(
    private readonly request: RequestService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeWord(
    word: string,
    context?: string,
    language = 'en',
  ): Promise<NlpAnalysis> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.request',
      method: this.analyzeWord.name,
      data: { word, language, hasContext: Boolean(context?.trim()) },
    });

    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const params = new URLSearchParams({ word, language });
    if (context?.trim()) {
      params.set('input_text', context);
    }

    const start = Date.now();
    let body: NlpWordResponse;
    try {
      body = await this.request.getJson<NlpWordResponse>(
        `${baseUrl}/words?${params.toString()}`,
        {
          target: 'nlp',
          headers: { Authorization: `Basic ${credentials}` },
        },
      );
    } catch (err: unknown) {
      throw new NlpUnavailableError(err);
    }

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
    const extraForms = token['extra_forms'] ?? null;
    const durationMs = Date.now() - start;

    this.logger.log({
      message: 'word analyzed',
      event: 'nlp.word_analyzed',
      method: this.analyzeWord.name,
      duration_ms: durationMs,
      data: {
        word,
        language,
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
      extraForms,
    };
  }

  async analyzeExpression(
    expression: string,
    context?: string,
    language = 'en',
  ): Promise<NlpExpressionAnalysis> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.expression_request',
      method: this.analyzeExpression.name,
      data: { expression, language, hasContext: Boolean(context?.trim()) },
    });

    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const params = new URLSearchParams({ expression, language });
    if (context?.trim()) {
      params.set('input_text', context);
    }

    const start = Date.now();
    let body: NlpExpressionResponse;
    try {
      body = await this.request.getJson<NlpExpressionResponse>(
        `${baseUrl}/expressions?${params.toString()}`,
        {
          target: 'nlp',
          headers: { Authorization: `Basic ${credentials}` },
        },
      );
    } catch (err: unknown) {
      // NLP owns expression validity: a 400 means it rejected the input
      // (token count, unsupported language), not that the service is down.
      if (err instanceof RequestFailure && err.status === 400) {
        this.logger.warn({
          message: 'expression input rejected',
          event: 'nlp.expression_invalid',
          method: this.analyzeExpression.name,
          data: { expression },
        });
        throw new NlpExpressionInvalidError();
      }
      throw new NlpUnavailableError(err);
    }
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
        language,
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
