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
import { DuplicateCheckerStub } from "./stages/duplicate-checker.stub";
import { GapFillStub } from "./stages/gap-fill.stub";
import { Lemmatizer } from "./stages/lemmatizer/lemmatizer";
import { IrregularTableMechanism } from "./stages/lemmatizer/irregular-table.mechanism";
import { RuleEngineMechanism } from "./stages/lemmatizer/rule-engine.mechanism";
import { PassthroughMechanism } from "./stages/lemmatizer/passthrough.mechanism";
import { Normalizer } from "./stages/normalizer";
import { PreLemmatizerStub } from "./stages/pre-lemmatizer.stub";
import { DefinitionsModule } from "../definitions/definitions.module";
import { DefinitionService } from "../definitions/definitions.service";

@Module({
  imports: [DefinitionsModule],
  providers: [
    { provide: NORMALIZER, useClass: Normalizer },
    { provide: PRE_LEMMATIZER, useClass: PreLemmatizerStub },
    { provide: LEMMATIZER, useClass: Lemmatizer },
    { provide: DUPLICATE_CHECKER, useClass: DuplicateCheckerStub },
    { provide: DEFINITION_PROVIDER, useClass: DefinitionService },
    { provide: GAP_FILL_SERVICE, useClass: GapFillStub },
    { provide: CARD_ASSEMBLER, useClass: CardAssemblerStub },
    IrregularTableMechanism,
    RuleEngineMechanism,
    PassthroughMechanism,
    PipelineService,
  ],
  exports: [PipelineService],
})
export class PipelineModule {}
