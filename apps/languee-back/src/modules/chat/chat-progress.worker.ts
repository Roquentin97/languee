import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../core/prisma/prisma.service';
import { ChatProgressService } from './chat-progress.service';

const MAX_USERS_PER_TICK = 20;
const DEFAULT_INTERVAL_MS = 60000;

/**
 * Periodically scans for users whose chat analysis snapshot history has
 * moved ahead of their last computed progress stats: users with at least
 * one ChatAnalysisSnapshot newer than their latest ChatProgressStat.computedAt,
 * or with snapshots but no stats yet. Prisma cannot compare aggregates
 * across nested relations directly, so — mirroring ChatAnalysisWorker — the
 * "newer than" comparison is done in application code after fetching each
 * user's latest snapshot and latest computedAt. Processes up to 20 users
 * per tick. Does not start when NODE_ENV === 'test'.
 */
@Injectable()
export class ChatProgressWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatProgressWorker.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly progressService: ChatProgressService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('app.nodeEnv') === 'test') return;

    const intervalMs =
      this.config.get<number>('chat.progressIntervalMs') ?? DEFAULT_INTERVAL_MS;

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
    const candidates = await this.prisma.user.findMany({
      where: {
        chatConversations: { some: { analysisSnapshots: { some: {} } } },
      },
      select: {
        id: true,
        chatConversations: {
          select: {
            analysisSnapshots: {
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        chatProgressStats: {
          select: { computedAt: true },
          orderBy: { computedAt: 'desc' },
          take: 1,
        },
      },
    });

    const stale = candidates
      .filter((user) => {
        const latestSnapshotAt = user.chatConversations
          .flatMap((c) => c.analysisSnapshots)
          .reduce<Date | null>(
            (latest, s) =>
              latest === null || s.createdAt > latest ? s.createdAt : latest,
            null,
          );
        if (latestSnapshotAt === null) return false;

        const latestComputedAt = user.chatProgressStats[0]?.computedAt ?? null;
        return latestComputedAt === null || latestSnapshotAt > latestComputedAt;
      })
      .slice(0, MAX_USERS_PER_TICK);

    for (const user of stale) {
      try {
        await this.progressService.recomputeForUser(user.id);
      } catch (err: unknown) {
        this.logger.error({
          message: 'chat progress tick failed for user',
          event: 'chat.progress_worker_failed',
          method: this.runTick.name,
          data: {
            userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    if (stale.length > 0) {
      this.logger.debug({
        message: 'chat progress tick completed',
        event: 'chat.progress_worker_tick_completed',
        method: this.runTick.name,
        data: { processedCount: stale.length },
      });
    }
  }
}
