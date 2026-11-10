import { IdentityModule } from './modules/identity/identity.module';
import { LexiconModule } from './modules/lexicon/lexicon.module';
import { LearningModule } from './modules/learning/learning.module';
import { SystemModule } from './modules/system/system.module';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HttpLoggingInterceptor } from './modules/system/core/interceptors/http-logging.interceptor';
import { MS_PER_MINUTE } from './modules/system/core/time/time.constants';

@Module({
  imports: [
    IdentityModule,
    LexiconModule,
    LearningModule,
    SystemModule,
    ThrottlerModule.forRoot([{ ttl: MS_PER_MINUTE, limit: 10 }]),
  ],
  providers: [
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
