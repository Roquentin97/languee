import { configuration } from './configuration';

describe('configuration()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Reset to a clean copy of the environment
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('returns the expected namespace keys', () => {
    const result = configuration();
    expect(result).toHaveProperty('app');
    expect(result).toHaveProperty('postgres');
    expect(result).toHaveProperty('redis');
    expect(result).toHaveProperty('auth');
    expect(result).toHaveProperty('system');
  });

  describe('app namespace', () => {
    it('uses PORT env var when set', () => {
      process.env['PORT'] = '4000';
      const result = configuration();
      expect(result.app.port).toBe(4000);
    });

    it('defaults port to 3000 when PORT is not set', () => {
      delete process.env['PORT'];
      const result = configuration();
      expect(result.app.port).toBe(3000);
    });

    it('uses NODE_ENV env var when set', () => {
      process.env['NODE_ENV'] = 'production';
      const result = configuration();
      expect(result.app.nodeEnv).toBe('production');
    });

    it('defaults nodeEnv to "development" when NODE_ENV is not set', () => {
      delete process.env['NODE_ENV'];
      const result = configuration();
      expect(result.app.nodeEnv).toBe('development');
    });
  });

  describe('postgres namespace', () => {
    it('uses DATABASE_URL env var when set', () => {
      process.env['DATABASE_URL'] = 'postgres://host/db';
      const result = configuration();
      expect(result.postgres.databaseUrl).toBe('postgres://host/db');
    });

    it('defaults databaseUrl to empty string when DATABASE_URL is not set', () => {
      delete process.env['DATABASE_URL'];
      const result = configuration();
      expect(result.postgres.databaseUrl).toBe('');
    });
  });

  describe('redis namespace', () => {
    it('uses REDIS_HOST and REDIS_PORT env vars when set', () => {
      process.env['REDIS_HOST'] = 'redis.example.com';
      process.env['REDIS_PORT'] = '6380';
      const result = configuration();
      expect(result.redis.host).toBe('redis.example.com');
      expect(result.redis.port).toBe(6380);
    });

    it('coerces REDIS_PORT from string to number', () => {
      process.env['REDIS_PORT'] = '6380';
      const result = configuration();
      expect(typeof result.redis.port).toBe('number');
      expect(result.redis.port).toBe(6380);
    });

    it('defaults redis.port to 6379 when REDIS_PORT is not set', () => {
      delete process.env['REDIS_PORT'];
      const result = configuration();
      expect(result.redis.port).toBe(6379);
    });
  });

  describe('auth namespace', () => {
    it('uses JWT_SECRET env var when set', () => {
      process.env['JWT_SECRET'] = 'mysecretkey12345';
      const result = configuration();
      expect(result.auth.jwtSecret).toBe('mysecretkey12345');
    });

    it('defaults jwtSecret to empty string when JWT_SECRET is not set', () => {
      delete process.env['JWT_SECRET'];
      const result = configuration();
      expect(result.auth.jwtSecret).toBe('');
    });
  });

  describe('system namespace', () => {
    it('uses BASIC_AUTH and BASIC_PASSWORD env vars when set', () => {
      process.env['BASIC_AUTH'] = 'admin';
      process.env['BASIC_PASSWORD'] = 's3cret';
      const result = configuration();
      expect(result.system.basicAuthUser).toBe('admin');
      expect(result.system.basicAuthPassword).toBe('s3cret');
    });

    it('defaults basicAuthUser to empty string when BASIC_AUTH is not set', () => {
      delete process.env['BASIC_AUTH'];
      const result = configuration();
      expect(result.system.basicAuthUser).toBe('');
    });

    it('defaults basicAuthPassword to empty string when BASIC_PASSWORD is not set', () => {
      delete process.env['BASIC_PASSWORD'];
      const result = configuration();
      expect(result.system.basicAuthPassword).toBe('');
    });
  });
});
