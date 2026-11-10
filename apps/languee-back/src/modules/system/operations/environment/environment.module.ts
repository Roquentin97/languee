import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBasicAuthMiddleware } from '../../core/basic-auth/basic-auth.middleware.factory';
import { EnvironmentController } from './environment.controller';
import { EnvironmentService } from './environment.service';

@Module({
  controllers: [EnvironmentController],
  providers: [EnvironmentService],
})
export class EnvironmentModule implements NestModule {
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
      .forRoutes({
        path: 'system/env',
        method: RequestMethod.GET,
      });
  }
}
