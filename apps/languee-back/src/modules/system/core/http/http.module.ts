import { Global, Module } from '@nestjs/common';
import { RequestService } from './request.service';

@Global()
@Module({
  providers: [RequestService],
  exports: [RequestService],
})
export class HttpModule {}
