import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  Definition,
  DefinitionProviderInput,
  IDefinitionProvider,
} from "../pipeline/interfaces/pipeline.interfaces";
import { PrismaService } from "../prisma/prisma.service";

const DICTIONARY_API_PROVIDER = "dictionaryapi";

interface DictionaryApiDefinition {
  definition: string;
  example?: string;
}

interface DictionaryApiMeaning {
  partOfSpeech: string;
  definitions: DictionaryApiDefinition[];
}

interface DictionaryApiEntry {
  meanings: DictionaryApiMeaning[];
}

@Injectable()
export class DefinitionService implements IDefinitionProvider {
  private readonly logger = new Logger(DefinitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async provide(input: DefinitionProviderInput): Promise<Definition[]> {
    const { lemma, language } = input;

    const word = await this.prisma.word.upsert({
      where: { lemma_language: { lemma, language } },
      update: {},
      create: { lemma, language },
    });

    let entries: DictionaryApiEntry[];
    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/${language}/${lemma}`,
      );
      if (!response.ok) {
        this.logger.warn(
          `DictionaryAPI returned ${response.status} for lemma="${lemma}" language="${language}"`,
        );
        return [];
      }
      entries = (await response.json()) as DictionaryApiEntry[];
    } catch (err: unknown) {
      this.logger.error(
        `DictionaryAPI fetch failed for lemma="${lemma}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }

    const upsertPromises = entries.flatMap((entry) =>
      entry.meanings.flatMap((meaning) =>
        meaning.definitions.map(async (def) => {
          try {
            await this.prisma.definition.upsert({
              where: {
                wordId_partOfSpeech_definition: {
                  wordId: word.id,
                  partOfSpeech: meaning.partOfSpeech,
                  definition: def.definition,
                },
              },
              update: {},
              create: {
                wordId: word.id,
                partOfSpeech: meaning.partOfSpeech,
                definition: def.definition,
                example: def.example ?? null,
                provider: DICTIONARY_API_PROVIDER,
              },
            });
          } catch (err: unknown) {
            if (
              err instanceof Prisma.PrismaClientKnownRequestError &&
              err.code === "P2002"
            ) {
              // Acceptable race condition — row was inserted concurrently
              return;
            }
            throw err;
          }
        }),
      ),
    );

    await Promise.all(upsertPromises);

    const rows = await this.prisma.definition.findMany({
      where: { wordId: word.id },
    });

    return rows.map((row) => ({
      term: lemma,
      definition: row.definition,
      examples: row.example != null ? [row.example] : [],
      part_of_speech: row.partOfSpeech,
      provider: row.provider,
    }));
  }
}
