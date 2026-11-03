import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
  });

  describe('getHello', () => {
    it('should return success status', () => {
      expect(healthController.getHello()).toEqual({ success: true });
    });
  });

  describe('getVersion', () => {
    afterEach(() => {
      delete process.env.GIT_SHA;
    });

    it('returns the app version and defaults commit to unknown', () => {
      delete process.env.GIT_SHA;
      delete process.env.APP_VERSION;
      expect(healthController.getVersion()).toEqual({
        version: '0.1.0-dev',
        commit: 'unknown',
      });
    });

    it('reflects APP_VERSION when set', () => {
      process.env.APP_VERSION = '0.1.123001';
      process.env.GIT_SHA = 'a'.repeat(40);
      expect(healthController.getVersion()).toEqual({
        version: '0.1.123001',
        commit: 'a'.repeat(40),
      });
    });

    it('reflects GIT_SHA when set', () => {
      process.env.GIT_SHA = 'abc1234';
      expect(healthController.getVersion()).toEqual({
        version: APP_VERSION,
        commit: 'abc1234',
      });
    });
  });
});
