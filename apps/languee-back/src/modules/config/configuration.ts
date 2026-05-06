export const configuration = () => ({
  app: {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
  },
  postgres: {
    databaseUrl: process.env['DATABASE_URL'] ?? '',
  },
  redis: {
    host: process.env['REDIS_HOST'] ?? '',
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  },
  auth: {
    jwtSecret: process.env['JWT_SECRET'] ?? '',
  },
  system: {
    basicAuthUser: process.env['BASIC_AUTH'] ?? '',
    basicAuthPassword: process.env['BASIC_PASSWORD'] ?? '',
  },
});
