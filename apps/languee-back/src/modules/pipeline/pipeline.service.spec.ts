import { Test, TestingModule } from "@nestjs/testing";
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
import {
  CardAssemblerInput,
  CardOutput,
  Definition,
  GapFilledOutput,
  ICardAssembler,
  IDuplicateChecker,
  IDefinitionProvider,
  IGapFillService,
  ILemmatizer,
  INormalizer,
  IPreLemmatizer,
  LemmatizedOutput,
  NormalizedOutput,
  PreLemmatizedOutput,
} from "./interfaces/pipeline.interfaces";

const DEFAULT_INPUT = {
  raw: "run",
  deck_id: "deck-1",
  user_id: "user-1",
  language: "en",
};

async function buildModule(overrides?: {
  [token: string]: unknown;
}): Promise<TestingModule> {
  let builder = Test.createTestingModule({
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
  });

  if (overrides) {
    for (const [token, value] of Object.entries(overrides)) {
      builder = builder.overrideProvider(token).useValue(value);
    }
  }

  return builder.compile();
}

describe("PipelineService", () => {
  let service: PipelineService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await buildModule();
    service = module.get<PipelineService>(PipelineService);
  });

  afterEach(async () => {
    await module.close();
  });

  // Edge case 1: happy path with well-formed input returns a full CardOutput
  it("EC1: run with valid input returns CardOutput with all required fields", () => {
    const card = service.run(DEFAULT_INPUT);

    expect(card).toBeDefined();
    expect(card).toHaveProperty("id");
    expect(card).toHaveProperty("deck_id");
    expect(card).toHaveProperty("user_id");
    expect(card).toHaveProperty("definition_id");
    expect(card).toHaveProperty("front");
    expect(card).toHaveProperty("back");
    expect(card).toHaveProperty("hints");
    expect(card).toHaveProperty("nuance");
    expect(card).toHaveProperty("created_at");
    expect(card).toHaveProperty("updated_at");
  });

  // Edge case 2: empty string raw propagates through stubs without throwing
  it("EC2: run with empty string raw does not throw and returns CardOutput", () => {
    expect(() =>
      service.run({
        raw: "",
        deck_id: "deck-1",
        user_id: "user-1",
        language: "en",
      }),
    ).not.toThrow();

    const card = service.run({
      raw: "",
      deck_id: "deck-1",
      user_id: "user-1",
      language: "en",
    });
    expect(card).toBeDefined();
    expect(card).toHaveProperty("id");
  });

  // Edge case 3: multi-word raw string does not throw; normalizer always returns is_multi_word: false
  it("EC3: run with multi-word raw string does not throw and returns CardOutput", () => {
    expect(() =>
      service.run({
        raw: "hello world foo",
        deck_id: "deck-1",
        user_id: "user-1",
        language: "en",
      }),
    ).not.toThrow();

    const card = service.run({
      raw: "hello world foo",
      deck_id: "deck-1",
      user_id: "user-1",
      language: "en",
    });
    expect(card).toBeDefined();
  });

  // Edge case 4: each stage receives exactly the output of the previous stage, unmodified
  it("EC4: each stage receives exactly the output of the previous stage", async () => {
    const normalizeResult: NormalizedOutput = {
      normalized_form: "run",
      is_multi_word: false,
      pos: null,
    };
    const preLemmatizeResult: PreLemmatizedOutput = {
      lemma: "run",
      short_circuited: false,
    };
    const lemmatizeResult: LemmatizedOutput = { lemma: "run" };
    const definitions: Definition[] = [
      {
        term: "stub-term",
        definition: "A stub definition for testing.",
        examples: ["Stub example sentence."],
        part_of_speech: "noun",
        provider: "stub",
      },
    ];
    const gapFilledResult: GapFilledOutput = {
      definitions,
      hints: "stub-hint",
      gap_fill_metadata: {},
    };
    const stubCard: CardOutput = {
      id: "stub-card-id",
      deck_id: "deck-1",
      user_id: "user-1",
      definition_id: "stub-definition-id",
      front: "stub-front",
      back: "stub-back",
      hints: "stub-hint",
      nuance: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    const spyNormalize = jest.fn().mockReturnValue(normalizeResult);
    const spyPreLemmatize = jest.fn().mockReturnValue(preLemmatizeResult);
    const spyLemmatize = jest.fn().mockReturnValue(lemmatizeResult);
    const spyCheck = jest.fn().mockReturnValue([]);
    const spyProvide = jest.fn().mockReturnValue(definitions);
    const spyFill = jest.fn().mockReturnValue(gapFilledResult);
    const spyAssemble = jest.fn().mockReturnValue(stubCard);

    const normalizerMock: INormalizer = { normalize: spyNormalize };
    const preLemmatizerMock: IPreLemmatizer = { preLemmatize: spyPreLemmatize };
    const lemmatizerMock: ILemmatizer = { lemmatize: spyLemmatize };
    const duplicateCheckerMock: IDuplicateChecker = { check: spyCheck };
    const definitionProviderMock: IDefinitionProvider = { provide: spyProvide };
    const gapFillMock: IGapFillService = { fill: spyFill };
    const cardAssemblerMock: ICardAssembler = { assemble: spyAssemble };

    const testModule = await Test.createTestingModule({
      providers: [
        { provide: NORMALIZER, useValue: normalizerMock },
        { provide: PRE_LEMMATIZER, useValue: preLemmatizerMock },
        { provide: LEMMATIZER, useValue: lemmatizerMock },
        { provide: DUPLICATE_CHECKER, useValue: duplicateCheckerMock },
        { provide: DEFINITION_PROVIDER, useValue: definitionProviderMock },
        { provide: GAP_FILL_SERVICE, useValue: gapFillMock },
        { provide: CARD_ASSEMBLER, useValue: cardAssemblerMock },
        PipelineService,
      ],
    }).compile();

    const svc = testModule.get<PipelineService>(PipelineService);
    svc.run(DEFAULT_INPUT);

    // normalizer receives raw input
    expect(spyNormalize).toHaveBeenCalledWith({ raw: "run" });
    // preLemmatizer receives exactly the normalizer's return value
    expect(spyPreLemmatize).toHaveBeenCalledWith(normalizeResult);
    // lemmatizer receives exactly the preLemmatizer's return value
    expect(spyLemmatize).toHaveBeenCalledWith(preLemmatizeResult);
    // duplicateChecker receives lemma from lemmatizer output
    expect(spyCheck).toHaveBeenCalledWith(
      expect.objectContaining({ lemma: lemmatizeResult.lemma }),
    );
    // definitionProvider receives lemma from lemmatizer output
    expect(spyProvide).toHaveBeenCalledWith(
      expect.objectContaining({ lemma: lemmatizeResult.lemma }),
    );
    // gapFill receives exactly the definitions returned by definitionProvider
    expect(spyFill).toHaveBeenCalledWith(
      expect.objectContaining({ definitions }),
    );
    // cardAssembler receives hints from gapFill output
    expect(spyAssemble).toHaveBeenCalledWith(
      expect.objectContaining({ hints: gapFilledResult.hints }),
    );

    await testModule.close();
  });

  // Edge case 5: IDuplicateChecker.check without definition_id does not throw
  it("EC5: DuplicateCheckerStub.check without definition_id does not throw", () => {
    const checker = new DuplicateCheckerStub();
    expect(() =>
      checker.check({ lemma: "run", deck_id: "deck-1" }),
    ).not.toThrow();
    const result = checker.check({ lemma: "run", deck_id: "deck-1" });
    expect(result).toEqual([]);
  });

  // Edge case 6: IDuplicateChecker.check with definition_id returns [] without throwing
  it("EC6: DuplicateCheckerStub.check with definition_id returns empty array", () => {
    const checker = new DuplicateCheckerStub();
    expect(() =>
      checker.check({
        lemma: "run",
        deck_id: "deck-1",
        definition_id: "def-1",
      }),
    ).not.toThrow();
    const result = checker.check({
      lemma: "run",
      deck_id: "deck-1",
      definition_id: "def-1",
    });
    expect(result).toEqual([]);
  });

  // Edge case 7: DefinitionProviderStub returns exactly one Definition with all five required fields non-empty
  it("EC7: DefinitionProviderStub.provide returns one Definition with all five non-empty fields", () => {
    const provider = new DefinitionProviderStub();
    const result = provider.provide({ lemma: "run", language: "en" });

    expect(result).toHaveLength(1);
    const [def] = result;
    expect(def.term).toBeTruthy();
    expect(def.definition).toBeTruthy();
    expect(def.examples).toBeDefined();
    expect(def.examples.length).toBeGreaterThan(0);
    expect(def.examples[0]).toBeTruthy();
    expect(def.part_of_speech).toBeTruthy();
    expect(def.provider).toBeTruthy();
  });

  // Edge case 8: GapFillStub.fill returns definitions untouched, hints = 'stub-hint', gap_fill_metadata = {}
  it("EC8: GapFillStub.fill returns definitions reference-equal, hints = stub-hint, gap_fill_metadata = {}", () => {
    const gapFill = new GapFillStub();
    const definitions: Definition[] = [
      {
        term: "stub-term",
        definition: "A stub definition.",
        examples: ["Example."],
        part_of_speech: "noun",
        provider: "stub",
      },
    ];
    const result = gapFill.fill({
      definitions,
      context: { deck_id: "deck-1", user_id: "user-1" },
    });

    expect(result.definitions).toBe(definitions);
    expect(result.hints).toBe("stub-hint");
    expect(result.gap_fill_metadata).toEqual({});
  });

  // Edge case 9: CardAssemblerStub.assemble propagates deck_id, user_id, definition_id, hints unchanged
  it("EC9: CardAssemblerStub.assemble propagates deck_id, user_id, definition_id, hints from input to output", () => {
    const assembler = new CardAssemblerStub();
    const input: CardAssemblerInput = {
      deck_id: "deck-99",
      user_id: "user-99",
      definition_id: "def-99",
      hints: "my-hint",
    };
    const output = assembler.assemble(input);

    expect(output.deck_id).toBe(input.deck_id);
    expect(output.user_id).toBe(input.user_id);
    expect(output.definition_id).toBe(input.definition_id);
    expect(output.hints).toBe(input.hints);
  });

  // Edge case 10: CardOutput.nuance must be null in stub output
  it("EC10: CardOutput.nuance is null in stub output", () => {
    const card = service.run(DEFAULT_INPUT);
    expect(card.nuance).toBeNull();
  });

  // Edge case 11: CardOutput.created_at and updated_at are ISO string, not Date instances
  it("EC11: CardOutput.created_at and updated_at are ISO date strings (typeof string)", () => {
    const card = service.run(DEFAULT_INPUT);
    expect(typeof card.created_at).toBe("string");
    expect(typeof card.updated_at).toBe("string");
    // Validate ISO format
    expect(() => new Date(card.created_at)).not.toThrow();
    expect(() => new Date(card.updated_at)).not.toThrow();
    expect(new Date(card.created_at).toISOString()).toBe(card.created_at);
    expect(new Date(card.updated_at).toISOString()).toBe(card.updated_at);
  });

  // Edge case 12a: overriding CARD_ASSEMBLER via overrideProvider still resolves without changing PipelineModule wiring
  it("EC12a: overriding CARD_ASSEMBLER stub via overrideProvider resolves pipeline without error", async () => {
    const stubbedCard: CardOutput = {
      id: "override-id",
      deck_id: "deck-1",
      user_id: "user-1",
      definition_id: "override-def",
      front: "override-front",
      back: "override-back",
      hints: "override-hint",
      nuance: null,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    };

    const spyAssembleOverride = jest.fn().mockReturnValue(stubbedCard);
    const assemblerMock: ICardAssembler = { assemble: spyAssembleOverride };

    const overrideModule = await buildModule({
      [CARD_ASSEMBLER]: assemblerMock,
    });
    const svc = overrideModule.get<PipelineService>(PipelineService);

    const result = svc.run(DEFAULT_INPUT);
    expect(result.id).toBe("override-id");
    expect(spyAssembleOverride).toHaveBeenCalledTimes(1);

    await overrideModule.close();
  });

  // Edge case 12b: overriding NORMALIZER stub via overrideProvider still resolves without changing PipelineModule wiring
  it("EC12b: overriding NORMALIZER stub via overrideProvider resolves pipeline without error", async () => {
    const normalizedOutput: NormalizedOutput = {
      normalized_form: "overridden-word",
      is_multi_word: false,
      pos: null,
    };

    const spyNormalizeOverride = jest.fn().mockReturnValue(normalizedOutput);
    const normalizerMock: INormalizer = { normalize: spyNormalizeOverride };

    const overrideModule = await buildModule({ [NORMALIZER]: normalizerMock });
    const svc = overrideModule.get<PipelineService>(PipelineService);

    const result = svc.run(DEFAULT_INPUT);
    expect(result).toBeDefined();
    expect(spyNormalizeOverride).toHaveBeenCalledTimes(1);
    expect(spyNormalizeOverride).toHaveBeenCalledWith({
      raw: DEFAULT_INPUT.raw,
    });

    await overrideModule.close();
  });

  // Happy path: PipelineService.run returns correct field values end-to-end
  it("happy path: run returns card with deck_id, user_id, and stub-hint", () => {
    const card = service.run(DEFAULT_INPUT);
    expect(card.deck_id).toBe(DEFAULT_INPUT.deck_id);
    expect(card.user_id).toBe(DEFAULT_INPUT.user_id);
    expect(card.hints).toBe("stub-hint");
    expect(card.id).toBe("stub-card-id");
    expect(card.front).toBe("stub-front");
    expect(card.back).toBe("stub-back");
  });
});

