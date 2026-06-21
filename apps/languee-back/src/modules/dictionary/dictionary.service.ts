import { Inject, Injectable } from '@nestjs/common';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import type {
  LookupWordInput,
  LookupWordOutput,
  DefinitionResult,
} from './types/lookup-word.types';
import { DefinitionsNotFoundException } from './dictionary.errors';
import { DICTIONARY_API_ADAPTER } from './dictionary.tokens';
import type {
  IDictionaryApiAdapter,
  RawDefinitionEntry,
} from './interfaces/dictionary-api-adapter.interface';
import type { InflectionForms } from './types/inflection-forms.types';
import { PartOfSpeech } from '../vocabulary/enums/part-of-speech.enum';

@Injectable()
export class DictionaryService {
  constructor(
    private readonly wordsService: WordsService,
    private readonly definitionService: DefinitionService,
    @Inject(DICTIONARY_API_ADAPTER)
    private readonly adapter: IDictionaryApiAdapter,
  ) {}

  async lookup(input: LookupWordInput): Promise<LookupWordOutput> {
    const lemma =
      input.lemma !== undefined
        ? input.lemma
        : this.wordsService.canonicalise(input.word);

    const word = await this.wordsService.findByLemma(lemma, input.language);

    if (word !== null) {
      const rows = await this.definitionService.findByWordId(word.id);
      if (rows.length > 0) {
        const definitions: DefinitionResult[] = rows.map((row) => ({
          id: row.id,
          partOfSpeech: row.partOfSpeech as PartOfSpeech,
          definition: row.definition,
          example: row.example ?? null,
          provider: row.provider,
          hasIrregularForms: row.hasIrregularForms,
          inflectionForms:
            row.inflectionForms !== null
              ? (row.inflectionForms as InflectionForms)
              : null,
        }));
        return { lemma, source: 'cache', definitions };
      }
    }

    const savedWord = await this.wordsService.ensureExistsAndReturn(
      lemma,
      input.language,
    );
    const rawEntries = await this.adapter.fetch(lemma, input.language);
    if (rawEntries.length === 0) {
      throw new DefinitionsNotFoundException(lemma, input.language);
    }

    const enrichedEntries: RawDefinitionEntry[] = rawEntries.map((entry) => ({
      ...entry,
      hasIrregularForms: input.isIrregular ?? entry.hasIrregularForms,
      inflectionForms: input.inflectionForms,
    }));

    const rows = await this.definitionService.createMany(
      savedWord.id,
      enrichedEntries,
      this.adapter.providerName,
    );

    const definitions: DefinitionResult[] = rows.map((row) => ({
      id: row.id,
      partOfSpeech: row.partOfSpeech as PartOfSpeech,
      definition: row.definition,
      example: row.example ?? null,
      provider: row.provider,
      hasIrregularForms: row.hasIrregularForms,
      inflectionForms:
        row.inflectionForms !== null
          ? (row.inflectionForms as InflectionForms)
          : null,
    }));

    return { lemma, source: 'provider', definitions };
  }
}
