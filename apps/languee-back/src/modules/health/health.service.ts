import { Injectable } from '@nestjs/common';

export const APP_VERSION = '2.0.0'; // x-release-please-version

@Injectable()
export class HealthService {
  getHello(): { success: boolean } {
    return { success: true };
  }

  getVersion(): { version: string; commit: string } {
    return { version: APP_VERSION, commit: process.env.GIT_SHA ?? 'unknown' };
  }
}
