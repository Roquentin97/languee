import { Test, TestingModule } from "@nestjs/testing";
import { WordsService } from "./words.service";
import { PrismaService } from "../prisma/prisma.service";

describe("WordsService", () => {
  let service: WordsService;
  let module: TestingModule;

  const prismaMock = {
    word: {
      upsert: jest.fn(),
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

  it("findOrCreate: upserts word by lemma+language and returns the row", async () => {
    const row = {
      id: "word-id-1",
      lemma: "run",
      language: "en",
      ipa: null,
      createdAt: new Date(),
    };
    prismaMock.word.upsert.mockResolvedValue(row);

    const result = await service.findOrCreate("run", "en");

    expect(result).toEqual(row);
    expect(prismaMock.word.upsert).toHaveBeenCalledWith({
      where: { lemma_language: { lemma: "run", language: "en" } },
      update: {},
      create: { lemma: "run", language: "en" },
    });
  });

  it("findOrCreate: second call uses upsert semantics — no duplicate row", async () => {
    const row = {
      id: "word-id-1",
      lemma: "run",
      language: "en",
      ipa: null,
      createdAt: new Date(),
    };
    prismaMock.word.upsert.mockResolvedValue(row);

    await service.findOrCreate("run", "en");
    await service.findOrCreate("run", "en");

    expect(prismaMock.word.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.word.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lemma_language: { lemma: "run", language: "en" } },
        update: {},
      }),
    );
  });
});
