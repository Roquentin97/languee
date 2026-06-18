import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { NlpMultiWordError, NlpUnavailableError } from './nlp.errors';
import type {
  NlpAnalysis,
  NlpTokenForms,
  NlpWordResponse,
} from './nlp.interfaces';
import { mapSpacyPos } from './mappers/spacy-pos.mapper';
import type { InflectionForms } from '../dictionary/types/inflection-forms.types';

@Injectable()
export class NlpService {
  constructor(private readonly configService: ConfigService) {}

  async analyzeWord(word: string, context?: string): Promise<NlpAnalysis> {
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
      throw new NlpMultiWordError();
    }

    const token = body.tokens[0];
    const inflectionForms = this.buildInflectionForms(token.pos, token.forms);

    return {
      lemma: token.lemma,
      pos: mapSpacyPos(token.pos),
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
      return { type: 'verb', ...compact } as InflectionForms;
    }

    if (pos === 'NOUN') {
      const compact = this.compactRecord({
        singular: forms['noun_singular'],
        plural: forms['noun_plural'],
      });
      if (Object.keys(compact).length === 0) return null;
      return { type: 'noun', ...compact } as InflectionForms;
    }

    if (pos === 'ADJ' || pos === 'ADV') {
      const compact = this.compactRecord({
        positive: forms['adj_positive'],
        comparative: forms['adj_comparative'],
        superlative: forms['adj_superlative'],
      });
      if (!compact.positive) return null;
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
