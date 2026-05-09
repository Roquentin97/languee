import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../core/redis/redis.service';
import { JwtStrategy } from './jwt.strategy';

const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
} as unknown as ConfigService;

const mockRedisService = {
  get: jest.fn(),
} as unknown as jest.Mocked<Pick<RedisService, 'get'>>;

function makeSession(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sessionId: 'session-123',
    userId: 'user-123',
    hashedRefreshToken: 'hashed-refresh-token',
    userAgent: 'test-agent',
    ip: '127.0.0.1',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    revoked: false,
    ...overrides,
  });
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      mockConfigService,
      mockRedisService as unknown as RedisService,
    );
  });

  it('returns the current user when the Redis session is active', async () => {
    mockRedisService.get.mockResolvedValue(makeSession());

    await expect(
      strategy.validate({ sub: 'user-123', session_id: 'session-123' }),
    ).resolves.toEqual({ userId: 'user-123', sessionId: 'session-123' });

    expect(mockRedisService.get).toHaveBeenCalledWith('session:session-123');
  });

  it('rejects access tokens whose session no longer exists', async () => {
    mockRedisService.get.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'user-123', session_id: 'session-123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects access tokens for revoked sessions', async () => {
    mockRedisService.get.mockResolvedValue(makeSession({ revoked: true }));

    await expect(
      strategy.validate({ sub: 'user-123', session_id: 'session-123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects access tokens when the session belongs to another user', async () => {
    mockRedisService.get.mockResolvedValue(makeSession({ userId: 'user-456' }));

    await expect(
      strategy.validate({ sub: 'user-123', session_id: 'session-123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects access tokens when the stored session id does not match', async () => {
    mockRedisService.get.mockResolvedValue(
      makeSession({ sessionId: 'session-456' }),
    );

    await expect(
      strategy.validate({ sub: 'user-123', session_id: 'session-123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed session data', async () => {
    mockRedisService.get.mockResolvedValue('not-json');

    await expect(
      strategy.validate({ sub: 'user-123', session_id: 'session-123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
