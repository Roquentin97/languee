import { Injectable } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import {
  DICTIONARY_API_BASE_URL,
  DICTIONARYAPI_DEV_PROVIDER_NAME,
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
import { mapDictionaryApiPos } from '../mappers/dictionary-api-pos.mapper';

interface DictionaryApiDefinition {
  definition: string;
  example?: string;
}

interface DictionaryApiMeaning {
  partOfSpeech: string;
  definitions: DictionaryApiDefinition[];
}

interface DictionaryApiEntry {
  meanings: DictionaryApiMeaning[];
}

type DictionaryApiMappedMeaning = DictionaryApiMeaning & {
  mappedPartOfSpeech: NonNullable<ReturnType<typeof mapDictionaryApiPos>>;
};

@Injectable()
export class DictionaryApiAdapter implements IDictionaryApiAdapter {
  readonly providerName = DICTIONARYAPI_DEV_PROVIDER_NAME;

  constructor(private readonly request: RequestService) {}

  async fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]> {
    let data: DictionaryApiEntry[];
    try {
      data = await this.request.getJson<DictionaryApiEntry[]>(
        `${DICTIONARY_API_BASE_URL}/${language}/${lemma}`,
        { target: this.providerName },
      );
    } catch (err: unknown) {
      if (err instanceof RequestFailure && err.status === 404) {
        trace.getActiveSpan()?.addEvent('dictionary.not_found', {
          lemma,
          language,
        });
        return [];
      }
      throw new ProviderUnavailableError(this.providerName, err);
    }

    return data.flatMap((entry) =>
      entry.meanings
        .map((meaning): DictionaryApiMappedMeaning | null => {
          const mappedPos = mapDictionaryApiPos(meaning.partOfSpeech);
          return mappedPos === null
            ? null
            : { ...meaning, mappedPartOfSpeech: mappedPos };
        })
        .filter(
          (meaning): meaning is DictionaryApiMappedMeaning => meaning !== null,
        )
        .flatMap((meaning) =>
          meaning.definitions.map((def) => ({
            partOfSpeech: meaning.mappedPartOfSpeech,
            definition: def.definition,
            ...(def.example !== undefined ? { example: def.example } : {}),
          })),
        ),
    );
  }
}
