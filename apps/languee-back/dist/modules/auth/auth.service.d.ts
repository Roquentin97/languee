import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SessionData } from './interfaces/session.interface';
export declare class AuthService {
    private readonly usersService;
    private readonly redisService;
    private readonly jwtService;
    constructor(usersService: UsersService, redisService: RedisService, jwtService: JwtService);
    login(dto: LoginDto, userAgent: string, ip: string): Promise<{
        accessToken: string;
        plainRefreshToken: string;
        sessionId: string;
    }>;
    refresh(refreshTokenFromCookie: string, sessionId: string): Promise<{
        accessToken: string;
        plainRefreshToken: string;
    }>;
    logout(sessionId: string): Promise<void>;
    logoutAll(userId: string): Promise<void>;
    getSessions(userId: string): Promise<Omit<SessionData, 'hashedRefreshToken'>[]>;
    private revokeAllUserSessions;
}
