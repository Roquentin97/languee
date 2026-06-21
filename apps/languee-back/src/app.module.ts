import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './modules/config/config.module';
import { PrismaModule } from './modules/core/prisma/prisma.module';
import { RedisModule } from './modules/core/redis/redis.module';
import { RequestContextModule } from './modules/core/context/request-context.module';
import { HttpLoggingInterceptor } from './modules/core/interceptors/http-logging.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { SystemModule } from './modules/system/system.module';
import { DictionaryModule } from './modules/dictionary/dictionary.module';
import { DecksModule } from './modules/decks/decks.module';
import { CardsModule } from './modules/cards/cards.module';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module';
import { NlpModule } from './modules/nlp/nlp.module';
import { AnkiDroidExportsModule } from './modules/ankidroid-exports/ankidroid-exports.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    RequestContextModule,
    AuthModule,
    SystemModule,
    DictionaryModule,
    DecksModule,
    CardsModule,
    VocabularyModule,
    NlpModule,
    AnkiDroidExportsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule {}
