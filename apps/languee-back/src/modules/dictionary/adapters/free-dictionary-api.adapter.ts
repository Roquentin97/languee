import { Injectable } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import {
  FREE_DICTIONARY_API_BASE_URL,
  FREE_DICTIONARY_API_PROVIDER_NAME,
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
import { mapFreeDictionaryApiPos } from '../mappers/free-dictionary-api-pos.mapper';

interface FreeDictionaryApiSense {
  definition: string;
  tags: string[];
  examples: string[];
  quotes: unknown[];
  synonyms: string[];
  antonyms: string[];
  translations?: unknown[];
  subsenses: FreeDictionaryApiSense[];
}

interface FreeDictionaryApiEntry {
  language: { code: string; name: string };
  partOfSpeech: string;
  pronunciations: { type: string; text: string; tags: string[] }[];
  forms: { word: string; tags: string[] }[];
  senses: FreeDictionaryApiSense[];
  synonyms: string[];
  antonyms: string[];
}

interface FreeDictionaryApiResponse {
  word: string;
  entries: FreeDictionaryApiEntry[];
  source: unknown;
}

@Injectable()
export class FreeDictionaryApiAdapter implements IDictionaryApiAdapter {
  readonly providerName = FREE_DICTIONARY_API_PROVIDER_NAME;

  constructor(private readonly request: RequestService) {}

  async fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]> {
    let data: FreeDictionaryApiResponse;
    try {
      data = await this.request.getJson<FreeDictionaryApiResponse>(
        `${FREE_DICTIONARY_API_BASE_URL}/entries/${language}/${encodeURIComponent(lemma)}`,
        { target: this.providerName },
      );
    } catch (err: unknown) {
      if (err instanceof RequestFailure && err.status === 404) {
        trace.getActiveSpan()?.addEvent('dictionary.not_found', { lemma });
        return [];
      }
      throw new ProviderUnavailableError(this.providerName, err);
    }

    if (!data.entries || data.entries.length === 0) {
      return [];
    }

    return data.entries.flatMap((entry) => {
      const mappedPos = mapFreeDictionaryApiPos(entry.partOfSpeech);
      if (mappedPos === null) return [];

      return entry.senses.map((sense) => ({
        partOfSpeech: mappedPos,
        definition: sense.definition,
        ...(sense.examples.length > 0 ? { example: sense.examples[0] } : {}),
      }));
    });
  }
}
