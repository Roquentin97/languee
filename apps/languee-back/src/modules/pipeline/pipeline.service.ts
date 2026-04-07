import { Injectable, Inject } from "@nestjs/common";
import {
  INormalizer,
  IPreLemmatizer,
  ILemmatizer,
  IDuplicateChecker,
  IDefinitionProvider,
  IGapFillService,
  ICardAssembler,
  CardOutput,
} from "./interfaces/pipeline.interfaces";
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
  DUPLICATE_CHECKER,
  DEFINITION_PROVIDER,
  GAP_FILL_SERVICE,
  CARD_ASSEMBLER,
} from "./pipeline.tokens";

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

  run(input: {
    raw: string;
    deck_id: string;
    user_id: string;
    language: string;
  }): CardOutput {
    const normalized = this.normalizer.normalize({ raw: input.raw });
    const preLemmatized = this.preLemmatizer.preLemmatize(normalized);
    const lemmatized = this.lemmatizer.lemmatize(preLemmatized);
    const _duplicates = this.duplicateChecker.check({
      lemma: lemmatized.lemma,
      deck_id: input.deck_id,
    });
    const definitions = this.definitionProvider.provide({
      lemma: lemmatized.lemma,
      language: input.language,
    });
    const gapFilled = this.gapFillService.fill({
      definitions,
      hints_context: lemmatized.lemma,
    });
    const card = this.cardAssembler.assemble({
      deck_id: input.deck_id,
      user_id: input.user_id,
      definition_id: "stub-definition-id",
      hints: gapFilled.hints,
    });
    return card;
  }
}
