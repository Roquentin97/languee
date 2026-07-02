import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  computeWeeklyProgress,
  isoWeekStartUTC,
  type ProgressSnapshotInput,
} from './chat-progress-computation';
import type {
  ChatSuggestionType,
  ProgressResult,
  ProgressTypeBreakdown,
  ProgressWeek,
} from './chat.types';

const SUGGESTION_TYPES: readonly ChatSuggestionType[] = [
  'overused_word',
  'grammar',
  'style',
];
const WEEKS_IN_RESPONSE = 8;

@Injectable()
export class ChatProgressService {
  private readonly logger = new Logger(ChatProgressService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full stateless recomputation of a user's weekly progress stats from
   * their conversations' analysis snapshot history and user message counts.
   * Upserts one ChatProgressStat row per week that has any activity
   * (raised/resolved fingerprints or user messages sent). Safe to run
   * repeatedly — history is append-only, so recomputation is idempotent.
   */
  async recomputeForUser(userId: string): Promise<void> {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { userId },
      select: {
        analysisSnapshots: {
          orderBy: { createdAt: 'asc' },
          select: {
            userMessageCount: true,
            fingerprints: true,
            createdAt: true,
          },
        },
        messages: {
          where: { role: 'user' },
          select: { createdAt: true },
        },
      },
    });

    const conversationsSnapshots: ProgressSnapshotInput[][] = conversations.map(
      (conversation) =>
        conversation.analysisSnapshots.map((snapshot) => ({
          userMessageCount: snapshot.userMessageCount,
          fingerprints: snapshot.fingerprints as string[],
          createdAt: snapshot.createdAt,
        })),
    );

    const userMessagesByWeek = new Map<string, number>();
    for (const conversation of conversations) {
      for (const message of conversation.messages) {
        const weekStart = isoWeekStartUTC(message.createdAt);
        userMessagesByWeek.set(
          weekStart,
          (userMessagesByWeek.get(weekStart) ?? 0) + 1,
        );
      }
    }

    const buckets = computeWeeklyProgress(
      conversationsSnapshots,
      userMessagesByWeek,
    );
    const computedAt = new Date();

    for (const bucket of buckets.values()) {
      const weekStart = new Date(`${bucket.weekStart}T00:00:00.000Z`);
      await this.prisma.chatProgressStat.upsert({
        where: { userId_weekStart: { userId, weekStart } },
        create: {
          userId,
          weekStart,
          raised: bucket.raised,
          resolved: bucket.resolved,
          raisedByType: bucket.raisedByType,
          resolvedByType: bucket.resolvedByType,
          userMessages: bucket.userMessages,
          computedAt,
        },
        update: {
          raised: bucket.raised,
          resolved: bucket.resolved,
          raisedByType: bucket.raisedByType,
          resolvedByType: bucket.resolvedByType,
          userMessages: bucket.userMessages,
          computedAt,
        },
      });
    }

    this.logger.log({
      message: 'user chat progress recomputed',
      event: 'chat.progress_recomputed',
      method: this.recomputeForUser.name,
      data: { userId, weeksComputed: buckets.size },
    });
  }

  /**
   * Reads stored ChatProgressStat rows only — never recomputes on the fly.
   * `activeConversations` is the one live value, counted cheaply from the
   * user's own ChatConversation/ChatMessage rows at read time.
   */
  async getProgress(userId: string): Promise<ProgressResult> {
    const stats = await this.prisma.chatProgressStat.findMany({
      where: { userId },
      orderBy: { weekStart: 'asc' },
    });

    const activeConversations = await this.prisma.chatConversation.count({
      where: { userId, messages: { some: {} } },
    });

    if (stats.length === 0) {
      return {
        totalRaised: 0,
        totalResolved: 0,
        totalUserMessages: 0,
        activeConversations,
        byType: SUGGESTION_TYPES.map((type) => ({
          type,
          raised: 0,
          resolved: 0,
        })),
        weeks: [],
        computedAt: null,
      };
    }

    const totalRaised = stats.reduce((sum, s) => sum + s.raised, 0);
    const totalResolved = stats.reduce((sum, s) => sum + s.resolved, 0);
    const totalUserMessages = stats.reduce((sum, s) => sum + s.userMessages, 0);

    const byType: ProgressTypeBreakdown[] = SUGGESTION_TYPES.map((type) => {
      const raised = stats.reduce((sum, s) => {
        const counts = s.raisedByType as Record<string, number>;
        return sum + (counts[type] ?? 0);
      }, 0);
      const resolved = stats.reduce((sum, s) => {
        const counts = s.resolvedByType as Record<string, number>;
        return sum + (counts[type] ?? 0);
      }, 0);
      return { type, raised, resolved };
    });

    const weeks: ProgressWeek[] = stats.slice(-WEEKS_IN_RESPONSE).map((s) => ({
      weekStart: s.weekStart.toISOString().slice(0, 10),
      raised: s.raised,
      resolved: s.resolved,
      userMessages: s.userMessages,
    }));

    const computedAt = stats.reduce<Date>(
      (latest, s) => (s.computedAt > latest ? s.computedAt : latest),
      stats[0].computedAt,
    );

    return {
      totalRaised,
      totalResolved,
      totalUserMessages,
      activeConversations,
      byType,
      weeks,
      computedAt,
    };
  }
}
