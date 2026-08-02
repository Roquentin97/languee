import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestFailure, RequestService } from '../core/http/request.service';
import { NlpInputInvalidError, NlpUnavailableError } from './nlp.errors';
import type {
  NlpAnalyzeResponse,
  NlpAnalyzeResult,
  NlpTokenForms,
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

  async analyze(
    text: string,
    context?: string,
    language = 'en',
  ): Promise<NlpAnalyzeResult> {
    this.logger.debug({
      message: 'request',
      event: 'nlp.request',
      method: this.analyze.name,
      data: { text, language, hasContext: Boolean(context?.trim()) },
    });

    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');
    const params = new URLSearchParams({ text, language });
    if (context?.trim()) {
      params.set('input_text', context);
    }

    const start = Date.now();
    let body: NlpAnalyzeResponse;
    try {
      body = await this.request.getJson<NlpAnalyzeResponse>(
        `${baseUrl}/analyze?${params.toString()}`,
        {
          target: 'nlp',
          headers: { Authorization: `Basic ${credentials}` },
        },
      );
    } catch (err: unknown) {
      // NLP owns input validity: a 400/422 means it rejected the input
      // (token count, unsupported language, selection not in context), not
      // that the service is down.
      if (
        err instanceof RequestFailure &&
        (err.status === 400 || err.status === 422)
      ) {
        this.logger.warn({
          message: 'input rejected',
          event: 'nlp.input_invalid',
          method: this.analyze.name,
          data: { text, status: err.status },
        });
        throw new NlpInputInvalidError();
      }
      throw new NlpUnavailableError(err);
    }
    const durationMs = Date.now() - start;

    if (body.kind === 'word') {
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
        isIrregular: token['is_irregular'],
        inflectionForms,
      };
    }

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
      return { type: 'noun', ...compact };
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
