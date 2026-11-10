import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { NlpService } from '../../../lexicon/enrichment/nlp/nlp.service';

export const APP_VERSION = '0.0.0';
export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly nlp: NlpService,
  ) {}

  getHello(): { success: boolean } {
    return { success: true };
  }

  getLive(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async isReady(): Promise<boolean> {
    const results = await Promise.allSettled([
      this.checkWithTimeout(() => this.prisma.$queryRaw`SELECT 1`),
      this.checkWithTimeout(() => this.redis.ping()),
      this.checkWithTimeout(() => this.nlp.checkReady()),
    ]);

    return results.every((result) => result.status === 'fulfilled');
  }

  getVersion(): { version: string; commit: string } {
    return {
      version: process.env.APP_VERSION ?? APP_VERSION,
      commit: process.env.GIT_SHA ?? 'unknown',
    };
  }

  private async checkWithTimeout(
    check: () => PromiseLike<unknown>,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        Promise.resolve().then(check),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Health dependency check timed out')),
            HEALTH_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
