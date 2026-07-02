import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../core/prisma/prisma.service';
import { ChatProgressService } from './chat-progress.service';
import { ChatProgressWorker } from './chat-progress.worker';

const mockConfigService = {
  get: jest.fn(),
};

const mockPrismaService = {
  user: {
    findMany: jest.fn(),
  },
};

const mockProgressService = {
  recomputeForUser: jest.fn(),
};

function userWithSnapshotAndComputedAt(
  id: string,
  latestSnapshotAt: Date | null,
  latestComputedAt: Date | null,
): unknown {
  return {
    id,
    chatConversations:
      latestSnapshotAt === null
        ? []
        : [{ analysisSnapshots: [{ createdAt: latestSnapshotAt }] }],
    chatProgressStats:
      latestComputedAt === null ? [] : [{ computedAt: latestComputedAt }],
  };
}

describe('ChatProgressWorker', () => {
  let worker: ChatProgressWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatProgressWorker,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ChatProgressService, useValue: mockProgressService },
      ],
    }).compile();

    worker = module.get<ChatProgressWorker>(ChatProgressWorker);
  });

  afterEach(() => {
    worker.onModuleDestroy();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  it('does not schedule the interval when NODE_ENV is "test"', () => {
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'app.nodeEnv' ? 'test' : undefined,
    );

    worker.onModuleInit();
    jest.advanceTimersByTime(60000);

    expect(mockPrismaService.user.findMany).not.toHaveBeenCalled();
  });

  it('schedules the interval and runs ticks when NODE_ENV is not "test"', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      if (key === 'chat.progressIntervalMs') return 5000;
      return undefined;
    });
    mockPrismaService.user.findMany.mockResolvedValue([]);

    worker.onModuleInit();
    jest.advanceTimersByTime(5000);

    expect(mockPrismaService.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('defaults the interval to 60000ms when chat.progressIntervalMs is not configured', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      return undefined;
    });
    mockPrismaService.user.findMany.mockResolvedValue([]);

    worker.onModuleInit();
    jest.advanceTimersByTime(59999);
    expect(mockPrismaService.user.findMany).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockPrismaService.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy clears the scheduled interval', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      if (key === 'chat.progressIntervalMs') return 5000;
      return undefined;
    });
    mockPrismaService.user.findMany.mockResolvedValue([]);

    worker.onModuleInit();
    worker.onModuleDestroy();
    jest.advanceTimersByTime(20000);

    expect(mockPrismaService.user.findMany).not.toHaveBeenCalled();
  });

  describe('runTick()', () => {
    it('recomputes users with a snapshot newer than their latest computedAt, up to 20', async () => {
      const older = new Date('2026-07-01T00:00:00.000Z');
      const newer = new Date('2026-07-02T00:00:00.000Z');
      const users = Array.from({ length: 22 }, (_, i) =>
        userWithSnapshotAndComputedAt(`user-${i}`, newer, older),
      );
      mockPrismaService.user.findMany.mockResolvedValue(users);
      mockProgressService.recomputeForUser.mockResolvedValue(undefined);

      await worker.runTick();

      expect(mockProgressService.recomputeForUser).toHaveBeenCalledTimes(20);
    });

    it('recomputes a user with snapshots but no stats yet', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        userWithSnapshotAndComputedAt(
          'user-a',
          new Date('2026-07-01T00:00:00.000Z'),
          null,
        ),
      ]);
      mockProgressService.recomputeForUser.mockResolvedValue(undefined);

      await worker.runTick();

      expect(mockProgressService.recomputeForUser).toHaveBeenCalledWith(
        'user-a',
      );
    });

    it('skips a user whose latest computedAt is already up to date', async () => {
      const same = new Date('2026-07-01T00:00:00.000Z');
      mockPrismaService.user.findMany.mockResolvedValue([
        userWithSnapshotAndComputedAt('user-a', same, same),
      ]);

      await worker.runTick();

      expect(mockProgressService.recomputeForUser).not.toHaveBeenCalled();
    });

    it('continues processing remaining users when one recompute call fails', async () => {
      const older = new Date('2026-07-01T00:00:00.000Z');
      const newer = new Date('2026-07-02T00:00:00.000Z');
      mockPrismaService.user.findMany.mockResolvedValue([
        userWithSnapshotAndComputedAt('user-a', newer, older),
        userWithSnapshotAndComputedAt('user-b', newer, older),
      ]);
      mockProgressService.recomputeForUser
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await expect(worker.runTick()).resolves.toBeUndefined();

      expect(mockProgressService.recomputeForUser).toHaveBeenCalledTimes(2);
    });

    it('does nothing when there are no candidate users', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await worker.runTick();

      expect(mockProgressService.recomputeForUser).not.toHaveBeenCalled();
    });

    it('logs a non-Error rejection using String() instead of .message', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        userWithSnapshotAndComputedAt(
          'user-a',
          new Date('2026-07-01T00:00:00.000Z'),
          null,
        ),
      ]);
      mockProgressService.recomputeForUser.mockRejectedValueOnce(
        'a plain string rejection',
      );

      await expect(worker.runTick()).resolves.toBeUndefined();
    });
  });
});
