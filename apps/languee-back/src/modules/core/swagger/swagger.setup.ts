import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createBasicAuthMiddleware } from '../basic-auth/basic-auth.middleware.factory';

function getRequiredConfigValue(
  configService: ConfigService,
  key: string,
  envName: string,
): string {
  const value = configService.getOrThrow<string>(key);
  if (value.length === 0) {
    throw new Error(`${envName} environment variable is required but not set`);
  }
  return value;
}

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
): void {
  const basicAuthUser = getRequiredConfigValue(
    configService,
    'system.basicAuthUser',
    'BASIC_AUTH',
  );
  const basicAuthPassword = getRequiredConfigValue(
    configService,
    'system.basicAuthPassword',
    'BASIC_PASSWORD',
  );

  app.use(
    '/docs',
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
  SwaggerModule.setup('docs', app, document);
}
