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
    it('should return application version', () => {
      expect(healthController.getVersion()).toEqual({ version: '0.0.2' });
    });
  });
});
