import { Injectable } from '@nestjs/common';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import type {
  LookupWordInput,
  LookupWordOutput,
  DefinitionResult,
} from './types/lookup-word.types';
import { DefinitionsNotFoundException } from './dictionary.errors';

@Injectable()
export class DictionaryService {
  constructor(
    private readonly wordsService: WordsService,
    private readonly definitionService: DefinitionService,
  ) {}

  async lookup(input: LookupWordInput): Promise<LookupWordOutput> {
    const lemma = this.wordsService.canonicalise(input.word);

    const word = await this.wordsService.findByLemma(lemma, input.language);

    if (word !== null) {
      const rows = await this.definitionService.findByWordId(word.id);
      if (rows.length > 0) {
        const definitions: DefinitionResult[] = rows.map((row) => ({
          id: row.id,
          part_of_speech: row.partOfSpeech,
          definition: row.definition,
          example: row.example ?? null,
          provider: row.provider,
        }));
        return { lemma, source: 'cache', definitions };
      }
    }

    const savedWord = await this.wordsService.ensureExistsAndReturn(
      lemma,
      input.language,
    );
    const rows = await this.definitionService.fetchAndPersist(
      savedWord.id,
      lemma,
      input.language,
    );
    if (rows.length === 0) {
      throw new DefinitionsNotFoundException(lemma, input.language);
    }

    const definitions: DefinitionResult[] = rows.map((row) => ({
      id: row.id,
      part_of_speech: row.partOfSpeech,
      definition: row.definition,
      example: row.example ?? null,
      provider: row.provider,
    }));

    return { lemma, source: 'provider', definitions };
  }
}
