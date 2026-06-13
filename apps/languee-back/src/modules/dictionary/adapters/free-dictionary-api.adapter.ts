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

interface FreeDictionaryApiDefinition {
  definition: string;
  example?: string;
}

interface FreeDictionaryApiMeaning {
  partOfSpeech: string;
  definitions: FreeDictionaryApiDefinition[];
}

interface FreeDictionaryApiPhonetic {
  text?: string;
}

interface FreeDictionaryApiEntry {
  word: string;
  phonetics: FreeDictionaryApiPhonetic[];
  meanings: FreeDictionaryApiMeaning[];
}

@Injectable()
export class FreeDictionaryApiAdapter implements IDictionaryApiAdapter {
  readonly providerName = FREE_DICTIONARY_API_PROVIDER_NAME;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(lemma: string, _language: string): Promise<RawDefinitionEntry[]> {
    let response: Response;
    try {
      response = await fetch(`${FREE_DICTIONARY_API_BASE_URL}/${lemma}`);
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

    const entries = (await response.json()) as FreeDictionaryApiEntry[];

    if (entries.length === 0) {
      return [];
    }

    return entries.flatMap((entry) =>
      entry.meanings
        .map((meaning) => {
          const mappedPos = mapFreeDictionaryApiPos(meaning.partOfSpeech);
          return mappedPos === null
            ? null
            : { partOfSpeech: mappedPos, definitions: meaning.definitions };
        })
        .filter(
          (
            meaning,
          ): meaning is {
            partOfSpeech: NonNullable<
              ReturnType<typeof mapFreeDictionaryApiPos>
            >;
            definitions: FreeDictionaryApiDefinition[];
          } => meaning !== null,
        )
        .flatMap((meaning) =>
          meaning.definitions.map((def) => ({
            partOfSpeech: meaning.partOfSpeech,
            definition: def.definition,
            ...(def.example !== undefined ? { example: def.example } : {}),
          })),
        ),
    );
  }
}
