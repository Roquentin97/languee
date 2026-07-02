import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { RedisService } from '../core/redis/redis.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionData } from './interfaces/session.interface';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const DUMMY_HASH =
  '$2b$10$XE0X1VUQCzOZ.SPxF4q/f.ieiRmHIeVDUaQVt9xbrCNq4h4cgoxf.'; // bcrypt hash for timing-safe comparison

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  isSecureCookies(): boolean {
    return this.configService.get<string>('app.nodeEnv') !== 'test';
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async register(dto: RegisterDto): Promise<Omit<User, 'passwordHash'>> {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create(
      this.normalizeEmail(dto.email),
      passwordHash,
    );

    this.logger.log({
      message: 'user registered',
      event: 'auth.user_registered',
      method: this.register.name,
      data: { userId: user.id, email: user.email },
    });

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async login(
    dto: LoginDto,
    userAgent: string,
    ip: string,
  ): Promise<{
    accessToken: string;
    plainRefreshToken: string;
    sessionId: string;
  }> {
    const user = await this.usersService.findByEmail(
      this.normalizeEmail(dto.email),
    );

    if (!user) {
      // Compare against dummy hash to prevent timing attacks
      await bcrypt.compare(dto.password, DUMMY_HASH);
      this.logger.log({
        message: 'user not found',
        event: 'auth.user_not_found',
        method: this.login.name,
        data: { email: dto.email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionId = randomUUID();
    const plainRefreshToken = randomUUID();
    const hashedRefreshToken = await bcrypt.hash(plainRefreshToken, 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + THIRTY_DAYS_SECONDS * 1000);

    const sessionData: SessionData = {
      sessionId,
      userId: user.id,
      hashedRefreshToken,
      userAgent,
      ip,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revoked: false,
    };

    await this.redisService.set(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      THIRTY_DAYS_SECONDS,
    );
    await this.redisService.sadd(`user_sessions:${user.id}`, sessionId);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      session_id: sessionId,
    });

    this.logger.log({
      message: 'session created',
      event: 'auth.session_created',
      method: this.login.name,
      data: { userId: user.id, sessionId, userAgent, ip },
    });

    return { accessToken, plainRefreshToken, sessionId };
  }

  async loginMobile(
    dto: LoginDto,
    userAgent: string,
    ip: string,
  ): Promise<{
    accessToken: string;
    plainRefreshToken: string;
    sessionId: string;
    userId: string;
    email: string;
  }> {
    const user = await this.usersService.findByEmail(
      this.normalizeEmail(dto.email),
    );

    if (!user) {
      // Compare against dummy hash to prevent timing attacks
      await bcrypt.compare(dto.password, DUMMY_HASH);
      this.logger.log({
        message: 'user not found',
        event: 'auth.user_not_found',
        method: this.loginMobile.name,
        data: { email: dto.email },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionId = randomUUID();
    const plainRefreshToken = randomUUID();
    const hashedRefreshToken = await bcrypt.hash(plainRefreshToken, 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + THIRTY_DAYS_SECONDS * 1000);

    const sessionData: SessionData = {
      sessionId,
      userId: user.id,
      hashedRefreshToken,
      userAgent,
      ip,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revoked: false,
    };

    await this.redisService.set(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      THIRTY_DAYS_SECONDS,
    );
    await this.redisService.sadd(`user_sessions:${user.id}`, sessionId);

    const accessToken = this.jwtService.sign({
      sub: user.id,
      session_id: sessionId,
    });

    this.logger.log({
      message: 'session created',
      event: 'auth.session_created',
      method: this.loginMobile.name,
      data: { userId: user.id, sessionId, userAgent, ip },
    });

    return {
      accessToken,
      plainRefreshToken,
      sessionId,
      userId: user.id,
      email: user.email,
    };
  }

  async refresh(
    refreshTokenFromCookie: string,
    sessionId: string,
  ): Promise<{ accessToken: string; plainRefreshToken: string }> {
    const raw = await this.redisService.get(`session:${sessionId}`);
    if (!raw) {
      this.logger.warn({
        message: 'session not found',
        event: 'auth.session_not_found',
        method: this.refresh.name,
        data: { sessionId },
      });
      throw new UnauthorizedException('Session not found');
    }

    const session: SessionData = JSON.parse(raw) as SessionData;

    if (session.revoked) {
      this.logger.warn({
        message: 'revoked session presented',
        event: 'auth.revoked_session_presented',
        method: this.refresh.name,
        data: { sessionId, userId: session.userId },
      });
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException(
        'Refresh token reuse detected — all sessions revoked',
      );
    }

    const tokenValid = await bcrypt.compare(
      refreshTokenFromCookie,
      session.hashedRefreshToken,
    );
    if (!tokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    if (now >= expiresAt) {
      throw new UnauthorizedException('Session expired');
    }

    const remainingTtl = Math.floor(
      (expiresAt.getTime() - now.getTime()) / 1000,
    );

    this.logger.debug({
      message: 'session expiry',
      event: 'auth.session_expiry',
      method: this.refresh.name,
      data: {
        sessionId,
        expiresAt: session.expiresAt,
        remainingTtlSeconds: remainingTtl,
      },
    });

    const plainRefreshToken = randomUUID();
    const hashedRefreshToken = await bcrypt.hash(plainRefreshToken, 10);

    const updatedSession: SessionData = {
      ...session,
      hashedRefreshToken,
    };

    await this.redisService.set(
      `session:${sessionId}`,
      JSON.stringify(updatedSession),
      remainingTtl,
    );

    const accessToken = this.jwtService.sign({
      sub: session.userId,
      session_id: sessionId,
    });

    this.logger.log({
      message: 'token rotated',
      event: 'auth.token_rotated',
      method: this.refresh.name,
      data: {
        userId: session.userId,
        sessionId,
        remainingTtlSeconds: remainingTtl,
      },
    });

    return { accessToken, plainRefreshToken };
  }

  async logout(sessionId: string): Promise<void> {
    const raw = await this.redisService.get(`session:${sessionId}`);
    if (!raw) {
      this.logger.log({
        message: 'session not found',
        event: 'auth.session_not_found',
        method: this.logout.name,
        data: { sessionId },
      });
      return;
    }

    const session: SessionData = JSON.parse(raw) as SessionData;
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    const remainingTtl = Math.max(
      1,
      Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
    );

    const revokedSession: SessionData = { ...session, revoked: true };
    await this.redisService.set(
      `session:${sessionId}`,
      JSON.stringify(revokedSession),
      remainingTtl,
    );
    await this.redisService.srem(`user_sessions:${session.userId}`, sessionId);

    this.logger.log({
      message: 'session revoked',
      event: 'auth.session_revoked',
      method: this.logout.name,
      data: { userId: session.userId, sessionId },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserSessions(userId);
    this.logger.log({
      message: 'all sessions revoked',
      event: 'auth.all_sessions_revoked',
      method: this.logoutAll.name,
      data: { userId },
    });
  }

  async getSessions(
    userId: string,
  ): Promise<Omit<SessionData, 'hashedRefreshToken'>[]> {
    const sessionIds = await this.redisService.smembers(
      `user_sessions:${userId}`,
    );

    const sessions = await Promise.all(
      sessionIds.map(async (id) => {
        const raw = await this.redisService.get(`session:${id}`);
        if (!raw) return null;
        const session: SessionData = JSON.parse(raw) as SessionData;
        if (session.revoked) return null;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hashedRefreshToken, ...rest } = session;
        return rest;
      }),
    );

    return sessions.filter(
      (s): s is Omit<SessionData, 'hashedRefreshToken'> => s !== null,
    );
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.redisService.smembers(
      `user_sessions:${userId}`,
    );

    this.logger.debug({
      message: 'revoking sessions',
      event: 'auth.revoking_sessions',
      method: this.revokeAllUserSessions.name,
      data: { userId, sessionCount: sessionIds.length },
    });

    await Promise.all(
      sessionIds.map(async (id) => {
        const raw = await this.redisService.get(`session:${id}`);
        if (!raw) return;

        const session: SessionData = JSON.parse(raw) as SessionData;
        const now = new Date();
        const expiresAt = new Date(session.expiresAt);
        const remainingTtl = Math.max(
          1,
          Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
        );

        const revokedSession: SessionData = { ...session, revoked: true };
        await this.redisService.set(
          `session:${id}`,
          JSON.stringify(revokedSession),
          remainingTtl,
        );
        await this.redisService.srem(`user_sessions:${userId}`, id);
      }),
    );

    await this.redisService.del(`user_sessions:${userId}`);
  }
}
