import { Inject, Injectable } from '@nestjs/common';
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
} from '../../pipeline/pipeline.tokens';
import {
  INormalizer,
  IPreLemmatizer,
  ILemmatizer,
} from '../../pipeline/interfaces/pipeline.interfaces';
import { DEFINITION_API_ADAPTER } from '../../definitions/definitions.tokens';
import type { IDefinitionApiAdapter } from '../../definitions/interfaces/definition-api-adapter.interface';
import { WordsService } from '../../words/words.service';
import { DefinitionService } from '../../definitions/definitions.service';
import { WORDS_REPOSITORY, DEFINITIONS_REPOSITORY } from '../dictionary.tokens';
import type { IWordsRepository } from '../interfaces/words-repository.interface';
import type { IDefinitionsRepository } from '../interfaces/definitions-repository.interface';
import {
  LookupWordInput,
  LookupWordOutput,
  DefinitionResult,
} from '../types/lookup-word.types';
import { DefinitionsNotFoundException } from '../dictionary.errors';

@Injectable()
export class LookupWordUseCase {
  constructor(
    @Inject(NORMALIZER)
    private readonly normalizer: INormalizer,
    @Inject(PRE_LEMMATIZER)
    private readonly preLemmatizer: IPreLemmatizer,
    @Inject(LEMMATIZER)
    private readonly lemmatizer: ILemmatizer,
    @Inject(WORDS_REPOSITORY)
    private readonly wordsRepository: IWordsRepository,
    @Inject(DEFINITIONS_REPOSITORY)
    private readonly definitionsRepository: IDefinitionsRepository,
    @Inject(DEFINITION_API_ADAPTER)
    private readonly adapter: IDefinitionApiAdapter,
    private readonly wordsService: WordsService,
    private readonly definitionService: DefinitionService,
  ) {}

  async execute(input: LookupWordInput): Promise<LookupWordOutput> {
    const normalized = this.normalizer.normalize({ raw: input.word });
    const preLemmatized = this.preLemmatizer.preLemmatize(normalized);
    const { lemma } = this.lemmatizer.lemmatize(preLemmatized);

    const word = await this.wordsRepository.findByLemma(lemma, input.language);

    if (word !== null) {
      const rows = await this.definitionsRepository.findByWordId(word.id);
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
      return { lemma, source: 'cache', definitions };
    }

    const rawEntries = await this.adapter.fetch(lemma, input.language);
    if (rawEntries.length === 0) {
      throw new DefinitionsNotFoundException(lemma, input.language);
    }

    const savedWord = await this.wordsService.findOrCreate(
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
