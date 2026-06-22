import { Injectable } from '@nestjs/common';

export const APP_VERSION = '0.0.3';

@Injectable()
export class HealthService {
  getHello(): { success: boolean } {
    return { success: true };
  }

  getVersion(): { version: string } {
    return { version: APP_VERSION };
  }
}
