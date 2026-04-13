import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createBasicAuthMiddleware } from './modules/core/basic-auth/basic-auth.middleware.factory';

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
): void {
  const basicAuthUser = configService.getOrThrow<string>(
    'system.basicAuthUser',
  );
  const basicAuthPassword = configService.getOrThrow<string>(
    'system.basicAuthPassword',
  );

  const docsPath = '/api/v1/docs';

  app.use(
    [docsPath, `${docsPath}/*`],
    createBasicAuthMiddleware(basicAuthUser, basicAuthPassword, 'Swagger'),
  );

  const config = new DocumentBuilder()
    .setTitle('Languee API')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);
}
