import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { WordsService } from "./words.service";
import { PrismaService } from "../prisma/prisma.service";

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

function makeDictionaryApiResponse(
  overrides: Partial<{
    partOfSpeech: string;
    definition: string;
    example: string | undefined;
  }> = {},
) {
  return [
    {
      meanings: [
        {
          partOfSpeech: overrides.partOfSpeech ?? "verb",
          definitions: [
            {
              definition: overrides.definition ?? "move at a fast pace",
              ...(overrides.example !== undefined
                ? { example: overrides.example }
                : {}),
            },
          ],
        },
      ],
    },
  ];
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

function mockFetchOk(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

function mockFetchNotOk(status = 404) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jest.fn(),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("WordsService", () => {
  let service: WordsService;
  let module: TestingModule;

  const prismaMock = {
    word: {
      upsert: jest.fn(),
    },
    definition: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        WordsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<WordsService>(WordsService);
  });

  afterEach(async () => {
    await module.close();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("happy path: returns mapped definitions for a known word", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);

    const row = makeDefinitionRow({ example: "She runs every morning." });
    prismaMock.definition.findMany.mockResolvedValue([row]);

    global.fetch = mockFetchOk(
      makeDictionaryApiResponse({ example: "She runs every morning." }),
    );

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toHaveLength(1);
    const [def] = result;
    expect(def.term).toBe("run");
    expect(def.definition).toBe("move at a fast pace");
    expect(def.part_of_speech).toBe("verb");
    expect(def.provider).toBe("dictionaryapi");
    expect(def.examples).toEqual(["She runs every morning."]);
  });

  // -------------------------------------------------------------------------
  // EC1: DictionaryAPI 404 → return []
  // -------------------------------------------------------------------------

  it("EC1: 404 response from DictionaryAPI returns [] without throwing", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);

    global.fetch = mockFetchNotOk(404);

    const result = await service.provide({
      lemma: "zzznonsense",
      language: "en",
    });

    expect(result).toEqual([]);
    expect(prismaMock.definition.upsert).not.toHaveBeenCalled();
    expect(prismaMock.definition.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EC2: fetch throws network error → return []
  // -------------------------------------------------------------------------

  it("EC2: fetch network error returns [] without throwing", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);

    global.fetch = jest.fn().mockRejectedValue(new Error("Network failure"));

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toEqual([]);
    expect(prismaMock.definition.upsert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EC3: second call for same lemma/language does not create duplicate Word row
  // -------------------------------------------------------------------------

  it("EC3: second call for same lemma+language uses upsert — no duplicate Word row", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);
    prismaMock.definition.findMany.mockResolvedValue([makeDefinitionRow()]);
    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    await service.provide({ lemma: "run", language: "en" });
    await service.provide({ lemma: "run", language: "en" });

    // word.upsert called twice, but upsert semantics prevent duplicate rows
    expect(prismaMock.word.upsert).toHaveBeenCalledTimes(2);
    // The where clause uses the unique composite key
    expect(prismaMock.word.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lemma_language: { lemma: "run", language: "en" } },
        update: {},
      }),
    );
  });

  // -------------------------------------------------------------------------
  // EC4: empty / missing meanings at any nesting level → []
  // -------------------------------------------------------------------------

  it("EC4: API entry with empty meanings array → no upserts, returns [] from findMany", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.findMany.mockResolvedValue([]);

    global.fetch = mockFetchOk([{ meanings: [] }]);

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toEqual([]);
    expect(prismaMock.definition.upsert).not.toHaveBeenCalled();
  });

  it("EC4b: meaning with empty definitions array → no upserts", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.findMany.mockResolvedValue([]);

    global.fetch = mockFetchOk([
      { meanings: [{ partOfSpeech: "noun", definitions: [] }] },
    ]);

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toEqual([]);
    expect(prismaMock.definition.upsert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EC5: example mapping — row.example string|null → examples: string[]
  // -------------------------------------------------------------------------

  it("EC5: row with non-null example maps to examples array with one element", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);
    prismaMock.definition.findMany.mockResolvedValue([
      makeDefinitionRow({ example: "He runs fast." }),
    ]);
    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result[0].examples).toEqual(["He runs fast."]);
  });

  it("EC5b: row with null example maps to empty examples array", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);
    prismaMock.definition.findMany.mockResolvedValue([
      makeDefinitionRow({ example: null }),
    ]);
    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result[0].examples).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // EC7: P2002 race condition is swallowed gracefully
  // -------------------------------------------------------------------------

  it("EC7: P2002 PrismaClientKnownRequestError is caught — does not throw", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint",
      {
        code: "P2002",
        clientVersion: "5.0.0",
      },
    );
    prismaMock.definition.upsert.mockRejectedValue(p2002);
    prismaMock.definition.findMany.mockResolvedValue([]);

    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    await expect(
      service.provide({ lemma: "run", language: "en" }),
    ).resolves.toEqual([]);
  });

  it("EC7b: non-P2002 Prisma error is re-thrown", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);

    const p2000 = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "5.0.0",
    });
    prismaMock.definition.upsert.mockRejectedValue(p2000);

    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    await expect(
      service.provide({ lemma: "run", language: "en" }),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // EC8: Every inserted Definition must have provider = 'dictionaryapi'
  // -------------------------------------------------------------------------

  it("EC8: definition.upsert called with provider = 'dictionaryapi'", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);
    prismaMock.definition.findMany.mockResolvedValue([makeDefinitionRow()]);
    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    await service.provide({ lemma: "run", language: "en" });

    const calls = prismaMock.definition.upsert.mock.calls as Array<
      [{ create: { provider: string } }]
    >;
    expect(calls[0][0].create.provider).toBe("dictionaryapi");
  });

  // -------------------------------------------------------------------------
  // EC9: API returns 200 with empty array → no inserts, return []
  // -------------------------------------------------------------------------

  it("EC9: 200 with empty array body → no upserts, return []", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.findMany.mockResolvedValue([]);
    global.fetch = mockFetchOk([]);

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toEqual([]);
    expect(prismaMock.definition.upsert).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EC10: gap_fill_metadata always null on insert (not set in create payload)
  // -------------------------------------------------------------------------

  it("EC10: definition.upsert create payload does NOT include gap_fill_metadata", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);
    prismaMock.definition.findMany.mockResolvedValue([makeDefinitionRow()]);
    global.fetch = mockFetchOk(makeDictionaryApiResponse());

    await service.provide({ lemma: "run", language: "en" });

    const firstCall = prismaMock.definition.upsert.mock.calls[0] as [
      { create: Record<string, unknown> },
    ];
    const createArg = firstCall[0].create;
    expect(createArg).not.toHaveProperty("gapFillMetadata");
    expect(createArg).not.toHaveProperty("gap_fill_metadata");
  });

  // -------------------------------------------------------------------------
  // Multiple definitions across multiple meanings
  // -------------------------------------------------------------------------

  it("multiple meanings and definitions all get upserted and returned", async () => {
    const word = makeWord();
    prismaMock.word.upsert.mockResolvedValue(word);
    prismaMock.definition.upsert.mockResolvedValue(undefined);

    const rows = [
      makeDefinitionRow({
        id: "def-1",
        partOfSpeech: "verb",
        definition: "move fast",
      }),
      makeDefinitionRow({
        id: "def-2",
        partOfSpeech: "noun",
        definition: "a run",
      }),
    ];
    prismaMock.definition.findMany.mockResolvedValue(rows);

    global.fetch = mockFetchOk([
      {
        meanings: [
          { partOfSpeech: "verb", definitions: [{ definition: "move fast" }] },
          { partOfSpeech: "noun", definitions: [{ definition: "a run" }] },
        ],
      },
    ]);

    const result = await service.provide({ lemma: "run", language: "en" });

    expect(result).toHaveLength(2);
    expect(prismaMock.definition.upsert).toHaveBeenCalledTimes(2);
  });
});
