import { Module } from "@nestjs/common";
import { DictionaryApiAdapter } from "./adapters/dictionary-api.adapter";
import { DEFINITION_API_ADAPTER } from "./definitions.tokens";
import { DefinitionService } from "./definitions.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: DEFINITION_API_ADAPTER, useClass: DictionaryApiAdapter },
    DefinitionService,
  ],
  exports: [DefinitionService],
})
export class DefinitionsModule {}
