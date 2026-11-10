import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;
  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string) =>
      key === 'app.nodeEnv' ? 'development' : undefined,
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('registers a user through AuthService', async () => {
      const dto = { email: 'new@example.com', password: 'password123' };
      const user = {
        id: 'user-123',
        email: dto.email,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      mockAuthService.register.mockResolvedValue(user);

      await expect(controller.register(dto)).resolves.toBe(user);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    });

    it('validates email and password requirements on RegisterDto', async () => {
      const dto = new RegisterDto();
      dto.email = 'not-an-email';
      dto.password = 'short';

      const errors = await validate(dto);
      const invalidProperties = errors.map((error) => error.property);

      expect(invalidProperties).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });
  });

  describe('login', () => {
    it('sets local-friendly cookies in development', async () => {
      const req = {
        headers: { 'user-agent': 'Bruno' },
        ip: '127.0.0.1',
      } as unknown as Request;
      const cookieMock = jest.fn();
      const res = { cookie: cookieMock } as unknown as Response;

      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        plainRefreshToken: 'refresh-token',
        sessionId: 'session-id',
      });

      await expect(
        controller.login(
          { email: 'user@example.com', password: 'password123' },
          req,
          res,
        ),
      ).resolves.toEqual({ accessToken: 'access-token' });

      expect(cookieMock).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 2592000000,
        },
      );
      expect(cookieMock).toHaveBeenCalledWith('session_id', 'session-id', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 2592000000,
      });
    });

    it('sets strict secure cookies outside local environments', async () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'app.nodeEnv' ? 'production' : undefined,
      );

      const req = {
        headers: { 'user-agent': 'Bruno' },
        ip: '127.0.0.1',
      } as unknown as Request;
      const cookieMock = jest.fn();
      const res = { cookie: cookieMock } as unknown as Response;

      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        plainRefreshToken: 'refresh-token',
        sessionId: 'session-id',
      });

      await controller.login(
        { email: 'user@example.com', password: 'password123' },
        req,
        res,
      );

      expect(cookieMock).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          maxAge: 2592000000,
        },
      );
    });
  });
});
