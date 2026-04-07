import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { RedisService } from "../redis/redis.service";
import { UsersService } from "../users/users.service";
import { LoginDto } from "./dto/login.dto";
import { SessionData } from "./interfaces/session.interface";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const DUMMY_HASH =
  "$2b$10$XE0X1VUQCzOZ.SPxF4q/f.ieiRmHIeVDUaQVt9xbrCNq4h4cgoxf."; // bcrypt hash for timing-safe comparison

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    dto: LoginDto,
    userAgent: string,
    ip: string,
  ): Promise<{
    accessToken: string;
    plainRefreshToken: string;
    sessionId: string;
  }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      // Compare against dummy hash to prevent timing attacks
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException("Invalid credentials");
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

    return { accessToken, plainRefreshToken, sessionId };
  }

  async refresh(
    refreshTokenFromCookie: string,
    sessionId: string,
  ): Promise<{ accessToken: string; plainRefreshToken: string }> {
    const raw = await this.redisService.get(`session:${sessionId}`);
    if (!raw) {
      throw new UnauthorizedException("Session not found");
    }

    const session: SessionData = JSON.parse(raw) as SessionData;

    if (session.revoked) {
      await this.revokeAllUserSessions(session.userId);
      throw new UnauthorizedException(
        "Refresh token reuse detected — all sessions revoked",
      );
    }

    const tokenValid = await bcrypt.compare(
      refreshTokenFromCookie,
      session.hashedRefreshToken,
    );
    if (!tokenValid) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    if (now >= expiresAt) {
      throw new UnauthorizedException("Session expired");
    }

    const remainingTtl = Math.floor(
      (expiresAt.getTime() - now.getTime()) / 1000,
    );

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

    return { accessToken, plainRefreshToken };
  }

  async logout(sessionId: string): Promise<void> {
    const raw = await this.redisService.get(`session:${sessionId}`);
    if (!raw) {
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
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserSessions(userId);
  }

  async getSessions(
    userId: string,
  ): Promise<Omit<SessionData, "hashedRefreshToken">[]> {
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
      (s): s is Omit<SessionData, "hashedRefreshToken"> => s !== null,
    );
  }

  private async revokeAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.redisService.smembers(
      `user_sessions:${userId}`,
    );

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
