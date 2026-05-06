import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../core/redis/redis.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt');

const bcryptMock = bcrypt as jest.Mocked<typeof bcrypt>;

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  smembers: jest.fn(),
};

const mockUsersService = {
  findByEmail: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn(),
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function makeSession(overrides: Record<string, unknown> = {}): string {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + THIRTY_DAYS_MS);
  return JSON.stringify({
    sessionId: 'session-uuid',
    userId: 'user-123',
    hashedRefreshToken: 'hashed-token',
    userAgent: 'test-agent',
    ip: '127.0.0.1',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revoked: false,
    ...overrides,
  });
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: JwtService, useValue: mockJwtService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── login ───────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'user@example.com', password: 'password123' };

    it('returns accessToken, plainRefreshToken, sessionId on valid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        passwordHash: 'hashed-pw',
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.hash.mockResolvedValue('hashed-refresh' as never);
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.sadd.mockResolvedValue(1);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.login(dto, 'Mozilla/5.0', '127.0.0.1');

      expect(result.accessToken).toBe('access-token');
      expect(result.plainRefreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();
    });

    it('stores session in Redis with 30d TTL after successful login', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        passwordHash: 'hashed-pw',
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.hash.mockResolvedValue('hashed-refresh' as never);
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.sadd.mockResolvedValue(1);
      mockJwtService.sign.mockReturnValue('access-token');

      await service.login(dto, 'agent', 'ip');

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [key, , ttl] = mockRedisService.set.mock.calls[0] as [
        string,
        string,
        number,
      ];
      expect(key).toMatch(/^session:/);
      expect(ttl).toBe(30 * 24 * 60 * 60);
    });

    it('throws 401 with "Invalid credentials" when email not found — no email leak', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.login(dto, 'agent', 'ip')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(service.login(dto, 'agent', 'ip')).rejects.toThrow(
        'Invalid credentials',
      );

      // dummy hash compare must still be called for timing safety
      expect(bcryptMock.compare).toHaveBeenCalled();
    });

    it('throws 401 with "Invalid credentials" when password is wrong', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        passwordHash: 'hashed-pw',
      });
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.login(dto, 'agent', 'ip')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(service.login(dto, 'agent', 'ip')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('adds sessionId to user_sessions set in Redis', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        passwordHash: 'hashed-pw',
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.hash.mockResolvedValue('hashed-refresh' as never);
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.sadd.mockResolvedValue(1);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.login(dto, 'agent', 'ip');

      expect(mockRedisService.sadd).toHaveBeenCalledWith(
        'user_sessions:user-123',
        result.sessionId,
      );
    });

    it('signs JWT with sub=userId and session_id', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        passwordHash: 'hashed-pw',
      });
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.hash.mockResolvedValue('hashed-refresh' as never);
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.sadd.mockResolvedValue(1);
      mockJwtService.sign.mockReturnValue('access-token');

      const result = await service.login(dto, 'agent', 'ip');

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-123',
        session_id: result.sessionId,
      });
    });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns new accessToken and plainRefreshToken on valid session', async () => {
      mockRedisService.get.mockResolvedValue(makeSession());
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.hash.mockResolvedValue('new-hashed-refresh' as never);
      mockRedisService.set.mockResolvedValue('OK');
      mockJwtService.sign.mockReturnValue('new-access-token');

      const result = await service.refresh('plain-token', 'session-uuid');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.plainRefreshToken).toBeDefined();
    });

    it('throws 401 "Session not found" when session_id missing from Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.refresh('token', 'bad-session')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(service.refresh('token', 'bad-session')).rejects.toThrow(
        'Session not found',
      );
    });

    it('throws 401 and revokes all sessions on replay attack (revoked session)', async () => {
      mockRedisService.get.mockResolvedValue(makeSession({ revoked: true }));
      mockRedisService.smembers.mockResolvedValue([]);

      await expect(service.refresh('token', 'session-uuid')).rejects.toThrow(
        UnauthorizedException,
      );

      // revokeAllUserSessions called — smembers invoked for user_sessions
      expect(mockRedisService.smembers).toHaveBeenCalledWith(
        'user_sessions:user-123',
      );
    });

    it('throws 401 "Invalid refresh token" when bcrypt.compare returns false (tampered token)', async () => {
      mockRedisService.get.mockResolvedValue(makeSession());
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(
        service.refresh('tampered-token', 'session-uuid'),
      ).rejects.toThrow('Invalid refresh token');

      // should NOT revoke all sessions
      expect(mockRedisService.smembers).not.toHaveBeenCalled();
    });

    it('throws 401 "Session expired" when expiresAt is in the past', async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      mockRedisService.get.mockResolvedValue(makeSession({ expiresAt: past }));
      bcryptMock.compare.mockResolvedValue(true as never);

      await expect(
        service.refresh('plain-token', 'session-uuid'),
      ).rejects.toThrow('Session expired');
    });

    it('updates hashedRefreshToken in Redis after successful refresh', async () => {
      mockRedisService.get.mockResolvedValue(makeSession());
      bcryptMock.compare.mockResolvedValue(true as never);
      bcryptMock.hash.mockResolvedValue('new-hashed-refresh' as never);
      mockRedisService.set.mockResolvedValue('OK');
      mockJwtService.sign.mockReturnValue('new-access-token');

      await service.refresh('plain-token', 'session-uuid');

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [, storedJson] = mockRedisService.set.mock.calls[0] as [
        string,
        string,
        number,
      ];
      const stored = JSON.parse(storedJson) as { hashedRefreshToken: string };
      expect(stored.hashedRefreshToken).toBe('new-hashed-refresh');
    });

    it('does not revokeAllUserSessions when token is merely invalid (tampered)', async () => {
      mockRedisService.get.mockResolvedValue(makeSession());
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.refresh('bad', 'session-uuid')).rejects.toThrow(
        'Invalid refresh token',
      );

      expect(mockRedisService.del).not.toHaveBeenCalled();
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('marks session as revoked in Redis and removes from user_sessions', async () => {
      mockRedisService.get.mockResolvedValue(makeSession());
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.srem.mockResolvedValue(1);

      await service.logout('session-uuid');

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [, storedJson] = mockRedisService.set.mock.calls[0] as [
        string,
        string,
        number,
      ];
      const stored = JSON.parse(storedJson) as { revoked: boolean };
      expect(stored.revoked).toBe(true);

      expect(mockRedisService.srem).toHaveBeenCalledWith(
        'user_sessions:user-123',
        'session-uuid',
      );
    });

    it('is a no-op when session does not exist in Redis', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.logout('missing-session')).resolves.toBeUndefined();
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  // ─── logoutAll ────────────────────────────────────────────────────────────

  describe('logoutAll', () => {
    it('revokes all user sessions and deletes the user_sessions set', async () => {
      mockRedisService.smembers.mockResolvedValue(['s1', 's2']);
      mockRedisService.get.mockResolvedValue(makeSession());
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.srem.mockResolvedValue(1);
      mockRedisService.del.mockResolvedValue(1);

      await service.logoutAll('user-123');

      expect(mockRedisService.del).toHaveBeenCalledWith(
        'user_sessions:user-123',
      );
    });

    it('is idempotent when user has no active sessions', async () => {
      mockRedisService.smembers.mockResolvedValue([]);
      mockRedisService.del.mockResolvedValue(0);

      await expect(service.logoutAll('user-123')).resolves.toBeUndefined();
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'user_sessions:user-123',
      );
    });

    it('marks each session as revoked', async () => {
      mockRedisService.smembers.mockResolvedValue(['s1']);
      mockRedisService.get.mockResolvedValue(makeSession({ sessionId: 's1' }));
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.srem.mockResolvedValue(1);
      mockRedisService.del.mockResolvedValue(1);

      await service.logoutAll('user-123');

      expect(mockRedisService.set).toHaveBeenCalledTimes(1);
      const [, storedJson] = mockRedisService.set.mock.calls[0] as [
        string,
        string,
        number,
      ];
      const stored = JSON.parse(storedJson) as { revoked: boolean };
      expect(stored.revoked).toBe(true);
    });
  });

  // ─── getSessions ──────────────────────────────────────────────────────────

  describe('getSessions', () => {
    it('returns active sessions without hashedRefreshToken', async () => {
      mockRedisService.smembers.mockResolvedValue(['s1']);
      mockRedisService.get.mockResolvedValue(makeSession());

      const result = await service.getSessions('user-123');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('hashedRefreshToken');
      expect(result[0]).toHaveProperty('sessionId');
      expect(result[0]).toHaveProperty('userId');
    });

    it('filters out revoked sessions', async () => {
      mockRedisService.smembers.mockResolvedValue(['s1', 's2']);
      mockRedisService.get
        .mockResolvedValueOnce(makeSession({ revoked: false }))
        .mockResolvedValueOnce(makeSession({ revoked: true }));

      const result = await service.getSessions('user-123');

      expect(result).toHaveLength(1);
    });

    it('returns empty array when user has no active sessions', async () => {
      mockRedisService.smembers.mockResolvedValue([]);

      const result = await service.getSessions('user-123');

      expect(result).toEqual([]);
    });

    it('filters out sessions whose Redis key is missing (stale set entry)', async () => {
      mockRedisService.smembers.mockResolvedValue(['s1', 's2']);
      mockRedisService.get
        .mockResolvedValueOnce(makeSession())
        .mockResolvedValueOnce(null);

      const result = await service.getSessions('user-123');

      expect(result).toHaveLength(1);
    });
  });

  // ─── replay attack after logoutAll ────────────────────────────────────────

  describe('replay attack after logoutAll', () => {
    it('calls revokeAllUserSessions on replay with empty sessions — idempotent', async () => {
      mockRedisService.get.mockResolvedValue(makeSession({ revoked: true }));
      mockRedisService.smembers.mockResolvedValue([]);
      mockRedisService.del.mockResolvedValue(0);

      await expect(
        service.refresh('any-token', 'session-uuid'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRedisService.smembers).toHaveBeenCalledWith(
        'user_sessions:user-123',
      );
      expect(mockRedisService.del).toHaveBeenCalledWith(
        'user_sessions:user-123',
      );
    });
  });
});
