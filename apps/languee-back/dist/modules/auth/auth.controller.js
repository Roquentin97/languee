"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const auth_service_1 = require("./auth.service");
const current_user_decorator_1 = require("./decorators/current-user.decorator");
const login_dto_1 = require("./dto/login.dto");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async login(dto, req, res) {
        const userAgent = req.headers['user-agent'] ?? 'unknown';
        const ip = req.ip ?? 'unknown';
        const { accessToken, plainRefreshToken, sessionId } = await this.authService.login(dto, userAgent, ip);
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV !== 'test',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_MAX_AGE,
        };
        res.cookie('refresh_token', plainRefreshToken, cookieOptions);
        res.cookie('session_id', sessionId, cookieOptions);
        return { accessToken };
    }
    async refresh(req, res) {
        const cookies = req.cookies;
        const refreshToken = cookies['refresh_token'];
        const sessionId = cookies['session_id'];
        if (!refreshToken || !sessionId) {
            throw new common_1.UnauthorizedException('Missing refresh token or session id');
        }
        const { accessToken, plainRefreshToken } = await this.authService.refresh(refreshToken, sessionId);
        res.cookie('refresh_token', plainRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV !== 'test',
            sameSite: 'strict',
            maxAge: REFRESH_TOKEN_MAX_AGE,
        });
        return { accessToken };
    }
    async logout(user, res) {
        await this.authService.logout(user.sessionId);
        res.clearCookie('refresh_token');
        res.clearCookie('session_id');
        return { message: 'Logged out' };
    }
    async logoutAll(user, res) {
        await this.authService.logoutAll(user.userId);
        res.clearCookie('refresh_token');
        res.clearCookie('session_id');
        return { message: 'All sessions revoked' };
    }
    async getSessions(user) {
        return this.authService.getSessions(user.userId);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 5 } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 10 } }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('logout-all'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logoutAll", null);
__decorate([
    (0, common_1.Get)('sessions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getSessions", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map