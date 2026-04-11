import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export function setupSwagger(app: INestApplication): void {
  const basicAuthUser = process.env['BASIC_AUTH'];
  const basicAuthPassword = process.env['BASIC_PASSWORD'];

  if (!basicAuthUser) {
    throw new Error('BASIC_AUTH environment variable is required but not set');
  }
  if (!basicAuthPassword) {
    throw new Error(
      'BASIC_PASSWORD environment variable is required but not set',
    );
  }

  const docsPath = '/api/v1/docs';

  app.use(
    [docsPath, `${docsPath}/*`],
    (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers['authorization'];

      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
        res.status(401).send('Unauthorized');
        return;
      }

      let decoded: string;
      try {
        decoded = Buffer.from(
          authHeader.slice('Basic '.length),
          'base64',
        ).toString('utf8');
      } catch {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
        res.status(401).send('Unauthorized');
        return;
      }

      const separatorIndex = decoded.indexOf(':');
      if (separatorIndex === -1) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
        res.status(401).send('Unauthorized');
        return;
      }

      const incomingUser = decoded.slice(0, separatorIndex);
      const incomingPassword = decoded.slice(separatorIndex + 1);

      // Use hashing to normalise lengths before timingSafeEqual
      const hashIncomingUser = crypto
        .createHash('sha256')
        .update(incomingUser)
        .digest();
      const hashExpectedUser = crypto
        .createHash('sha256')
        .update(basicAuthUser)
        .digest();
      const hashIncomingPassword = crypto
        .createHash('sha256')
        .update(incomingPassword)
        .digest();
      const hashExpectedPassword = crypto
        .createHash('sha256')
        .update(basicAuthPassword)
        .digest();

      const userMatch = crypto.timingSafeEqual(
        hashIncomingUser,
        hashExpectedUser,
      );
      const passwordMatch = crypto.timingSafeEqual(
        hashIncomingPassword,
        hashExpectedPassword,
      );

      if (!userMatch || !passwordMatch) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
        res.status(401).send('Unauthorized');
        return;
      }

      next();
    },
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
