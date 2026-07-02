import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { WordsService } from '../words/words.service';
import { DefinitionService } from '../definitions/definitions.service';
import { SynonymsService } from '../synonyms/synonyms.service';
import { ChatAnalysisService } from './chat-analysis.service';

const NOW = new Date('2026-07-02T12:00:00.000Z');

const mockPrismaService = {
  chatMessage: {
    findMany: jest.fn(),
  },
  chatSuggestion: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  chatConversation: {
    update: jest.fn(),
  },
  $transaction: jest.fn(
    async (ops: unknown[]): Promise<unknown[]> => Promise.all(ops),
  ),
};

const mockWordsService = {
  findByLemma: jest.fn(),
};

const mockDefinitionService = {
  findByWordId: jest.fn(),
};

const mockSynonymsService = {
  findSynonymAnswersForDefinition: jest.fn(),
};

type CreatedSuggestion = {
  type: 'overused_word' | 'grammar' | 'style';
  title: string;
  detail: string;
  payload: Record<string, unknown>;
};

type CreateManyArg = { data: CreatedSuggestion[] };

function getCreateManyArg(): CreateManyArg {
  const call = mockPrismaService.chatSuggestion.createMany.mock
    .calls[0] as unknown[];
  return call[0] as CreateManyArg;
}

describe('ChatAnalysisService', () => {
  let service: ChatAnalysisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);

    mockPrismaService.chatSuggestion.deleteMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.chatSuggestion.createMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.chatConversation.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatAnalysisService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WordsService, useValue: mockWordsService },
        { provide: DefinitionService, useValue: mockDefinitionService },
        { provide: SynonymsService, useValue: mockSynonymsService },
      ],
    }).compile();

    service = module.get<ChatAnalysisService>(ChatAnalysisService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('happy path — replaces suggestions transactionally and stamps analyzedAt', async () => {
    mockPrismaService.chatMessage.findMany.mockResolvedValue([
      { id: 'm1', content: 'Hi there.' },
    ]);
    mockWordsService.findByLemma.mockResolvedValue(null);

    await service.analyzeConversation('conv-1');

    expect(mockPrismaService.chatMessage.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', role: 'user' },
      orderBy: { createdAt: 'asc' },
    });
    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrismaService.chatSuggestion.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1' },
    });
    expect(mockPrismaService.chatConversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { analyzedAt: NOW },
    });
  });

  it('happy path — enriches an overused word with synonyms from Words/Definition/Synonyms services', async () => {
    const filler = Array(72).fill('the').join(' ');
    mockPrismaService.chatMessage.findMany.mockResolvedValue([
      { id: 'm1', content: `banana banana banana ${filler}` },
    ]);
    mockWordsService.findByLemma.mockResolvedValue({
      id: 'word-1',
      lemma: 'banana',
    });
    mockDefinitionService.findByWordId.mockResolvedValue([
      { id: 'def-1' },
      { id: 'def-2' },
    ]);
    mockSynonymsService.findSynonymAnswersForDefinition
      .mockResolvedValueOnce([
        { lemma: 'plantain', definitionId: 'other-1' },
        { lemma: 'banana', definitionId: 'other-2' },
      ])
      .mockResolvedValueOnce([{ lemma: 'fruit', definitionId: 'other-3' }]);

    await service.analyzeConversation('conv-1');

    expect(mockWordsService.findByLemma).toHaveBeenCalledWith('banana', 'en');
    const createManyCall = getCreateManyArg();
    const overuseSuggestion = createManyCall.data.find(
      (s) => s.type === 'overused_word',
    );
    expect(overuseSuggestion?.payload['synonyms']).toEqual([
      'plantain',
      'fruit',
    ]);
    expect(overuseSuggestion?.title).toBe('You used "banana" 3 times');
    expect(overuseSuggestion?.detail).toContain('plantain, fruit');
  });

  it('caps enriched synonyms at 5 even when more definitions/answers are available', async () => {
    const filler = Array(72).fill('the').join(' ');
    mockPrismaService.chatMessage.findMany.mockResolvedValue([
      { id: 'm1', content: `banana banana banana ${filler}` },
    ]);
    mockWordsService.findByLemma.mockResolvedValue({
      id: 'word-1',
      lemma: 'banana',
    });
    mockDefinitionService.findByWordId.mockResolvedValue([
      { id: 'def-1' },
      { id: 'def-2' },
      { id: 'def-3' },
      { id: 'def-4' },
    ]);
    mockSynonymsService.findSynonymAnswersForDefinition
      .mockResolvedValueOnce([
        { lemma: 'plantain', definitionId: 'o-1' },
        { lemma: 'fruit', definitionId: 'o-2' },
        { lemma: 'produce', definitionId: 'o-3' },
      ])
      .mockResolvedValueOnce([
        { lemma: 'snack', definitionId: 'o-4' },
        { lemma: 'treat', definitionId: 'o-5' },
        { lemma: 'never-added', definitionId: 'o-6' },
      ])
      .mockResolvedValueOnce([{ lemma: 'extra', definitionId: 'o-7' }]);

    await service.analyzeConversation('conv-1');

    const createManyCall = getCreateManyArg();
    const overuseSuggestion = createManyCall.data.find(
      (s) => s.type === 'overused_word',
    );
    expect(overuseSuggestion?.payload['synonyms']).toEqual([
      'plantain',
      'fruit',
      'produce',
      'snack',
      'treat',
    ]);
    // The third definition's answers must never be requested once the cap
    // of 5 synonyms has already been reached.
    expect(
      mockSynonymsService.findSynonymAnswersForDefinition,
    ).toHaveBeenCalledTimes(2);
  });

  it('edge case — no synonyms found still produces the overused-word suggestion without a synonym list', async () => {
    const filler = Array(72).fill('the').join(' ');
    mockPrismaService.chatMessage.findMany.mockResolvedValue([
      { id: 'm1', content: `banana banana banana ${filler}` },
    ]);
    mockWordsService.findByLemma.mockResolvedValue(null);

    await service.analyzeConversation('conv-1');

    const createManyCall = getCreateManyArg();
    const overuseSuggestion = createManyCall.data.find(
      (s) => s.type === 'overused_word',
    );
    expect(overuseSuggestion?.payload['synonyms']).toEqual([]);
    expect(overuseSuggestion?.detail).not.toContain('Try alternatives');
  });

  it('edge case — no user messages still runs the transaction with zero suggestions', async () => {
    mockPrismaService.chatMessage.findMany.mockResolvedValue([]);

    await service.analyzeConversation('conv-1');

    const createManyCall = getCreateManyArg();
    expect(createManyCall.data).toEqual([]);
    expect(mockPrismaService.chatConversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { analyzedAt: NOW },
    });
  });

  it('includes grammar and style suggestions in the same createMany call', async () => {
    mockPrismaService.chatMessage.findMany.mockResolvedValue([
      { id: 'm1', content: 'i saw a elephant.' },
    ]);
    mockWordsService.findByLemma.mockResolvedValue(null);

    await service.analyzeConversation('conv-1');

    const createManyCall = getCreateManyArg();
    const types = createManyCall.data.map((s) => s.type);
    expect(types).toContain('grammar');
  });
});
