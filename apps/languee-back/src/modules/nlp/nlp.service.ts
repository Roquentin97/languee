import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NlpMultiWordError, NlpUnavailableError } from './nlp.errors';
import type {
  NlpAnalysis,
  NlpTokenForms,
  NlpWordResponse,
} from './nlp.interfaces';

@Injectable()
export class NlpService {
  constructor(private readonly configService: ConfigService) {}

  async analyzeWord(word: string): Promise<NlpAnalysis> {
    const baseUrl = this.configService.getOrThrow<string>('nlp.baseUrl');
    const login = this.configService.getOrThrow<string>('nlp.basicAuthLogin');
    const password = this.configService.getOrThrow<string>(
      'nlp.basicAuthPassword',
    );

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');

    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/words?word=${encodeURIComponent(word)}`,
        {
          headers: { Authorization: `Basic ${credentials}` },
        },
      );
    } catch (err: unknown) {
      throw new NlpUnavailableError(err);
    }

    if (!response.ok) {
      throw new NlpUnavailableError();
    }

    const body = (await response.json()) as NlpWordResponse;

    if (body.is_multi_word || body.tokens.length !== 1) {
      throw new NlpMultiWordError();
    }

    const token = body.tokens[0];
    const inflectionForms = this.buildInflectionForms(token.pos, token.forms);

    return {
      lemma: token.lemma,
      pos: token.pos,
      isIrregular: token.is_irregular,
      inflectionForms,
    };
  }

  private buildInflectionForms(
    pos: string,
    forms: NlpTokenForms,
  ): Record<string, string> {
    if (pos === 'VERB') {
      return this.compactRecord({
        base: forms.verb_base,
        past: forms.verb_past,
        gerundParticiple: forms.verb_gerund_participle,
        pastParticiple: forms.verb_past_participle,
        presentNon3sg: forms.verb_present_non_3sg,
        present3sg: forms.verb_present_3sg,
      });
    }

    if (pos === 'NOUN') {
      return this.compactRecord({
        singular: forms.noun_singular,
        plural: forms.noun_plural,
      });
    }

    if (pos === 'ADJ' || pos === 'ADV') {
      return this.compactRecord({
        positive: forms.adj_positive,
        comparative: forms.adj_comparative,
        superlative: forms.adj_superlative,
      });
    }

    return {};
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
