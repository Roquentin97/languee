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
});
