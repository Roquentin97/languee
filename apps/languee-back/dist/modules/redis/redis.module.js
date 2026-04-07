"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_service_1 = require("./redis.service");
let RedisModule = class RedisModule {
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: 'REDIS_CLIENT',
                useFactory: () => {
                    const host = process.env.REDIS_HOST;
                    const port = process.env.REDIS_PORT;
                    if (!host) {
                        throw new Error('REDIS_HOST environment variable is not set');
                    }
                    if (!port) {
                        throw new Error('REDIS_PORT environment variable is not set');
                    }
                    return new ioredis_1.default({ host, port: parseInt(port, 10) });
                },
            },
            redis_service_1.RedisService,
        ],
        exports: ['REDIS_CLIENT', redis_service_1.RedisService],
    })
], RedisModule);
//# sourceMappingURL=redis.module.js.map