import { Injectable, Inject } from '@nestjs/common';
import {
  INormalizer,
  IPreLemmatizer,
  ILemmatizer,
  IDuplicateChecker,
  IDefinitionProvider,
  IGapFillService,
  ICardAssembler,
  CardOutput,
} from './interfaces/pipeline.interfaces';
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
  DUPLICATE_CHECKER,
  DEFINITION_PROVIDER,
  GAP_FILL_SERVICE,
  CARD_ASSEMBLER,
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

  run(raw: string): CardOutput {
    const normalized = this.normalizer.normalize({ raw });
    const preLemmatized = this.preLemmatizer.preLemmatize(normalized);
    const lemmatized = this.lemmatizer.lemmatize(preLemmatized);
    const _duplicates = this.duplicateChecker.check(lemmatized);
    const definitions = this.definitionProvider.provide(lemmatized);
    const gapFilled = this.gapFillService.fill(definitions);
    const card = this.cardAssembler.assemble({
      ...normalized,
      ...lemmatized,
      ...gapFilled,
    });
    return card;
  }
}
