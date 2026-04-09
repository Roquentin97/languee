import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { DefinitionService } from "./definitions.service";
import { PrismaService } from "../prisma/prisma.service";
import { DEFINITION_API_ADAPTER } from "./definitions.tokens";
import {
  DefinitionNotFoundError,
  ProviderUnavailableError,
} from "./definitions.errors";
import { IDefinitionApiAdapter } from "./interfaces/definition-api-adapter.interface";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWord(
  overrides: Partial<{ id: string; lemma: string; language: string }> = {},
) {
  return {
    id: overrides.id ?? "word-id-1",
    lemma: overrides.lemma ?? "run",
    language: overrides.language ?? "en",
    ipa: null,
    createdAt: new Date(),
  };
}

function makeDefinitionRow(
  overrides: Partial<{
    id: string;
    wordId: string;
    partOfSpeech: string;
    definition: string;
    example: string | null;
    provider: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "def-id-1",
    wordId: overrides.wordId ?? "word-id-1",
    partOfSpeech: overrides.partOfSpeech ?? "verb",
    definition: overrides.definition ?? "move at a fast pace",
    example: overrides.example ?? null,
    provider: overrides.provider ?? "dictionaryapi",
    gapFillMetadata: null,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("DefinitionService", () => {
  let service: DefinitionService;
  let module: TestingModule;

  const prismaMock = {
    word: { upsert: jest.fn() },
    definition: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  const adapterMock: jest.Mocked<IDefinitionApiAdapter> = {
    providerName: "dictionaryapi",
    fetch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        DefinitionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: DEFINITION_API_ADAPTER, useValue: adapterMock },
      ],
    }).compile();

    service = module.get<DefinitionService>(DefinitionService);
  });

  afterEach(async () => {
    await module.close();
  });

  it("happy path: creates definition when not found and returns mapped result", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      {
        partOfSpeech: "verb",
        definition: "move at a fast pace",
        example: "She runs every morning.",
      },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);
    const row = makeDefinitionRow({ example: "She runs every morning." });
    prismaMock.definition.create.mockResolvedValue(row);

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("run");
    expect(result[0].definition).toBe("move at a fast pace");
    expect(result[0].part_of_speech).toBe("verb");
    expect(result[0].provider).toBe("dictionaryapi");
    expect(result[0].examples).toEqual(["She runs every morning."]);
  });

  it("returns existing definition without calling create", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: "verb", definition: "move at a fast pace" },
    ]);
    const existing = makeDefinitionRow();
    prismaMock.definition.findUnique.mockResolvedValue(existing);

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toHaveLength(1);
    expect(prismaMock.definition.create).not.toHaveBeenCalled();
  });

  it("throws DefinitionNotFoundError when adapter returns empty array", async () => {
    prismaMock.word.upsert.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([]);

    await expect(
      service.provide({ lemma: "zzznonsense", language: "en" }),
    ).rejects.toBeInstanceOf(DefinitionNotFoundError);
  });

  it("DefinitionNotFoundError message includes lemma", async () => {
    prismaMock.word.upsert.mockResolvedValue(makeWord());
    adapterMock.fetch.mockResolvedValue([]);

    const err = await service
      .provide({ lemma: "zzznonsense", language: "fr" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DefinitionNotFoundError);
    expect((err as DefinitionNotFoundError).message).toContain("zzznonsense");
  });

  it("propagates ProviderUnavailableError from adapter", async () => {
    prismaMock.word.upsert.mockResolvedValue(makeWord());
    adapterMock.fetch.mockRejectedValue(
      new ProviderUnavailableError("dictionaryapi", new Error("HTTP 500")),
    );

    await expect(
      service.provide({ lemma: "run", language: "en" }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("wraps unexpected adapter error in ProviderUnavailableError", async () => {
    prismaMock.word.upsert.mockResolvedValue(makeWord());
    adapterMock.fetch.mockRejectedValue(new Error("unexpected"));

    await expect(
      service.provide({ lemma: "run", language: "en" }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("EC: P2002 on create falls back to findUniqueOrThrow", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: "verb", definition: "move at a fast pace" },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique", {
      code: "P2002",
      clientVersion: "5.0.0",
    });
    prismaMock.definition.create.mockRejectedValue(p2002);

    const existing = makeDefinitionRow();
    prismaMock.definition.findUniqueOrThrow.mockResolvedValue(existing);

    const result = await service.provide({ lemma: "run", language: "en" });
    expect(result).toHaveLength(1);
    expect(prismaMock.definition.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("EC: non-P2002 Prisma error on create is re-thrown", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: "verb", definition: "move at a fast pace" },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);

    const p2025 = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    prismaMock.definition.create.mockRejectedValue(p2025);

    await expect(
      service.provide({ lemma: "run", language: "en" }),
    ).rejects.toThrow();
  });

  it("row with null example maps to empty examples array", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: "verb", definition: "move at a fast pace" },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);
    prismaMock.definition.create.mockResolvedValue(
      makeDefinitionRow({ example: null }),
    );

    const result = await service.provide({ lemma: "run", language: "en" });
    expect(result[0].examples).toEqual([]);
  });

  it("handles multiple definitions from adapter", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    adapterMock.fetch.mockResolvedValue([
      { partOfSpeech: "verb", definition: "move fast" },
      { partOfSpeech: "noun", definition: "a run" },
    ]);
    prismaMock.definition.findUnique.mockResolvedValue(null);
    prismaMock.definition.create
      .mockResolvedValueOnce(
        makeDefinitionRow({
          id: "def-1",
          partOfSpeech: "verb",
          definition: "move fast",
        }),
      )
      .mockResolvedValueOnce(
        makeDefinitionRow({
          id: "def-2",
          partOfSpeech: "noun",
          definition: "a run",
        }),
      );

    const result = await service.provide({ lemma: "run", language: "en" });
    expect(result).toHaveLength(2);
    expect(prismaMock.definition.create).toHaveBeenCalledTimes(2);
  });
});
