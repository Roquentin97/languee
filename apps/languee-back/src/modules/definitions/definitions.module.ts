import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DefinitionService } from "./definitions.service";

@Module({
  imports: [PrismaModule],
  providers: [DefinitionService],
  exports: [DefinitionService],
})
export class DefinitionsModule {}
