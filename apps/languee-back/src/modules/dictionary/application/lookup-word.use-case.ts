import { Inject, Injectable } from '@nestjs/common';
import { DEFINITION_API_ADAPTER } from '../../definitions/definitions.tokens';
import type { IDefinitionApiAdapter } from '../../definitions/interfaces/definition-api-adapter.interface';
import { WordsService } from '../../words/words.service';
import { DefinitionService } from '../../definitions/definitions.service';
import {
  LookupWordInput,
  LookupWordOutput,
  DefinitionResult,
} from '../types/lookup-word.types';
import { DefinitionsNotFoundException } from '../dictionary.errors';

@Injectable()
export class LookupWordUseCase {
  constructor(
    @Inject(DEFINITION_API_ADAPTER)
    private readonly adapter: IDefinitionApiAdapter,
    private readonly wordsService: WordsService,
    private readonly definitionService: DefinitionService,
  ) {}

  async execute(input: LookupWordInput): Promise<LookupWordOutput> {
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

    const rawEntries = await this.adapter.fetch(lemma, input.language);
    if (rawEntries.length === 0) {
      throw new DefinitionsNotFoundException(lemma, input.language);
    }

    const savedWord = await this.wordsService.ensureExistsAndReturn(
      lemma,
      input.language,
    );
    const rows = await this.definitionService.createMany(
      savedWord.id,
      rawEntries,
    );

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
