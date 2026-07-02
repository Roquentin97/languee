import Joi from 'joi';

export const configValidationSchema = Joi.object({
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  DATABASE_URL: Joi.string().min(1).required(),
  REDIS_HOST: Joi.string().hostname().required(),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).required(),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().min(1).default('15m'),
  BASIC_AUTH: Joi.string().min(1).required(),
  BASIC_PASSWORD: Joi.string().min(1).required(),
  LANGUEE_NLP_BASE_URL: Joi.string().uri().required(),
  LANGUEE_NLP_BASIC_AUTH_LOGIN: Joi.string().min(1).required(),
  LANGUEE_NLP_BASIC_AUTH_PASSWORD: Joi.string().min(1).required(),
  LOG_FORMAT: Joi.string().valid('json', 'pretty').default('json'),
  SERVICE_NAME: Joi.string().default('languee-back'),
  PRINT_DEBUG_LOGS: Joi.string().valid('true', 'false').default('false'),
  PRINT_PRETTY_JSON_LOGS: Joi.string().valid('true', 'false').default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().default('http://alloy:4318'),
  TRACING_ENABLED: Joi.string().valid('true', 'false').default('true'),
  OTEL_TRACES_SAMPLER: Joi.string().default('parentbased_always_on'),
  OTEL_TRACES_SAMPLER_ARG: Joi.number().min(0).max(1).default(1.0),
  DICTIONARY_PROVIDER: Joi.string()
    .valid('freedictionaryapi', 'dictionaryapi_dev', 'wiktionary')
    .default('wiktionary'),
  CHATBOT_PROVIDER: Joi.string().valid('stub').default('stub'),
  CHAT_ANALYSIS_INTERVAL_MS: Joi.number().integer().min(1000).default(30000),
});
