import { Injectable } from '@nestjs/common';

export const APP_VERSION = '1.0.0'; // x-release-please-version

@Injectable()
export class HealthService {
  getHello(): { success: boolean } {
    return { success: true };
  }

  getVersion(): { version: string } {
    return { version: APP_VERSION };
  }
}
