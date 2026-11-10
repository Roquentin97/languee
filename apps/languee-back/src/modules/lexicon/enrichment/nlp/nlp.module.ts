import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '../../../system/core/http/http.module';
import { NlpService } from './nlp.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [NlpService],
  exports: [NlpService],
})
export class NlpModule {}
