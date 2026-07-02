import { Injectable } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  WIKTIONARY_API_BASE_URL,
  WIKTIONARY_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
import {
  IDictionaryApiAdapter,
  RawDefinitionEntry,
} from '../interfaces/dictionary-api-adapter.interface';
import { parseWiktionaryResponse } from '../parsers/wiktionary.parser';

const WIKTIONARY_USER_AGENT =
  'languee-back (local development; dictionary lookup)';

@Injectable()
export class WiktionaryApiAdapter implements IDictionaryApiAdapter {
  readonly providerName = WIKTIONARY_PROVIDER_NAME;

  async fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]> {
    let response: Response;
    try {
      response = await fetch(
        `${WIKTIONARY_API_BASE_URL}/${encodeURIComponent(lemma)}`,
        {
          headers: {
            'User-Agent': WIKTIONARY_USER_AGENT,
            Accept: 'application/json',
          },
        },
      );
    } catch (err: unknown) {
      throw new ProviderUnavailableError(this.providerName, err);
    }

    if (!response.ok) {
      if (response.status === 404) {
        trace.getActiveSpan()?.addEvent('dictionary.not_found', {
          lemma,
          language,
        });
        return [];
      }
      trace.getActiveSpan()?.setStatus({
        code: SpanStatusCode.ERROR,
        message: `Dictionary HTTP ${response.status}`,
      });
      throw new ProviderUnavailableError(
        this.providerName,
        new Error(`HTTP ${response.status}`),
      );
    }

    const body: unknown = await response.json();
    return parseWiktionaryResponse(body, language);
  }
}
