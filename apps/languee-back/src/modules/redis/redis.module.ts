import { Global, Module } from '@nestjs/common';
import IORedis from 'ioredis';
import { RedisService } from './redis.service';

@Global()
@Module({
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

        return new IORedis({ host, port: parseInt(port, 10) });
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
