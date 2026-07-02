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
    it('uses REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD env vars when set', () => {
      process.env['REDIS_HOST'] = 'redis.example.com';
      process.env['REDIS_PORT'] = '6380';
      process.env['REDIS_PASSWORD'] = 'redis-secret';
      const result = configuration();
      expect(result.redis.host).toBe('redis.example.com');
      expect(result.redis.port).toBe(6380);
      expect(result.redis.password).toBe('redis-secret');
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

    it('defaults redis.password to empty string when REDIS_PASSWORD is not set', () => {
      delete process.env['REDIS_PASSWORD'];
      const result = configuration();
      expect(result.redis.password).toBe('');
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

    it('uses JWT_EXPIRES_IN env var when set', () => {
      process.env['JWT_EXPIRES_IN'] = '30d';
      const result = configuration();
      expect(result.auth.jwtExpiresIn).toBe('30d');
    });

    it('defaults jwtExpiresIn to 15m when JWT_EXPIRES_IN is not set', () => {
      delete process.env['JWT_EXPIRES_IN'];
      const result = configuration();
      expect(result.auth.jwtExpiresIn).toBe('15m');
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

  describe('dictionary namespace', () => {
    it('reads DICTIONARY_PROVIDER env var when set to "freedictionaryapi"', () => {
      process.env['DICTIONARY_PROVIDER'] = 'freedictionaryapi';
      const result = configuration();
      expect(result.dictionary.provider).toBe('freedictionaryapi');
    });

    it('reads DICTIONARY_PROVIDER env var when set to "dictionaryapi_dev"', () => {
      process.env['DICTIONARY_PROVIDER'] = 'dictionaryapi_dev';
      const result = configuration();
      expect(result.dictionary.provider).toBe('dictionaryapi_dev');
    });

    it('reads DICTIONARY_PROVIDER env var when set to "wiktionary"', () => {
      process.env['DICTIONARY_PROVIDER'] = 'wiktionary';
      const result = configuration();
      expect(result.dictionary.provider).toBe('wiktionary');
    });

    it('defaults dictionary.provider to "wiktionary" when DICTIONARY_PROVIDER is not set', () => {
      delete process.env['DICTIONARY_PROVIDER'];
      const result = configuration();
      expect(result.dictionary.provider).toBe('wiktionary');
    });
  });

  describe('chat namespace', () => {
    it('reads CHATBOT_PROVIDER env var when set to "stub"', () => {
      process.env['CHATBOT_PROVIDER'] = 'stub';
      const result = configuration();
      expect(result.chat.botProvider).toBe('stub');
    });

    it('defaults chat.botProvider to "stub" when CHATBOT_PROVIDER is not set', () => {
      delete process.env['CHATBOT_PROVIDER'];
      const result = configuration();
      expect(result.chat.botProvider).toBe('stub');
    });

    it('uses CHAT_ANALYSIS_INTERVAL_MS env var when set', () => {
      process.env['CHAT_ANALYSIS_INTERVAL_MS'] = '5000';
      const result = configuration();
      expect(result.chat.analysisIntervalMs).toBe(5000);
    });

    it('defaults chat.analysisIntervalMs to 30000 when CHAT_ANALYSIS_INTERVAL_MS is not set', () => {
      delete process.env['CHAT_ANALYSIS_INTERVAL_MS'];
      const result = configuration();
      expect(result.chat.analysisIntervalMs).toBe(30000);
    });

    it('uses CHAT_PROGRESS_INTERVAL_MS env var when set', () => {
      process.env['CHAT_PROGRESS_INTERVAL_MS'] = '15000';
      const result = configuration();
      expect(result.chat.progressIntervalMs).toBe(15000);
    });

    it('defaults chat.progressIntervalMs to 60000 when CHAT_PROGRESS_INTERVAL_MS is not set', () => {
      delete process.env['CHAT_PROGRESS_INTERVAL_MS'];
      const result = configuration();
      expect(result.chat.progressIntervalMs).toBe(60000);
    });
  });
});