describe("NormalizerStub", () => {
  it("normalize propagates raw as normalized_form", () => {
    const stub = new NormalizerStub();
    const result = stub.normalize({ raw: "hello" });
    expect(result.normalized_form).toBe("hello");
    expect(result.is_multi_word).toBe(false);
    expect(result.pos).toBeNull();
  });
});

describe("PreLemmatizerStub", () => {
  it("preLemmatize propagates normalized_form as lemma", () => {
    const stub = new PreLemmatizerStub();
    const result = stub.preLemmatize({
      normalized_form: "running",
      is_multi_word: false,
      pos: null,
    });
    expect(result.lemma).toBe("running");
    expect(result.short_circuited).toBe(false);
  });
});

describe("LemmatizerStub", () => {
  it("lemmatize propagates lemma unchanged", () => {
    const stub = new LemmatizerStub();
    const result = stub.lemmatize({ lemma: "run", short_circuited: false });
    expect(result.lemma).toBe("run");
  });
});

describe("DuplicateCheckerStub", () => {
  it("check always returns empty array regardless of input", () => {
    const stub = new DuplicateCheckerStub();
    expect(stub.check({ lemma: "test", deck_id: "deck-1" })).toEqual([]);
    expect(
      stub.check({ lemma: "test", deck_id: "deck-1", definition_id: "def-1" }),
    ).toEqual([]);
  });
});

