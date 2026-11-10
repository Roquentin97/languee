import { NlpService } from '../../../lexicon/enrichment/nlp/nlp.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import {
  APP_VERSION,
  HEALTH_CHECK_TIMEOUT_MS,
  HealthService,
} from './health.service';

describe('HealthService', () => {
  const prismaQuery = jest.fn();
  const redisPing = jest.fn();
  const nlpCheckReady = jest.fn();
  const prisma = { $queryRaw: prismaQuery } as unknown as PrismaService;
  const redis = { ping: redisPing } as unknown as RedisService;
  const nlp = { checkReady: nlpCheckReady } as unknown as NlpService;
  let service: HealthService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaQuery.mockResolvedValue([{ '?column?': 1 }]);
    redisPing.mockResolvedValue(undefined);
    nlpCheckReady.mockResolvedValue(undefined);
    service = new HealthService(prisma, redis, nlp);
  });

  it('returns ready when PostgreSQL, Redis, and NLP are available', async () => {
    await expect(service.isReady()).resolves.toBe(true);

    expect(prismaQuery).toHaveBeenCalledTimes(1);
    expect(redisPing).toHaveBeenCalledTimes(1);
    expect(nlpCheckReady).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PostgreSQL', prismaQuery],
    ['Redis', redisPing],
    ['NLP', nlpCheckReady],
  ])('returns not ready when %s fails', async (_, check) => {
    check.mockRejectedValue(new Error('dependency unavailable'));

    await expect(service.isReady()).resolves.toBe(false);
  });

  it('returns not ready when a dependency times out', async () => {
    jest.useFakeTimers();
    prismaQuery.mockReturnValue(new Promise<never>(() => undefined));

    const readiness = service.isReady();
    await jest.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);

    await expect(readiness).resolves.toBe(false);
    jest.useRealTimers();
  });

  it('returns not ready when a dependency throws synchronously', async () => {
    redisPing.mockImplementation(() => {
      throw new Error('dependency unavailable');
    });

    await expect(service.isReady()).resolves.toBe(false);
  });

  it('returns liveness without querying dependencies', () => {
    expect(service.getLive()).toEqual({ status: 'ok' });

    expect(prismaQuery).not.toHaveBeenCalled();
    expect(redisPing).not.toHaveBeenCalled();
    expect(nlpCheckReady).not.toHaveBeenCalled();
  });

  describe('getVersion', () => {
    afterEach(() => {
      delete process.env.GIT_SHA;
      delete process.env.APP_VERSION;
    });

    it('returns the app version and defaults commit to unknown', () => {
      expect(APP_VERSION).toBe('0.0.0');
      expect(service.getVersion()).toEqual({
        version: APP_VERSION,
        commit: 'unknown',
      });
    });

    it('reflects GIT_SHA when set', () => {
      process.env.GIT_SHA = 'abc1234';

      expect(service.getVersion()).toEqual({
        version: APP_VERSION,
        commit: 'abc1234',
      });
    });

    it('reflects APP_VERSION when set', () => {
      process.env.APP_VERSION = '2.3.4';

      expect(service.getVersion()).toEqual({
        version: '2.3.4',
        commit: 'unknown',
      });
    });
  });
});
