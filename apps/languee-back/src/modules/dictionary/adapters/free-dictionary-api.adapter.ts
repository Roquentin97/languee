import { Injectable } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  FREE_DICTIONARY_API_BASE_URL,
  FREE_DICTIONARY_API_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
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

  async fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]> {
    let response: Response;
    try {
      response = await fetch(
        `${FREE_DICTIONARY_API_BASE_URL}/entries/${language}/${encodeURIComponent(lemma)}`,
      );
    } catch (err: unknown) {
      throw new ProviderUnavailableError(this.providerName, err);
    }

    if (!response.ok) {
      if (response.status === 404) {
        trace.getActiveSpan()?.addEvent('dictionary.not_found', { lemma });
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

    const data = (await response.json()) as FreeDictionaryApiResponse;

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
