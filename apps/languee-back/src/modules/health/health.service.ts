import { Injectable } from '@nestjs/common';

export const APP_VERSION = process.env.APP_VERSION ?? '0.1.0-dev';

@Injectable()
export class HealthService {
  getHello(): { success: boolean } {
    return { success: true };
  }

  getVersion(): { version: string; commit: string } {
    return {
      version: process.env.APP_VERSION ?? APP_VERSION,
      commit: process.env.GIT_SHA ?? 'unknown',
    };
  }
}
