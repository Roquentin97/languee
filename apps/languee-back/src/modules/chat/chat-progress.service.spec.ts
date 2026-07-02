import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { ChatProgressService } from './chat-progress.service';

const NOW = new Date('2026-07-03T00:00:00.000Z');

const mockPrismaService = {
  chatConversation: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  chatProgressStat: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

type UpsertArg = {
  where: Record<string, { userId: string; weekStart: Date }>;
  create: {
    raised: number;
    resolved: number;
    raisedByType: Record<string, number>;
    resolvedByType: Record<string, number>;
    userMessages: number;
    computedAt: Date;
  };
};

function getUpsertArgs(): UpsertArg[] {
  const calls = mockPrismaService.chatProgressStat.upsert.mock
    .calls as unknown[];
  return calls.map((call) => (call as unknown[])[0] as UpsertArg);
}

describe('ChatProgressService', () => {
  let service: ChatProgressService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);

    mockPrismaService.chatProgressStat.upsert.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatProgressService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ChatProgressService>(ChatProgressService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recomputeForUser()', () => {
    it('upserts one ChatProgressStat row per week with any activity', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        {
          analysisSnapshots: [
            {
              userMessageCount: 0,
              fingerprints: ['grammar:duplicated_word'],
              createdAt: new Date('2026-06-15T00:00:00.000Z'),
            },
            {
              userMessageCount: 5,
              fingerprints: [],
              createdAt: new Date('2026-06-22T00:00:00.000Z'),
            },
          ],
          messages: [
            { createdAt: new Date('2026-06-15T10:00:00.000Z') },
            { createdAt: new Date('2026-06-22T10:00:00.000Z') },
          ],
        },
      ]);

      await service.recomputeForUser('user-1');

      expect(mockPrismaService.chatProgressStat.upsert).toHaveBeenCalledTimes(
        2,
      );

      const raisedWeekArg = getUpsertArgs().find(
        (arg) =>
          arg.where['userId_weekStart']?.weekStart.toISOString() ===
          '2026-06-15T00:00:00.000Z',
      );
      expect(raisedWeekArg?.where['userId_weekStart']?.userId).toBe('user-1');
      expect(raisedWeekArg?.create.raised).toBe(1);
      expect(raisedWeekArg?.create.resolved).toBe(0);
      expect(raisedWeekArg?.create.userMessages).toBe(1);
    });

    it('is idempotent — running twice yields the same upsert data', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        {
          analysisSnapshots: [
            {
              userMessageCount: 0,
              fingerprints: ['overused_word:basically'],
              createdAt: new Date('2026-06-15T00:00:00.000Z'),
            },
            {
              userMessageCount: 6,
              fingerprints: [],
              createdAt: new Date('2026-06-16T00:00:00.000Z'),
            },
          ],
          messages: [{ createdAt: new Date('2026-06-15T10:00:00.000Z') }],
        },
      ]);

      await service.recomputeForUser('user-1');
      const firstRunCreates = getUpsertArgs().map((arg) => arg.create);

      mockPrismaService.chatProgressStat.upsert.mockClear();

      await service.recomputeForUser('user-1');
      const secondRunCreates = getUpsertArgs().map((arg) => arg.create);

      expect(secondRunCreates).toEqual(firstRunCreates);
    });

    it('edge case — a user with no snapshots and no messages upserts nothing', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        { analysisSnapshots: [], messages: [] },
      ]);

      await service.recomputeForUser('user-1');

      expect(mockPrismaService.chatProgressStat.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getProgress()', () => {
    it('empty state — zeros, null resolutionRate-equivalent computedAt, and empty weeks when there are no stats', async () => {
      mockPrismaService.chatProgressStat.findMany.mockResolvedValue([]);
      mockPrismaService.chatConversation.count.mockResolvedValue(0);

      const result = await service.getProgress('user-1');

      expect(result).toEqual({
        totalRaised: 0,
        totalResolved: 0,
        totalUserMessages: 0,
        activeConversations: 0,
        byType: [
          { type: 'overused_word', raised: 0, resolved: 0 },
          { type: 'grammar', raised: 0, resolved: 0 },
          { type: 'style', raised: 0, resolved: 0 },
        ],
        weeks: [],
        computedAt: null,
      });
    });

    it('happy path — aggregates totals and per-type counts across stored weeks', async () => {
      mockPrismaService.chatProgressStat.findMany.mockResolvedValue([
        {
          weekStart: new Date('2026-06-15T00:00:00.000Z'),
          raised: 4,
          resolved: 1,
          raisedByType: { overused_word: 2, grammar: 1, style: 1 },
          resolvedByType: { overused_word: 1, grammar: 0, style: 0 },
          userMessages: 30,
          computedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        {
          weekStart: new Date('2026-06-22T00:00:00.000Z'),
          raised: 3,
          resolved: 2,
          raisedByType: { overused_word: 1, grammar: 1, style: 1 },
          resolvedByType: { overused_word: 1, grammar: 1, style: 0 },
          userMessages: 20,
          computedAt: new Date('2026-07-02T00:00:00.000Z'),
        },
      ]);
      mockPrismaService.chatConversation.count.mockResolvedValue(3);

      const result = await service.getProgress('user-1');

      expect(result.totalRaised).toBe(7);
      expect(result.totalResolved).toBe(3);
      expect(result.totalUserMessages).toBe(50);
      expect(result.activeConversations).toBe(3);
      expect(result.byType).toEqual([
        { type: 'overused_word', raised: 3, resolved: 2 },
        { type: 'grammar', raised: 2, resolved: 1 },
        { type: 'style', raised: 2, resolved: 0 },
      ]);
      expect(result.weeks).toEqual([
        { weekStart: '2026-06-15', raised: 4, resolved: 1, userMessages: 30 },
        { weekStart: '2026-06-22', raised: 3, resolved: 2, userMessages: 20 },
      ]);
      expect(result.computedAt).toEqual(new Date('2026-07-02T00:00:00.000Z'));
      expect(mockPrismaService.chatConversation.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', messages: { some: {} } },
      });
    });
  });
});
