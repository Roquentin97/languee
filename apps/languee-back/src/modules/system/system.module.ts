import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HttpModule } from './core/http/http.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { RequestContextModule } from './core/context/request-context.module';
import { HealthModule } from './operations/health/health.module';
import { EnvironmentModule } from './operations/environment/environment.module';

@Module({
  imports: [
    AppConfigModule,
    HttpModule,
    PrismaModule,
    RedisModule,
    RequestContextModule,
    HealthModule,
    EnvironmentModule,
  ],
})
export class SystemModule {}
