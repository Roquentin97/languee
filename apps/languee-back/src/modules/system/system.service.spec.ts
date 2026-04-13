import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SystemService } from './system.service';

function buildConfigService(
  overrides: Record<string, unknown> = {},
): ConfigService {
  const defaults: Record<string, unknown> = {
    'app.port': 3000,
    'app.nodeEnv': 'development',
    'postgres.databaseUrl': 'postgres://user:pass@localhost/db',
    'redis.host': 'localhost',
    'redis.port': 6379,
    'auth.jwtSecret': 'supersecretkey1234',
    'system.basicAuthUser': 'admin',
    'system.basicAuthPassword': 'password',
    ...overrides,
  };

  return {
    get: jest.fn().mockImplementation((key: string) => defaults[key]),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (defaults[key] !== undefined) return defaults[key];
      throw new Error(`Missing config key: ${key}`);
    }),
  } as unknown as ConfigService;
}

describe('SystemService', () => {
  let service: SystemService;

  async function createService(configValues: Record<string, unknown> = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        {
          provide: ConfigService,
          useValue: buildConfigService(configValues),
        },
      ],
    }).compile();

    return module.get<SystemService>(SystemService);
  }

  describe('getEnv() — development mode (no redaction)', () => {
    beforeEach(async () => {
      service = await createService({ 'app.nodeEnv': 'development' });
    });

    it('returns actual databaseUrl in development', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['postgres']['databaseUrl']).toBe(
        'postgres://user:pass@localhost/db',
      );
    });

    it('returns actual jwtSecret in development', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['auth']['jwtSecret']).toBe('supersecretkey1234');
    });

    it('returns actual basicAuthUser in development', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthUser']).toBe('admin');
    });

    it('returns actual basicAuthPassword in development', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthPassword']).toBe('password');
    });

    it('returns app namespace with port and nodeEnv', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['app']['port']).toBe(3000);
      expect(env['app']['nodeEnv']).toBe('development');
    });

    it('returns redis namespace with host and port', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['redis']['host']).toBe('localhost');
      expect(env['redis']['port']).toBe(6379);
    });
  });

  describe('getEnv() — production mode (secrets redacted)', () => {
    beforeEach(async () => {
      service = await createService({ 'app.nodeEnv': 'production' });
    });

    it('redacts databaseUrl in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['postgres']['databaseUrl']).toBe('[REDACTED]');
    });

    it('redacts jwtSecret in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['auth']['jwtSecret']).toBe('[REDACTED]');
    });

    it('redacts basicAuthUser in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthUser']).toBe('[REDACTED]');
    });

    it('redacts basicAuthPassword in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthPassword']).toBe('[REDACTED]');
    });

    it('does NOT redact app.port in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['app']['port']).toBe(3000);
    });

    it('does NOT redact app.nodeEnv in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['app']['nodeEnv']).toBe('production');
    });

    it('does NOT redact redis.host in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['redis']['host']).toBe('localhost');
    });

    it('does NOT redact redis.port in production', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['redis']['port']).toBe(6379);
    });
  });

  describe('getEnv() — staging mode (also redacts secrets)', () => {
    beforeEach(async () => {
      service = await createService({ 'app.nodeEnv': 'staging' });
    });

    it('redacts databaseUrl in staging', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['postgres']['databaseUrl']).toBe('[REDACTED]');
    });

    it('redacts jwtSecret in staging', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['auth']['jwtSecret']).toBe('[REDACTED]');
    });

    it('redacts basicAuthUser and basicAuthPassword in staging', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthUser']).toBe('[REDACTED]');
      expect(env['system']['basicAuthPassword']).toBe('[REDACTED]');
    });

    it('does NOT redact non-secret fields in staging', () => {
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['app']['nodeEnv']).toBe('staging');
      expect(env['redis']['host']).toBe('localhost');
    });
  });

  describe('getEnv() — development mode with undefined config values (null-coalescing branches)', () => {
    it('falls back to empty string when databaseUrl is undefined in development', async () => {
      service = await createService({
        'app.nodeEnv': 'development',
        'postgres.databaseUrl': undefined,
      });
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['postgres']['databaseUrl']).toBe('');
    });

    it('falls back to empty string when jwtSecret is undefined in development', async () => {
      service = await createService({
        'app.nodeEnv': 'development',
        'auth.jwtSecret': undefined,
      });
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['auth']['jwtSecret']).toBe('');
    });

    it('falls back to empty string when basicAuthUser is undefined in development', async () => {
      service = await createService({
        'app.nodeEnv': 'development',
        'system.basicAuthUser': undefined,
      });
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthUser']).toBe('');
    });

    it('falls back to empty string when basicAuthPassword is undefined in development', async () => {
      service = await createService({
        'app.nodeEnv': 'development',
        'system.basicAuthPassword': undefined,
      });
      const env = service.getEnv() as Record<string, Record<string, unknown>>;
      expect(env['system']['basicAuthPassword']).toBe('');
    });
  });
});
