import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { configuration } from './configuration';
import { configValidationSchema } from './config.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: (config: Record<string, unknown>) => {
        const result = configValidationSchema.validate(config, {
          abortEarly: false,
        }) as Joi.ValidationResult<Record<string, unknown>>;

        if (result.error) {
          throw result.error;
        }

        return result.value;
      },
      expandVariables: false,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
