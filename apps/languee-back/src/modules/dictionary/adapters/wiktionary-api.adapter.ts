import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import {
  WIKTIONARY_API_BASE_URL,
  WIKTIONARY_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
import {
  RequestFailure,
  RequestService,
} from '../../core/http/request.service';
import {
  IDictionaryApiAdapter,
  RawDefinitionEntry,
} from '../interfaces/dictionary-api-adapter.interface';
import { parseWiktionaryResponse } from '../parsers/wiktionary.parser';

@Injectable()
export class WiktionaryApiAdapter implements IDictionaryApiAdapter {
  readonly providerName = WIKTIONARY_PROVIDER_NAME;

  constructor(
    private readonly request: RequestService,
    private readonly configService: ConfigService,
  ) {}

  async fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]> {
    // Wikimedia's User-Agent policy expects a descriptive agent with a contact
    // route; they throttle generic ones. It is configured, not hardcoded.
    const userAgent = this.configService.getOrThrow<string>(
      'dictionary.wiktionaryUserAgent',
    );

    let body: unknown;
    try {
      body = await this.request.getJson<unknown>(
        `${WIKTIONARY_API_BASE_URL}/${encodeURIComponent(lemma)}`,
        {
          target: this.providerName,
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        },
      );
    } catch (err: unknown) {
      // A 404 is not a failure: the provider was reached and simply has no
      // entry for this lemma. Everything else is a genuine provider problem.
      if (err instanceof RequestFailure && err.status === 404) {
        trace.getActiveSpan()?.addEvent('dictionary.not_found', {
          lemma,
          language,
        });
        return [];
      }
      throw new ProviderUnavailableError(this.providerName, err);
    }

    return parseWiktionaryResponse(body, language);
  }
}
