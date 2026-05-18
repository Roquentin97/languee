import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './modules/config/config.module';
import { PrismaModule } from './modules/core/prisma/prisma.module';
import { RedisModule } from './modules/core/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { SystemModule } from './modules/system/system.module';
import { DictionaryModule } from './modules/dictionary/dictionary.module';
import { DecksModule } from './modules/decks/decks.module';
import { CardsModule } from './modules/cards/cards.module';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module';
import { NlpModule } from './modules/nlp/nlp.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    SystemModule,
    DictionaryModule,
    DecksModule,
    CardsModule,
    VocabularyModule,
    NlpModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
