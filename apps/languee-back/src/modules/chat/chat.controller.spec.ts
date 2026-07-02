import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatConversationNotFoundError } from './chat.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

const NOW = new Date('2026-07-02T12:00:00.000Z');

const mockUser: CurrentUserPayload = {
  userId: 'user-id-1',
  sessionId: 'session-id-1',
};

const mockChatService = {
  createConversation: jest.fn(),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  postMessage: jest.fn(),
  getSuggestions: jest.fn(),
};

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockChatService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create()', () => {
    it('happy path — creates a conversation and serializes the response', async () => {
      mockChatService.createConversation.mockResolvedValue({
        id: 'conv-1',
        title: 'Practicing small talk',
        createdAt: NOW,
        updatedAt: NOW,
        messageCount: 0,
      });

      const result = await controller.create(mockUser, {
        title: 'Practicing small talk',
      });

      expect(result).toEqual({
        id: 'conv-1',
        title: 'Practicing small talk',
        createdAt: NOW,
        updatedAt: NOW,
        messageCount: 0,
      });
      expect(mockChatService.createConversation).toHaveBeenCalledWith(
        'user-id-1',
        'Practicing small talk',
      );
    });
  });

  describe('list()', () => {
    it('happy path — returns conversations wrapped in an object', async () => {
      mockChatService.listConversations.mockResolvedValue([
        {
          id: 'conv-1',
          title: null,
          createdAt: NOW,
          updatedAt: NOW,
          messageCount: 2,
          lastMessagePreview: 'Hi there',
        },
      ]);

      const result = await controller.list(mockUser);

      expect(result.conversations).toHaveLength(1);
      expect(mockChatService.listConversations).toHaveBeenCalledWith(
        'user-id-1',
      );
    });
  });

  describe('getOne()', () => {
    it('happy path — returns conversation detail', async () => {
      mockChatService.getConversation.mockResolvedValue({
        id: 'conv-1',
        title: null,
        createdAt: NOW,
        messages: [],
      });

      const result = await controller.getOne('conv-1', mockUser);

      expect(result.id).toBe('conv-1');
      expect(mockChatService.getConversation).toHaveBeenCalledWith(
        'user-id-1',
        'conv-1',
      );
    });

    it('maps ChatConversationNotFoundError to a 404 NotFoundException', async () => {
      mockChatService.getConversation.mockRejectedValue(
        new ChatConversationNotFoundError(),
      );

      await expect(
        controller.getOne('unknown-conv', mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('re-throws unrelated errors unchanged', async () => {
      mockChatService.getConversation.mockRejectedValue(new Error('boom'));

      await expect(controller.getOne('conv-1', mockUser)).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('postMessage()', () => {
    it('happy path — posts a message and returns both messages', async () => {
      mockChatService.postMessage.mockResolvedValue({
        userMessage: {
          id: 'm1',
          role: 'user',
          content: 'Hi',
          createdAt: NOW,
        },
        assistantMessage: {
          id: 'm2',
          role: 'assistant',
          content: 'Hello!',
          createdAt: NOW,
        },
      });

      const result = await controller.postMessage(
        'conv-1',
        { content: 'Hi' },
        mockUser,
      );

      expect(result.userMessage.content).toBe('Hi');
      expect(result.assistantMessage.content).toBe('Hello!');
      expect(mockChatService.postMessage).toHaveBeenCalledWith(
        'user-id-1',
        'conv-1',
        'Hi',
      );
    });

    it('maps ChatConversationNotFoundError to a 404 NotFoundException', async () => {
      mockChatService.postMessage.mockRejectedValue(
        new ChatConversationNotFoundError(),
      );

      await expect(
        controller.postMessage('unknown-conv', { content: 'Hi' }, mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('re-throws unrelated errors unchanged', async () => {
      mockChatService.postMessage.mockRejectedValue(new Error('boom'));

      await expect(
        controller.postMessage('conv-1', { content: 'Hi' }, mockUser),
      ).rejects.toThrow('boom');
    });
  });

  describe('getSuggestions()', () => {
    it('happy path — returns suggestions and analyzedAt', async () => {
      mockChatService.getSuggestions.mockResolvedValue({
        suggestions: [],
        analyzedAt: null,
      });

      const result = await controller.getSuggestions('conv-1', mockUser);

      expect(result).toEqual({ suggestions: [], analyzedAt: null });
    });

    it('happy path — serializes a populated suggestion list', async () => {
      const createdAt = new Date('2026-07-02T12:00:00.000Z');
      mockChatService.getSuggestions.mockResolvedValue({
        suggestions: [
          {
            id: 'sugg-1',
            type: 'overused_word',
            title: 'You used "basically" 5 times',
            detail: 'Consider varying your word choice.',
            payload: { word: 'basically', count: 5 },
            createdAt,
          },
        ],
        analyzedAt: createdAt,
      });

      const result = await controller.getSuggestions('conv-1', mockUser);

      expect(result).toEqual({
        suggestions: [
          {
            id: 'sugg-1',
            type: 'overused_word',
            title: 'You used "basically" 5 times',
            detail: 'Consider varying your word choice.',
            payload: { word: 'basically', count: 5 },
            createdAt,
          },
        ],
        analyzedAt: createdAt,
      });
    });

    it('maps ChatConversationNotFoundError to a 404 NotFoundException', async () => {
      mockChatService.getSuggestions.mockRejectedValue(
        new ChatConversationNotFoundError(),
      );

      await expect(
        controller.getSuggestions('unknown-conv', mockUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('re-throws unrelated errors unchanged', async () => {
      mockChatService.getSuggestions.mockRejectedValue(new Error('boom'));

      await expect(
        controller.getSuggestions('conv-1', mockUser),
      ).rejects.toThrow('boom');
    });
  });
});
