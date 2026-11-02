import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const host = configService.getOrThrow<string>('redis.host');
        const port = configService.getOrThrow<number>('redis.port');
        const password = configService.get<string>('redis.password');
        return new IORedis({ host, port, ...(password ? { password } : {}) });
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
