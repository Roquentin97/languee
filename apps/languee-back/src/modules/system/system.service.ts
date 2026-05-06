import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REDACTED = '[REDACTED]';

interface AppNamespace {
  port: number | undefined;
  nodeEnv: string | undefined;
}

interface PostgresNamespace {
  databaseUrl: string;
}

interface RedisNamespace {
  host: string | undefined;
  port: number | undefined;
}

interface AuthNamespace {
  jwtSecret: string;
}

interface SystemNamespace {
  basicAuthUser: string;
  basicAuthPassword: string;
}

interface EnvPayload {
  app: AppNamespace;
  postgres: PostgresNamespace;
  redis: RedisNamespace;
  auth: AuthNamespace;
  system: SystemNamespace;
}

@Injectable()
export class SystemService {
  constructor(private readonly configService: ConfigService) {}

  getEnv(): Record<string, unknown> {
    const isDevelopment =
      this.configService.get<string>('app.nodeEnv') === 'development';

    const payload: EnvPayload = {
      app: {
        port: this.configService.get<number>('app.port'),
        nodeEnv: this.configService.get<string>('app.nodeEnv'),
      },
      postgres: {
        databaseUrl: isDevelopment
          ? (this.configService.get<string>('postgres.databaseUrl') ?? '')
          : REDACTED,
      },
      redis: {
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
      },
      auth: {
        jwtSecret: isDevelopment
          ? (this.configService.get<string>('auth.jwtSecret') ?? '')
          : REDACTED,
      },
      system: {
        basicAuthUser: isDevelopment
          ? (this.configService.get<string>('system.basicAuthUser') ?? '')
          : REDACTED,
        basicAuthPassword: isDevelopment
          ? (this.configService.get<string>('system.basicAuthPassword') ?? '')
          : REDACTED,
      },
    };

    return payload as unknown as Record<string, unknown>;
  }
}
