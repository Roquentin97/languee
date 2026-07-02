import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../core/prisma/prisma.service';
import { ChatAnalysisService } from './chat-analysis.service';
import { ChatAnalysisWorker } from './chat-analysis.worker';

const mockConfigService = {
  get: jest.fn(),
};

const mockPrismaService = {
  chatConversation: {
    findMany: jest.fn(),
  },
};

const mockAnalysisService = {
  analyzeConversation: jest.fn(),
};

describe('ChatAnalysisWorker', () => {
  let worker: ChatAnalysisWorker;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatAnalysisWorker,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ChatAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();

    worker = module.get<ChatAnalysisWorker>(ChatAnalysisWorker);
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

    expect(mockPrismaService.chatConversation.findMany).not.toHaveBeenCalled();
  });

  it('schedules the interval and runs ticks when NODE_ENV is not "test"', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      if (key === 'chat.analysisIntervalMs') return 5000;
      return undefined;
    });
    mockPrismaService.chatConversation.findMany.mockResolvedValue([]);

    worker.onModuleInit();
    jest.advanceTimersByTime(5000);

    expect(mockPrismaService.chatConversation.findMany).toHaveBeenCalledTimes(
      1,
    );
  });

  it('defaults the interval to 30000ms when chat.analysisIntervalMs is not configured', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      return undefined;
    });
    mockPrismaService.chatConversation.findMany.mockResolvedValue([]);

    worker.onModuleInit();
    jest.advanceTimersByTime(29999);
    expect(mockPrismaService.chatConversation.findMany).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockPrismaService.chatConversation.findMany).toHaveBeenCalledTimes(
      1,
    );
  });

  it('onModuleDestroy clears the scheduled interval', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'app.nodeEnv') return 'development';
      if (key === 'chat.analysisIntervalMs') return 5000;
      return undefined;
    });
    mockPrismaService.chatConversation.findMany.mockResolvedValue([]);

    worker.onModuleInit();
    worker.onModuleDestroy();
    jest.advanceTimersByTime(20000);

    expect(mockPrismaService.chatConversation.findMany).not.toHaveBeenCalled();
  });

  describe('runTick()', () => {
    it('processes conversations with analyzedAt = null or analyzedAt < updatedAt, up to 10', async () => {
      const now = new Date('2026-07-02T12:00:00.000Z');
      const earlier = new Date('2026-07-01T12:00:00.000Z');
      const conversations = Array.from({ length: 12 }, (_, i) => ({
        id: `conv-${i}`,
        analyzedAt: i % 2 === 0 ? null : earlier,
        updatedAt: now,
      }));
      // Add one already up-to-date conversation that must be excluded.
      conversations.push({ id: 'up-to-date', analyzedAt: now, updatedAt: now });
      mockPrismaService.chatConversation.findMany.mockResolvedValue(
        conversations,
      );
      mockAnalysisService.analyzeConversation.mockResolvedValue(undefined);

      await worker.runTick();

      expect(mockAnalysisService.analyzeConversation).toHaveBeenCalledTimes(10);
      expect(mockAnalysisService.analyzeConversation).not.toHaveBeenCalledWith(
        'up-to-date',
      );
    });

    it('continues processing remaining conversations when one analysis call fails', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        { id: 'conv-a', analyzedAt: null, updatedAt: new Date() },
        { id: 'conv-b', analyzedAt: null, updatedAt: new Date() },
      ]);
      mockAnalysisService.analyzeConversation
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await expect(worker.runTick()).resolves.toBeUndefined();

      expect(mockAnalysisService.analyzeConversation).toHaveBeenCalledTimes(2);
    });

    it('does nothing when there are no stale conversations', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([]);

      await worker.runTick();

      expect(mockAnalysisService.analyzeConversation).not.toHaveBeenCalled();
    });

    it('logs a non-Error rejection using String() instead of .message', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        { id: 'conv-a', analyzedAt: null, updatedAt: new Date() },
      ]);

      mockAnalysisService.analyzeConversation.mockRejectedValueOnce(
        'a plain string rejection',
      );

      await expect(worker.runTick()).resolves.toBeUndefined();
    });
  });
});
