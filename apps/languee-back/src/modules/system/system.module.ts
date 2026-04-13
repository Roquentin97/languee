import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBasicAuthMiddleware } from '../core/basic-auth/basic-auth.middleware.factory';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule implements NestModule {
  constructor(private readonly configService: ConfigService) {}

  configure(consumer: MiddlewareConsumer): void {
    const basicAuthUser = this.configService.getOrThrow<string>(
      'system.basicAuthUser',
    );
    const basicAuthPassword = this.configService.getOrThrow<string>(
      'system.basicAuthPassword',
    );

    consumer
      .apply(
        createBasicAuthMiddleware(basicAuthUser, basicAuthPassword, 'System'),
      )
      .forRoutes({ path: 'system/env', method: RequestMethod.GET });
  }
}
