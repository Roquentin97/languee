import { Inject, Injectable } from '@nestjs/common';
import {
  CardOutput,
  ICardAssembler,
  IDuplicateChecker,
  IDefinitionProvider,
  IGapFillService,
  ILemmatizer,
  INormalizer,
  IPreLemmatizer,
} from './interfaces/pipeline.interfaces';
import {
  CARD_ASSEMBLER,
  DEFINITION_PROVIDER,
  DUPLICATE_CHECKER,
  GAP_FILL_SERVICE,
  LEMMATIZER,
  NORMALIZER,
  PRE_LEMMATIZER,
} from './pipeline.tokens';

@Injectable()
export class PipelineService {
  constructor(
    @Inject(NORMALIZER) private readonly normalizer: INormalizer,
    @Inject(PRE_LEMMATIZER) private readonly preLemmatizer: IPreLemmatizer,
    @Inject(LEMMATIZER) private readonly lemmatizer: ILemmatizer,
    @Inject(DUPLICATE_CHECKER)
    private readonly duplicateChecker: IDuplicateChecker,
    @Inject(DEFINITION_PROVIDER)
    private readonly definitionProvider: IDefinitionProvider,
    @Inject(GAP_FILL_SERVICE) private readonly gapFillService: IGapFillService,
    @Inject(CARD_ASSEMBLER) private readonly cardAssembler: ICardAssembler,
  ) {}

  async run(input: {
    raw: string;
    deck_id: string;
    user_id: string;
    language: string;
  }): Promise<CardOutput> {
    const normalized = this.normalizer.normalize({ raw: input.raw });
    const preLemmatized = this.preLemmatizer.preLemmatize(normalized);
    const lemmatized = this.lemmatizer.lemmatize(preLemmatized);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _duplicates = this.duplicateChecker.check({
      lemma: lemmatized.lemma,
      deck_id: input.deck_id,
    });
    const definitions = await this.definitionProvider.provide({
      lemma: lemmatized.lemma,
      language: input.language,
    });
    const gapFilled = this.gapFillService.fill({
      definitions,
      context: { deck_id: input.deck_id, user_id: input.user_id },
    });
    const card = this.cardAssembler.assemble({
      deck_id: input.deck_id,
      user_id: input.user_id,
      definition_id: 'stub-definition-id',
      hints: gapFilled.hints,
    });
    return card;
  }
}
