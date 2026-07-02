import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CHAT_BOT_ADAPTER } from './chat.tokens';
import type { IChatBotAdapter } from './interfaces/chat-bot-adapter.interface';
import { ChatConversationNotFoundError } from './chat.errors';
import { ChatAnalysisService } from './chat-analysis.service';
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationSummary,
  PostMessageResult,
  SuggestionsResult,
} from './chat.types';

const PREVIEW_LENGTH = 80;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHAT_BOT_ADAPTER)
    private readonly chatBotAdapter: IChatBotAdapter,
    private readonly analysisService: ChatAnalysisService,
  ) {}

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<ConversationSummary> {
    const conversation = await this.prisma.chatConversation.create({
      data: { userId, title: title ?? null },
    });

    this.logger.log({
      message: 'chat conversation created',
      event: 'chat.conversation_created',
      method: this.createConversation.name,
      data: { conversationId: conversation.id, userId },
    });

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: 0,
    };
  }

  async listConversations(userId: string): Promise<ConversationListItem[]> {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation._count.messages,
      lastMessagePreview:
        conversation.messages[0] !== undefined
          ? conversation.messages[0].content.slice(0, PREVIEW_LENGTH)
          : null,
    }));
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetail> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (conversation === null) throw new ChatConversationNotFoundError();

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
  }

  async postMessage(
    userId: string,
    conversationId: string,
    content: string,
  ): Promise<PostMessageResult> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (conversation === null) throw new ChatConversationNotFoundError();

    const priorMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    const history = priorMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantReply = await this.chatBotAdapter.reply({
      conversationId,
      history,
      userMessage: content,
    });

    const [userMessage, assistantMessage] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { conversationId, role: 'user', content },
      }),
      this.prisma.chatMessage.create({
        data: { conversationId, role: 'assistant', content: assistantReply },
      }),
      this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: { title: conversation.title },
      }),
    ]);

    this.logger.log({
      message: 'chat message exchanged',
      event: 'chat.message_exchanged',
      method: this.postMessage.name,
      data: { conversationId, userId },
    });

    void this.analysisService
      .analyzeConversation(conversationId)
      .catch((err: unknown) => {
        this.logger.error({
          message: 'chat analysis failed',
          event: 'chat.analysis_failed',
          method: this.postMessage.name,
          data: {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      });

    return {
      userMessage: {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    };
  }

  async getSuggestions(
    userId: string,
    conversationId: string,
  ): Promise<SuggestionsResult> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (conversation === null) throw new ChatConversationNotFoundError();

    const suggestions = await this.prisma.chatSuggestion.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      suggestions: suggestions.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        detail: s.detail,
        payload: (s.payload as Record<string, unknown> | null) ?? null,
        createdAt: s.createdAt,
      })),
      analyzedAt: conversation.analyzedAt,
    };
  }
}
