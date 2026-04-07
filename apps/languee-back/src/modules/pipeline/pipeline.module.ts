import { Module } from "@nestjs/common";
import { PipelineService } from "./pipeline.service";
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
  DUPLICATE_CHECKER,
  DEFINITION_PROVIDER,
  GAP_FILL_SERVICE,
  CARD_ASSEMBLER,
} from "./pipeline.tokens";
import { NormalizerStub } from "./stages/normalizer.stub";
import { PreLemmatizerStub } from "./stages/pre-lemmatizer.stub";
import { LemmatizerStub } from "./stages/lemmatizer.stub";
import { DuplicateCheckerStub } from "./stages/duplicate-checker.stub";
import { DefinitionProviderStub } from "./stages/definition-provider.stub";
import { GapFillStub } from "./stages/gap-fill.stub";
import { CardAssemblerStub } from "./stages/card-assembler.stub";

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
