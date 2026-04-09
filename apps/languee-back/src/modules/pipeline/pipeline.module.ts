import { Module } from "@nestjs/common";
import { PipelineService } from "./pipeline.service";
import {
  CARD_ASSEMBLER,
  DEFINITION_PROVIDER,
  DUPLICATE_CHECKER,
  GAP_FILL_SERVICE,
  LEMMATIZER,
  NORMALIZER,
  PRE_LEMMATIZER,
} from "./pipeline.tokens";
import { CardAssemblerStub } from "./stages/card-assembler.stub";
import { DefinitionProviderStub } from "./stages/definition-provider.stub";
import { DuplicateCheckerStub } from "./stages/duplicate-checker.stub";
import { GapFillStub } from "./stages/gap-fill.stub";
import { LemmatizerStub } from "./stages/lemmatizer.stub";
import { NormalizerStub } from "./stages/normalizer.stub";
import { PreLemmatizerStub } from "./stages/pre-lemmatizer.stub";

@Module({
  providers: [
    { provide: NORMALIZER, useClass: NormalizerStub },
    { provide: PRE_LEMMATIZER, useClass: PreLemmatizerStub },
    { provide: LEMMATIZER, useClass: LemmatizerStub },
    { provide: DUPLICATE_CHECKER, useClass: DuplicateCheckerStub },
    { provide: DEFINITION_PROVIDER, useClass: DefinitionProviderStub },
    { provide: GAP_FILL_SERVICE, useClass: GapFillStub },
    { provide: CARD_ASSEMBLER, useClass: CardAssemblerStub },
    PipelineService,
  ],
  exports: [PipelineService],
})
export class PipelineModule {}
