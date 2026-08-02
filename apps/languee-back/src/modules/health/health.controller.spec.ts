import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { APP_VERSION, HealthService } from './health.service';

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
      expect(healthController.getVersion()).toEqual({
        version: APP_VERSION,
        commit: 'unknown',
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
