import { Test, TestingModule } from '@nestjs/testing';
import { PipelineService } from './pipeline.service';
import {
  NORMALIZER,
  PRE_LEMMATIZER,
  LEMMATIZER,
  DUPLICATE_CHECKER,
  DEFINITION_PROVIDER,
  GAP_FILL_SERVICE,
  CARD_ASSEMBLER,
} from './pipeline.tokens';
import {
  INormalizer,
  IPreLemmatizer,
  ILemmatizer,
  IDuplicateChecker,
  IDefinitionProvider,
  IGapFillService,
  ICardAssembler,
  CardOutput,
} from './interfaces/pipeline.interfaces';
import { NormalizerStub } from './stages/normalizer.stub';
import { PreLemmatizerStub } from './stages/pre-lemmatizer.stub';
import { LemmatizerStub } from './stages/lemmatizer.stub';
import { DuplicateCheckerStub } from './stages/duplicate-checker.stub';
import { DefinitionProviderStub } from './stages/definition-provider.stub';
import { GapFillStub } from './stages/gap-fill.stub';
import { CardAssemblerStub } from './stages/card-assembler.stub';

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

async function buildModule(overrides: { provide: string; useValue: unknown }[] = []) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [...defaultProviders, ...overrides],
  })
    .overrideProvider(overrides[0]?.provide ?? NORMALIZER)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    .useValue(overrides[0]?.useValue ?? new NormalizerStub())
    .compile();
  return moduleRef.get(PipelineService);
}

describe('PipelineService', () => {
  let service: PipelineService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: defaultProviders,
    }).compile();
    service = moduleRef.get(PipelineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('happy path: run returns a CardOutput shaped object', () => {
    const result = service.run('hello');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('term');
    expect(result).toHaveProperty('lemma');
    expect(result).toHaveProperty('definition');
    expect(result).toHaveProperty('examples');
    expect(result).toHaveProperty('pos');
    expect(result).toHaveProperty('is_multi_word');
    expect(result).toHaveProperty('gap_fill_metadata');
  });

  it('edge case 1: run with empty string must not throw and return CardOutput shape', () => {
    expect(() => service.run('')).not.toThrow();
    const result = service.run('');
    const keys: Array<keyof CardOutput> = [
      'id',
      'term',
      'lemma',
      'definition',
      'examples',
      'pos',
      'is_multi_word',
      'gap_fill_metadata',
    ];
    keys.forEach((key) => expect(result).toHaveProperty(key));
  });

  it('edge case 2: run with multi-word string must not throw and return CardOutput shape', () => {
    expect(() => service.run('hello world foo')).not.toThrow();
    const result = service.run('hello world foo');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('term');
  });
});

describe('PipelineService — edge case 10: DI override', () => {
  it('replacing a single stub via override must not require wiring changes', async () => {
    const customCard: CardOutput = {
      id: 'custom-id',
      term: 'custom-term',
      lemma: 'custom-lemma',
      definition: 'Custom definition.',
      examples: [],
      pos: 'verb',
      is_multi_word: false,
      gap_fill_metadata: { custom: true },
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
    const result = svc.run('test');
    expect(result).toEqual(customCard);
  });

  it('replacing NormalizerStub via override must propagate through the pipeline', async () => {
    const customNormalizer: INormalizer = {
      normalize: (_input) => ({
        normalized_form: 'overridden',
        is_multi_word: true,
        pos: 'noun',
      }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: defaultProviders,
    })
      .overrideProvider(NORMALIZER)
      .useValue(customNormalizer)
      .compile();

    const svc = moduleRef.get(PipelineService);
    // Should not throw — the rest of the pipeline handles the overridden output
    expect(() => svc.run('anything')).not.toThrow();
  });
});
