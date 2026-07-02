import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../core/prisma/prisma.service';
import { ChatService } from './chat.service';
import { ChatAnalysisService } from './chat-analysis.service';
import { ChatConversationNotFoundError } from './chat.errors';
import { CHAT_BOT_ADAPTER } from './chat.tokens';
import type { IChatBotAdapter } from './interfaces/chat-bot-adapter.interface';

const NOW = new Date('2026-07-02T12:00:00.000Z');

const mockConversation = {
  id: 'conv-1',
  userId: 'user-1',
  title: 'Practicing small talk',
  analyzedAt: null as Date | null,
  createdAt: NOW,
  updatedAt: NOW,
};

const mockPrismaService = {
  chatConversation: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  chatMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  chatSuggestion: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(
    async (ops: unknown[]): Promise<unknown[]> => Promise.all(ops),
  ),
};

const mockChatBotAdapter: jest.Mocked<IChatBotAdapter> = {
  providerName: 'stub',
  reply: jest.fn(),
};

const mockAnalysisService = {
  analyzeConversation: jest.fn(),
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAnalysisService.analyzeConversation.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CHAT_BOT_ADAPTER, useValue: mockChatBotAdapter },
        { provide: ChatAnalysisService, useValue: mockAnalysisService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createConversation()', () => {
    it('happy path — creates a conversation with a title and zero messages', async () => {
      mockPrismaService.chatConversation.create.mockResolvedValue(
        mockConversation,
      );

      const result = await service.createConversation(
        'user-1',
        'Practicing small talk',
      );

      expect(result).toEqual({
        id: 'conv-1',
        title: 'Practicing small talk',
        createdAt: NOW,
        updatedAt: NOW,
        messageCount: 0,
      });
      expect(mockPrismaService.chatConversation.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', title: 'Practicing small talk' },
      });
    });

    it('edge case — creates a conversation without a title (null)', async () => {
      mockPrismaService.chatConversation.create.mockResolvedValue({
        ...mockConversation,
        title: null,
      });

      const result = await service.createConversation('user-1');

      expect(result.title).toBeNull();
      expect(mockPrismaService.chatConversation.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', title: null },
      });
    });
  });

  describe('listConversations()', () => {
    it('happy path — includes message count and last message preview', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        {
          ...mockConversation,
          messages: [{ content: 'Hello there, how are you today?' }],
          _count: { messages: 3 },
        },
      ]);

      const result = await service.listConversations('user-1');

      expect(result).toEqual([
        {
          id: 'conv-1',
          title: 'Practicing small talk',
          createdAt: NOW,
          updatedAt: NOW,
          messageCount: 3,
          lastMessagePreview: 'Hello there, how are you today?',
        },
      ]);
    });

    it('edge case — no conversations returns an empty array', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([]);

      const result = await service.listConversations('user-1');

      expect(result).toEqual([]);
    });

    it('edge case — conversation with no messages has a null preview', async () => {
      mockPrismaService.chatConversation.findMany.mockResolvedValue([
        { ...mockConversation, messages: [], _count: { messages: 0 } },
      ]);

      const result = await service.listConversations('user-1');

      expect(result[0]?.lastMessagePreview).toBeNull();
      expect(result[0]?.messageCount).toBe(0);
    });
  });

  describe('getConversation()', () => {
    it('happy path — returns conversation detail with ordered messages', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue({
        ...mockConversation,
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'Hi',
            createdAt: NOW,
          },
        ],
      });

      const result = await service.getConversation('user-1', 'conv-1');

      expect(result).toEqual({
        id: 'conv-1',
        title: 'Practicing small talk',
        createdAt: NOW,
        messages: [{ id: 'm1', role: 'user', content: 'Hi', createdAt: NOW }],
      });
    });

    it('edge case — throws ChatConversationNotFoundError for a foreign/unknown conversation', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversation('user-1', 'unknown-conv'),
      ).rejects.toBeInstanceOf(ChatConversationNotFoundError);
    });
  });

  describe('postMessage()', () => {
    it('happy path — persists both messages, calls the adapter with prior history, and triggers analysis', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(
        mockConversation,
      );
      mockPrismaService.chatMessage.findMany.mockResolvedValue([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ]);
      mockChatBotAdapter.reply.mockResolvedValue('Tell me more about that.');
      mockPrismaService.chatMessage.create
        .mockResolvedValueOnce({
          id: 'user-msg-1',
          role: 'user',
          content: 'I went to the store.',
          createdAt: NOW,
        })
        .mockResolvedValueOnce({
          id: 'assistant-msg-1',
          role: 'assistant',
          content: 'Tell me more about that.',
          createdAt: NOW,
        });
      mockPrismaService.chatConversation.update.mockResolvedValue(
        mockConversation,
      );

      const result = await service.postMessage(
        'user-1',
        'conv-1',
        'I went to the store.',
      );

      expect(mockChatBotAdapter.reply.mock.calls[0]).toEqual([
        {
          conversationId: 'conv-1',
          history: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello!' },
          ],
          userMessage: 'I went to the store.',
        },
      ]);
      expect(result).toEqual({
        userMessage: {
          id: 'user-msg-1',
          role: 'user',
          content: 'I went to the store.',
          createdAt: NOW,
        },
        assistantMessage: {
          id: 'assistant-msg-1',
          role: 'assistant',
          content: 'Tell me more about that.',
          createdAt: NOW,
        },
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);

      // fire-and-forget: give the microtask queue a tick to run
      await Promise.resolve();
      expect(mockAnalysisService.analyzeConversation).toHaveBeenCalledWith(
        'conv-1',
      );
    });

    it('edge case — throws ChatConversationNotFoundError for a foreign/unknown conversation and never calls the adapter', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.postMessage('user-1', 'unknown-conv', 'Hello'),
      ).rejects.toBeInstanceOf(ChatConversationNotFoundError);
      expect(mockChatBotAdapter.reply.mock.calls).toHaveLength(0);
    });

    it('edge case — logs but does not throw when analysis fails in the background', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(
        mockConversation,
      );
      mockPrismaService.chatMessage.findMany.mockResolvedValue([]);
      mockChatBotAdapter.reply.mockResolvedValue('Hi!');
      mockPrismaService.chatMessage.create
        .mockResolvedValueOnce({
          id: 'user-msg-1',
          role: 'user',
          content: 'Hi',
          createdAt: NOW,
        })
        .mockResolvedValueOnce({
          id: 'assistant-msg-1',
          role: 'assistant',
          content: 'Hi!',
          createdAt: NOW,
        });
      mockPrismaService.chatConversation.update.mockResolvedValue(
        mockConversation,
      );
      mockAnalysisService.analyzeConversation.mockRejectedValue(
        new Error('boom'),
      );

      await expect(
        service.postMessage('user-1', 'conv-1', 'Hi'),
      ).resolves.toBeDefined();

      await Promise.resolve();
      await Promise.resolve();
    });

    it('edge case — logs a non-Error background analysis rejection using String()', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(
        mockConversation,
      );
      mockPrismaService.chatMessage.findMany.mockResolvedValue([]);
      mockChatBotAdapter.reply.mockResolvedValue('Hi!');
      mockPrismaService.chatMessage.create
        .mockResolvedValueOnce({
          id: 'user-msg-1',
          role: 'user',
          content: 'Hi',
          createdAt: NOW,
        })
        .mockResolvedValueOnce({
          id: 'assistant-msg-1',
          role: 'assistant',
          content: 'Hi!',
          createdAt: NOW,
        });
      mockPrismaService.chatConversation.update.mockResolvedValue(
        mockConversation,
      );

      mockAnalysisService.analyzeConversation.mockRejectedValue(
        'a plain string rejection',
      );

      await expect(
        service.postMessage('user-1', 'conv-1', 'Hi'),
      ).resolves.toBeDefined();

      await Promise.resolve();
      await Promise.resolve();
    });
  });

  describe('getSuggestions()', () => {
    it('happy path — returns suggestions and analyzedAt', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue({
        ...mockConversation,
        analyzedAt: NOW,
      });
      mockPrismaService.chatSuggestion.findMany.mockResolvedValue([
        {
          id: 'sugg-1',
          type: 'overused_word',
          title: 'You used "basically" 5 times',
          detail: 'Consider varying your word choice.',
          payload: { word: 'basically', count: 5, ratio: 0.1, synonyms: [] },
          createdAt: NOW,
        },
      ]);

      const result = await service.getSuggestions('user-1', 'conv-1');

      expect(result).toEqual({
        suggestions: [
          {
            id: 'sugg-1',
            type: 'overused_word',
            title: 'You used "basically" 5 times',
            detail: 'Consider varying your word choice.',
            payload: {
              word: 'basically',
              count: 5,
              ratio: 0.1,
              synonyms: [],
            },
            createdAt: NOW,
          },
        ],
        analyzedAt: NOW,
      });
    });

    it('edge case — a suggestion with a null payload is passed through as null', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue({
        ...mockConversation,
        analyzedAt: NOW,
      });
      mockPrismaService.chatSuggestion.findMany.mockResolvedValue([
        {
          id: 'sugg-1',
          type: 'grammar',
          title: 'Some rule',
          detail: 'Some detail',
          payload: null,
          createdAt: NOW,
        },
      ]);

      const result = await service.getSuggestions('user-1', 'conv-1');

      expect(result.suggestions[0]?.payload).toBeNull();
    });

    it('edge case — throws ChatConversationNotFoundError for a foreign/unknown conversation', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(null);

      await expect(
        service.getSuggestions('user-1', 'unknown-conv'),
      ).rejects.toBeInstanceOf(ChatConversationNotFoundError);
    });

    it('edge case — analyzedAt is null before the conversation has been analyzed', async () => {
      mockPrismaService.chatConversation.findFirst.mockResolvedValue(
        mockConversation,
      );
      mockPrismaService.chatSuggestion.findMany.mockResolvedValue([]);

      const result = await service.getSuggestions('user-1', 'conv-1');

      expect(result.analyzedAt).toBeNull();
      expect(result.suggestions).toEqual([]);
    });
  });
});
