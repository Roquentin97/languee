import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../core/prisma/prisma.service';
import { ChatAnalysisService } from './chat-analysis.service';

const MAX_CONVERSATIONS_PER_TICK = 10;
const DEFAULT_INTERVAL_MS = 30000;

/**
 * Periodically scans for conversations that need (re-)analysis:
 * analyzedAt IS NULL, or analyzedAt < updatedAt, restricted to conversations
 * that have at least one message. Prisma's query builder cannot compare two
 * columns on the same row directly (that needs raw SQL), so the
 * analyzedAt < updatedAt half of the condition is evaluated in application
 * code after fetching candidates that have messages. Processes up to 10
 * conversations per tick. Does not start when NODE_ENV === 'test'.
 */
@Injectable()
export class ChatAnalysisWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatAnalysisWorker.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly analysisService: ChatAnalysisService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.nodeEnv') === 'test') return;

    const intervalMs =
      this.config.get<number>('chat.analysisIntervalMs') ?? DEFAULT_INTERVAL_MS;

    this.intervalHandle = setInterval(() => {
      void this.runTick();
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runTick(): Promise<void> {
    const candidates = await this.prisma.chatConversation.findMany({
      where: { messages: { some: {} } },
      select: { id: true, analyzedAt: true, updatedAt: true },
    });

    const stale = candidates
      .filter((c) => c.analyzedAt === null || c.analyzedAt < c.updatedAt)
      .slice(0, MAX_CONVERSATIONS_PER_TICK);

    for (const conversation of stale) {
      try {
        await this.analysisService.analyzeConversation(conversation.id);
      } catch (err: unknown) {
        this.logger.error({
          message: 'chat analysis tick failed for conversation',
          event: 'chat.worker_analysis_failed',
          method: this.runTick.name,
          data: {
            conversationId: conversation.id,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    if (stale.length > 0) {
      this.logger.debug({
        message: 'chat analysis tick completed',
        event: 'chat.worker_tick_completed',
        method: this.runTick.name,
        data: { processedCount: stale.length },
      });
    }
  }
}
