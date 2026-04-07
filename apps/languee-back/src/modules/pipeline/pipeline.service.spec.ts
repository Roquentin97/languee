import { Test, TestingModule } from "@nestjs/testing";
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
import {
  INormalizer,
  ICardAssembler,
  CardOutput,
} from "./interfaces/pipeline.interfaces";
import { NormalizerStub } from "./stages/normalizer.stub";
import { PreLemmatizerStub } from "./stages/pre-lemmatizer.stub";
import { LemmatizerStub } from "./stages/lemmatizer.stub";
import { DuplicateCheckerStub } from "./stages/duplicate-checker.stub";
import { DefinitionProviderStub } from "./stages/definition-provider.stub";
import { GapFillStub } from "./stages/gap-fill.stub";
import { CardAssemblerStub } from "./stages/card-assembler.stub";

const defaultProviders = [
  { provide: NORMALIZER, useClass: NormalizerStub },
  { provide: PRE_LEMMATIZER, useClass: PreLemmatizerStub },
  { provide: LEMMATIZER, useClass: LemmatizerStub },
  { provide: DUPLICATE_CHECKER, useClass: DuplicateCheckerStub },
  { provide: DEFINITION_PROVIDER, useClass: DefinitionProviderStub },
  { provide: GAP_FILL_SERVICE, useClass: GapFillStub },
  { provide: CARD_ASSEMBLER, useClass: CardAssemblerStub },
  PipelineService,
];

const defaultInput = {
  raw: "hello",
  deck_id: "deck-1",
  user_id: "user-1",
  language: "en",
};

describe("PipelineService", () => {
  let service: PipelineService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: defaultProviders,
    }).compile();
    service = moduleRef.get(PipelineService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("happy path: run returns a CardOutput shaped object", () => {
    const result = service.run(defaultInput);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("definition_id");
    expect(result).toHaveProperty("deck_id");
    expect(result).toHaveProperty("user_id");
    expect(result).toHaveProperty("term");
    expect(result).toHaveProperty("lemma");
    expect(result).toHaveProperty("definition");
    expect(result).toHaveProperty("examples");
    expect(result).toHaveProperty("part_of_speech");
    expect(result).toHaveProperty("hints");
    expect(result).toHaveProperty("nuance");
    expect(result).toHaveProperty("created_at");
    expect(result).toHaveProperty("updated_at");
  });

  it("edge case 1: run with empty raw string must not throw and return CardOutput shape", () => {
    const input = { ...defaultInput, raw: "" };
    expect(() => service.run(input)).not.toThrow();
    const result = service.run(input);
    const keys: Array<keyof CardOutput> = [
      "id",
      "definition_id",
      "deck_id",
      "user_id",
      "term",
      "lemma",
      "definition",
      "examples",
      "part_of_speech",
      "hints",
      "nuance",
      "created_at",
      "updated_at",
    ];
    keys.forEach((key) => expect(result).toHaveProperty(key));
  });

  it("edge case 2: run with multi-word string must not throw and return CardOutput shape", () => {
    const input = { ...defaultInput, raw: "hello world foo" };
    expect(() => service.run(input)).not.toThrow();
    const result = service.run(input);
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("term");
  });
});

describe("PipelineService — edge case 10: DI override", () => {
  it("replacing a single stub via override must not require wiring changes", async () => {
    const customCard: CardOutput = {
      id: "custom-id",
      definition_id: "custom-def-id",
      deck_id: "custom-deck-id",
      user_id: "custom-user-id",
      term: "custom-term",
      lemma: "custom-lemma",
      definition: "Custom definition.",
      examples: [],
      part_of_speech: "verb",
      hints: "custom-hint",
      nuance: null,
      created_at: new Date("2024-01-01T00:00:00.000Z"),
      updated_at: new Date("2024-01-01T00:00:00.000Z"),
    };

    const customAssembler: ICardAssembler = {
      assemble: () => customCard,
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: defaultProviders,
    })
      .overrideProvider(CARD_ASSEMBLER)
      .useValue(customAssembler)
      .compile();

    const svc = moduleRef.get(PipelineService);
    const result = svc.run(defaultInput);
    expect(result).toEqual(customCard);
  });

  it("replacing NormalizerStub via override must propagate through the pipeline", async () => {
    const customNormalizer: INormalizer = {
      normalize: (_input) => ({
        normalized_form: "overridden",
        is_multi_word: true,
        pos: "noun",
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: defaultProviders,
    })
      .overrideProvider(NORMALIZER)
      .useValue(customNormalizer)
      .compile();

    const svc = moduleRef.get(PipelineService);
    expect(() => svc.run(defaultInput)).not.toThrow();
  });
});
