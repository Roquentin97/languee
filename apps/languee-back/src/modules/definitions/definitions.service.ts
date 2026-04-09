import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  Definition,
  DefinitionProviderInput,
  IDefinitionProvider,
} from "../pipeline/interfaces/pipeline.interfaces";
import { PrismaService } from "../prisma/prisma.service";
import {
  DefinitionNotFoundError,
  ProviderUnavailableError,
} from "./definitions.errors";
import { DEFINITION_API_ADAPTER } from "./definitions.tokens";
import { IDefinitionApiAdapter } from "./interfaces/definition-api-adapter.interface";

@Injectable()
export class DefinitionService implements IDefinitionProvider {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DEFINITION_API_ADAPTER)
    private readonly adapter: IDefinitionApiAdapter,
  ) {}

  async provide(input: DefinitionProviderInput): Promise<Definition[]> {
    const { lemma, language } = input;

    const word = await this.prisma.word.upsert({
      where: { lemma_language: { lemma, language } },
      update: {},
      create: { lemma, language },
    });

    let rawEntries;
    try {
      rawEntries = await this.adapter.fetch(lemma, language);
    } catch (err: unknown) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(this.adapter.providerName, err);
    }

    if (rawEntries.length === 0) {
      throw new DefinitionNotFoundError(lemma, language);
    }

    const rows = await Promise.all(
      rawEntries.map(async (entry) => {
        const key = {
          wordId: word.id,
          partOfSpeech: entry.partOfSpeech,
          definition: entry.definition,
        };

        const existing = await this.prisma.definition.findUnique({
          where: { wordId_partOfSpeech_definition: key },
        });
        if (existing) return existing;

        try {
          return await this.prisma.definition.create({
            data: {
              ...key,
              example: entry.example ?? null,
              provider: this.adapter.providerName,
            },
          });
        } catch (err: unknown) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            // Race condition: another request created it concurrently
            return this.prisma.definition.findUniqueOrThrow({
              where: { wordId_partOfSpeech_definition: key },
            });
          }
          throw err;
        }
      }),
    );

    return rows.map((row) => ({
      term: lemma,
      definition: row.definition,
      examples: row.example != null ? [row.example] : [],
      part_of_speech: row.partOfSpeech,
      provider: row.provider,
    }));
  }
}
