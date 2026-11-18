import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './configuration';
import { validateEnvironment } from './config.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // Container runtimes and test hosts add unrelated process variables.
      validate: validateEnvironment,
      expandVariables: false,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