describe("DefinitionProviderStub", () => {
  it("provide returns one definition with all required fields", () => {
    const stub = new DefinitionProviderStub();
    const result = stub.provide({ lemma: "word", language: "en" });
    expect(result).toHaveLength(1);
    const [def] = result;
    expect(def.term).toBeTruthy();
    expect(def.definition).toBeTruthy();
    expect(def.examples.length).toBeGreaterThan(0);
    expect(def.part_of_speech).toBeTruthy();
    expect(def.provider).toBeTruthy();
  });
});

describe("GapFillStub", () => {
  it("fill returns definitions reference intact, hints = stub-hint, metadata = {}", () => {
    const stub = new GapFillStub();
    const defs: Definition[] = [
      {
        term: "t",
        definition: "d",
        examples: ["e"],
        part_of_speech: "noun",
        provider: "p",
      },
    ];
    const result = stub.fill({
      definitions: defs,
      context: { deck_id: "deck-1", user_id: "user-1" },
    });
    expect(result.definitions).toBe(defs);
    expect(result.hints).toBe("stub-hint");
    expect(result.gap_fill_metadata).toEqual({});
  });
});

describe("CardAssemblerStub", () => {
  it("assemble propagates all input fields to output", () => {
    const stub = new CardAssemblerStub();
    const input: CardAssemblerInput = {
      deck_id: "deck-42",
      user_id: "user-42",
      definition_id: "def-42",
      hints: "hint-42",
    };
    const output = stub.assemble(input);
    expect(output.deck_id).toBe(input.deck_id);
    expect(output.user_id).toBe(input.user_id);
    expect(output.definition_id).toBe(input.definition_id);
    expect(output.hints).toBe(input.hints);
    expect(output.nuance).toBeNull();
    expect(typeof output.created_at).toBe("string");
    expect(typeof output.updated_at).toBe("string");
  });
});
