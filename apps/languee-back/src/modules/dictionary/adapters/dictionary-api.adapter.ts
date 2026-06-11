import { Injectable } from '@nestjs/common';
import {
  DICTIONARY_API_BASE_URL,
  DICTIONARY_API_PROVIDER_NAME,
} from '../constants';
import { ProviderUnavailableError } from '../../definitions/definitions.errors';
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
  readonly providerName = DICTIONARY_API_PROVIDER_NAME;

  async fetch(lemma: string, language: string): Promise<RawDefinitionEntry[]> {
    let response: Response;
    try {
      response = await fetch(`${DICTIONARY_API_BASE_URL}/${language}/${lemma}`);
    } catch (err: unknown) {
      throw new ProviderUnavailableError(this.providerName, err);
    }

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new ProviderUnavailableError(
        this.providerName,
        new Error(`HTTP ${response.status}`),
      );
    }

    const entries = (await response.json()) as DictionaryApiEntry[];

    return entries.flatMap((entry) =>
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
