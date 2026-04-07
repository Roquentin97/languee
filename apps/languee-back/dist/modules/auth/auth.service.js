"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const crypto_1 = require("crypto");
const redis_service_1 = require("../redis/redis.service");
const users_service_1 = require("../users/users.service");
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const DUMMY_HASH = '$2b$10$XE0X1VUQCzOZ.SPxF4q/f.ieiRmHIeVDUaQVt9xbrCNq4h4cgoxf.';
let AuthService = class AuthService {
    usersService;
    redisService;
    jwtService;
    constructor(usersService, redisService, jwtService) {
        this.usersService = usersService;
        this.redisService = redisService;
        this.jwtService = jwtService;
    }
    async login(dto, userAgent, ip) {
        const user = await this.usersService.findByEmail(dto.email);
        if (!user) {
            await bcrypt.compare(dto.password, DUMMY_HASH);
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!passwordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const sessionId = (0, crypto_1.randomUUID)();
        const plainRefreshToken = (0, crypto_1.randomUUID)();
        const hashedRefreshToken = await bcrypt.hash(plainRefreshToken, 10);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + THIRTY_DAYS_SECONDS * 1000);
        const sessionData = {
            sessionId,
            userId: user.id,
            hashedRefreshToken,
            userAgent,
            ip,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            revoked: false,
        };
        await this.redisService.set(`session:${sessionId}`, JSON.stringify(sessionData), THIRTY_DAYS_SECONDS);
        await this.redisService.sadd(`user_sessions:${user.id}`, sessionId);
        const accessToken = this.jwtService.sign({
            sub: user.id,
            session_id: sessionId,
        });
        return { accessToken, plainRefreshToken, sessionId };
    }
    async refresh(refreshTokenFromCookie, sessionId) {
        const raw = await this.redisService.get(`session:${sessionId}`);
        if (!raw) {
            throw new common_1.UnauthorizedException('Session not found');
        }
        const session = JSON.parse(raw);
        if (session.revoked) {
            await this.revokeAllUserSessions(session.userId);
            throw new common_1.UnauthorizedException('Refresh token reuse detected — all sessions revoked');
        }
        const tokenValid = await bcrypt.compare(refreshTokenFromCookie, session.hashedRefreshToken);
        if (!tokenValid) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const now = new Date();
        const expiresAt = new Date(session.expiresAt);
        if (now >= expiresAt) {
            throw new common_1.UnauthorizedException('Session expired');
        }
        const remainingTtl = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
        const plainRefreshToken = (0, crypto_1.randomUUID)();
        const hashedRefreshToken = await bcrypt.hash(plainRefreshToken, 10);
        const updatedSession = {
            ...session,
            hashedRefreshToken,
        };
        await this.redisService.set(`session:${sessionId}`, JSON.stringify(updatedSession), remainingTtl);
        const accessToken = this.jwtService.sign({
            sub: session.userId,
            session_id: sessionId,
        });
        return { accessToken, plainRefreshToken };
    }
    async logout(sessionId) {
        const raw = await this.redisService.get(`session:${sessionId}`);
        if (!raw) {
            return;
        }
        const session = JSON.parse(raw);
        const now = new Date();
        const expiresAt = new Date(session.expiresAt);
        const remainingTtl = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        const revokedSession = { ...session, revoked: true };
        await this.redisService.set(`session:${sessionId}`, JSON.stringify(revokedSession), remainingTtl);
        await this.redisService.srem(`user_sessions:${session.userId}`, sessionId);
    }
    async logoutAll(userId) {
        await this.revokeAllUserSessions(userId);
    }
    async getSessions(userId) {
        const sessionIds = await this.redisService.smembers(`user_sessions:${userId}`);
        const sessions = await Promise.all(sessionIds.map(async (id) => {
            const raw = await this.redisService.get(`session:${id}`);
            if (!raw)
                return null;
            const session = JSON.parse(raw);
            if (session.revoked)
                return null;
            const { hashedRefreshToken, ...rest } = session;
            return rest;
        }));
        return sessions.filter((s) => s !== null);
    }
    async revokeAllUserSessions(userId) {
        const sessionIds = await this.redisService.smembers(`user_sessions:${userId}`);
        await Promise.all(sessionIds.map(async (id) => {
            const raw = await this.redisService.get(`session:${id}`);
            if (!raw)
                return;
            const session = JSON.parse(raw);
            const now = new Date();
            const expiresAt = new Date(session.expiresAt);
            const remainingTtl = Math.max(1, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
            const revokedSession = { ...session, revoked: true };
            await this.redisService.set(`session:${id}`, JSON.stringify(revokedSession), remainingTtl);
            await this.redisService.srem(`user_sessions:${userId}`, id);
        }));
        await this.redisService.del(`user_sessions:${userId}`);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        redis_service_1.RedisService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map