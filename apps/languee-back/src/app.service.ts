import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { success: boolean } {
    return { success: true };
  }
}
