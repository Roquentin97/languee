import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from './health.controller';
import { APP_VERSION, HealthService } from './health.service';

describe('HealthController', () => {
  let app: INestApplication<App>;
  const healthService = {
    getHello: jest.fn(),
    getLive: jest.fn(),
    getVersion: jest.fn(),
    isReady: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    healthService.getHello.mockReturnValue({ success: true });
    healthService.getLive.mockReturnValue({ status: 'ok' });
    healthService.getVersion.mockReturnValue({
      version: APP_VERSION,
      commit: 'unknown',
    });
    healthService.isReady.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('preserves the root health response', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect({
      success: true,
    });
  });

  it('returns liveness without checking dependencies', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });

    expect(healthService.getLive).toHaveBeenCalledTimes(1);
    expect(healthService.isReady).not.toHaveBeenCalled();
  });

  it('returns ready when every dependency is available', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({ status: 'ok' });

    expect(healthService.isReady).toHaveBeenCalledTimes(1);
  });

  it('returns a non-sensitive 503 when a dependency is unavailable', async () => {
    healthService.isReady.mockResolvedValue(false);

    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect({ status: 'unavailable' });
  });

  it('preserves the version response', () => {
    return request(app.getHttpServer()).get('/version').expect(200).expect({
      version: APP_VERSION,
      commit: 'unknown',
    });
  });
});
