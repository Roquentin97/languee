import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../../core/redis/redis.service';
import { SessionData } from '../interfaces/session.interface';

type JwtPayload = {
  sub: string;
} & Record<'session_id', string>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<{ userId: string; sessionId: string }> {
    const sessionId = payload['session_id'];
    const raw = await this.redisService.get(`session:${sessionId}`);
    if (!raw) {
      throw new UnauthorizedException('Session not found');
    }

    let session: SessionData;
    try {
      session = JSON.parse(raw) as SessionData;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }

    if (
      session.revoked ||
      session.userId !== payload.sub ||
      session.sessionId !== sessionId
    ) {
      throw new UnauthorizedException('Session revoked');
    }

    return { userId: payload.sub, sessionId };
  }
}
