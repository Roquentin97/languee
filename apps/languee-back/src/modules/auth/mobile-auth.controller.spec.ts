import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MobileAuthController } from './mobile-auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { MobileRefreshRequestDto } from './dto/mobile-refresh-request.dto';

const mockAuthService = {
  register: jest.fn(),
  loginMobile: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  logoutAll: jest.fn(),
  getSessions: jest.fn(),
};

const mockUser = { userId: 'user-123', sessionId: 'session-uuid' };

describe('MobileAuthController', () => {
  let controller: MobileAuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileAuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MobileAuthController>(MobileAuthController);
  });

  // ─── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = { email: 'new@example.com', password: 'password123' };
    const req = {
      headers: { 'user-agent': 'TestAgent/1.0' },
      ip: '127.0.0.1',
    } as unknown as Request;

    it('returns mobile response shape on successful registration', async () => {
      mockAuthService.register.mockResolvedValue(undefined);
      mockAuthService.loginMobile.mockResolvedValue({
        accessToken: 'access-token',
        plainRefreshToken: 'refresh-token',
        sessionId: 'session-uuid',
        userId: 'user-123',
        email: dto.email,
      });

      const result = await controller.register(dto, req);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionId: 'session-uuid',
        user: { id: 'user-123', email: dto.email },
      });
    });

    it('calls register then loginMobile with user-agent and ip from request', async () => {
      mockAuthService.register.mockResolvedValue(undefined);
      mockAuthService.loginMobile.mockResolvedValue({
        accessToken: 'access-token',
        plainRefreshToken: 'refresh-token',
        sessionId: 'session-uuid',
        userId: 'user-123',
        email: dto.email,
      });

      await controller.register(dto, req);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(mockAuthService.loginMobile).toHaveBeenCalledWith(
        dto,
        'TestAgent/1.0',
        '127.0.0.1',
      );
    });

    it('propagates ConflictException from AuthService.register on duplicate email', async () => {
      mockAuthService.register.mockRejectedValue(
        new ConflictException('Email already exists'),
      );

      await expect(controller.register(dto, req)).rejects.toThrow(
        ConflictException,
      );
      expect(mockAuthService.loginMobile).not.toHaveBeenCalled();
    });

    it('validates email and password requirements on RegisterDto', async () => {
      const invalidDto = new RegisterDto();
      invalidDto.email = 'not-an-email';
      invalidDto.password = 'short';

      const errors = await validate(invalidDto);
      const invalidProperties = errors.map((e) => e.property);

      expect(invalidProperties).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'user@example.com', password: 'password123' };
    const req = {
      headers: { 'user-agent': 'TestAgent/1.0' },
      ip: '10.0.0.1',
    } as unknown as Request;

    it('returns mobile response shape on successful login', async () => {
      mockAuthService.loginMobile.mockResolvedValue({
        accessToken: 'access-token',
        plainRefreshToken: 'refresh-token',
        sessionId: 'session-uuid',
        userId: 'user-123',
        email: dto.email,
      });

      const result = await controller.login(dto, req);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionId: 'session-uuid',
        user: { id: 'user-123', email: dto.email },
      });
    });

    it('calls loginMobile with user-agent and ip from request', async () => {
      mockAuthService.loginMobile.mockResolvedValue({
        accessToken: 'access-token',
        plainRefreshToken: 'refresh-token',
        sessionId: 'session-uuid',
        userId: 'user-123',
        email: dto.email,
      });

      await controller.login(dto, req);

      expect(mockAuthService.loginMobile).toHaveBeenCalledWith(
        dto,
        'TestAgent/1.0',
        '10.0.0.1',
      );
    });

    it('propagates UnauthorizedException from AuthService on wrong password', async () => {
      mockAuthService.loginMobile.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(controller.login(dto, req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates UnauthorizedException from AuthService on unknown email', async () => {
      mockAuthService.loginMobile.mockRejectedValue(
        new UnauthorizedException('Invalid credentials'),
      );

      await expect(
        controller.login({ email: 'ghost@example.com', password: 'pw' }, req),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────

  describe('refresh', () => {
    const dto: MobileRefreshRequestDto = {
      refreshToken: 'plain-refresh-token',
      sessionId: 'session-uuid',
    };

    it('returns new accessToken, refreshToken, and same sessionId on valid rotation', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'new-access-token',
        plainRefreshToken: 'new-refresh-token',
      });

      const result = await controller.refresh(dto);

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        sessionId: 'session-uuid',
      });
    });

    it('calls AuthService.refresh with refreshToken and sessionId from body', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'new-access-token',
        plainRefreshToken: 'new-refresh-token',
      });

      await controller.refresh(dto);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'plain-refresh-token',
        'session-uuid',
      );
    });

    it('propagates UnauthorizedException when session is expired', async () => {
      mockAuthService.refresh.mockRejectedValue(
        new UnauthorizedException('Session expired'),
      );

      await expect(controller.refresh(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates UnauthorizedException on replay attack (revoked session)', async () => {
      mockAuthService.refresh.mockRejectedValue(
        new UnauthorizedException(
          'Refresh token reuse detected — all sessions revoked',
        ),
      );

      await expect(controller.refresh(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('propagates UnauthorizedException when session does not exist', async () => {
      mockAuthService.refresh.mockRejectedValue(
        new UnauthorizedException('Session not found'),
      );

      await expect(
        controller.refresh({ refreshToken: 'tk', sessionId: 'missing' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('validates that refreshToken and sessionId are required strings', async () => {
      const emptyDto = new MobileRefreshRequestDto();
      // both fields left undefined

      const errors = await validate(emptyDto);
      const invalidProperties = errors.map((e) => e.property);

      expect(invalidProperties).toEqual(
        expect.arrayContaining(['refreshToken', 'sessionId']),
      );
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('returns { message: "Logged out" } on success', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(mockUser);

      expect(result).toEqual({ message: 'Logged out' });
    });

    it('calls AuthService.logout with sessionId from JWT payload, not from body', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout(mockUser);

      expect(mockAuthService.logout).toHaveBeenCalledWith('session-uuid');
    });
  });

  // ─── logoutAll ───────────────────────────────────────────────────────────

  describe('logoutAll', () => {
    it('returns { message: "Logged out from all sessions" } on success', async () => {
      mockAuthService.logoutAll.mockResolvedValue(undefined);

      const result = await controller.logoutAll(mockUser);

      expect(result).toEqual({ message: 'Logged out from all sessions' });
    });

    it('calls AuthService.logoutAll with userId from JWT payload', async () => {
      mockAuthService.logoutAll.mockResolvedValue(undefined);

      await controller.logoutAll(mockUser);

      expect(mockAuthService.logoutAll).toHaveBeenCalledWith('user-123');
    });

    it('completes without error when user has no active sessions', async () => {
      mockAuthService.logoutAll.mockResolvedValue(undefined);

      await expect(controller.logoutAll(mockUser)).resolves.toEqual({
        message: 'Logged out from all sessions',
      });
    });
  });

  // ─── getSessions ─────────────────────────────────────────────────────────

  describe('getSessions', () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    it('returns array of session objects without hashedRefreshToken', async () => {
      const sessions = [
        {
          sessionId: 'session-uuid',
          userId: 'user-123',
          userAgent: 'TestAgent',
          ip: '127.0.0.1',
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          revoked: false,
        },
      ];
      mockAuthService.getSessions.mockResolvedValue(sessions);

      const result = await controller.getSessions(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('sessionId');
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).not.toHaveProperty('hashedRefreshToken');
    });

    it('calls AuthService.getSessions with userId from JWT payload', async () => {
      mockAuthService.getSessions.mockResolvedValue([]);

      await controller.getSessions(mockUser);

      expect(mockAuthService.getSessions).toHaveBeenCalledWith('user-123');
    });

    it('returns empty array when user has no active sessions', async () => {
      mockAuthService.getSessions.mockResolvedValue([]);

      const result = await controller.getSessions(mockUser);

      expect(result).toEqual([]);
    });
  });
});
