import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { NlpService } from './nlp.service';

@Module({
  imports: [AppConfigModule],
  providers: [NlpService],
  exports: [NlpService],
})
export class NlpModule {}
