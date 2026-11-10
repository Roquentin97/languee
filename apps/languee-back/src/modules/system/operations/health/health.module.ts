import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { NlpModule } from '../../../lexicon/enrichment/nlp/nlp.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule, RedisModule, NlpModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
