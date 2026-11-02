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
    password: process.env['REDIS_PASSWORD'] ?? '',
  },
  auth: {
    jwtSecret: process.env['JWT_SECRET'] ?? '',
    jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '15m',
  },
  system: {
    basicAuthUser: process.env['BASIC_AUTH'] ?? '',
    basicAuthPassword: process.env['BASIC_PASSWORD'] ?? '',
  },
  nlp: {
    baseUrl: process.env['LANGUEE_NLP_BASE_URL'] ?? '',
    basicAuthLogin: process.env['LANGUEE_NLP_BASIC_AUTH_LOGIN'] ?? '',
    basicAuthPassword: process.env['LANGUEE_NLP_BASIC_AUTH_PASSWORD'] ?? '',
  },
  logging: {
    format: process.env['LOG_FORMAT'] ?? 'json',
    serviceName: process.env['SERVICE_NAME'] ?? 'languee-back',
    printDebugLogs: process.env['PRINT_DEBUG_LOGS'] === 'true',
    printPrettyJsonLogs: process.env['PRINT_PRETTY_JSON_LOGS'] === 'true',
  },
  tracing: {
    enabled: process.env['TRACING_ENABLED'] !== 'false',
    otlpEndpoint:
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://alloy:4318',
    sampler: process.env['OTEL_TRACES_SAMPLER'] ?? 'parentbased_always_on',
    samplerArg: parseFloat(process.env['OTEL_TRACES_SAMPLER_ARG'] ?? '1.0'),
  },
  dictionary: {
    provider: process.env['DICTIONARY_PROVIDER'] ?? 'wiktionary',
    wiktionaryUserAgent:
      process.env['DICTIONARY_WIKTIONARY_USER_AGENT'] ??
      'languee (https://github.com/Roquentin97/languee; dictionary lookup)',
  },
});
