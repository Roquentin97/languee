import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentController } from './environment.controller';
import { EnvironmentService } from './environment.service';

describe('EnvironmentController', () => {
  let controller: EnvironmentController;
  let getEnvMock: jest.Mock;

  const mockEnvPayload: Record<string, unknown> = {
    app: { port: 3000, nodeEnv: 'development' },
    postgres: { databaseUrl: 'postgres://user:pass@localhost/db' },
    redis: { host: 'localhost', port: 6379 },
    auth: { jwtSecret: 'supersecretkey1234' },
    system: { basicAuthUser: 'admin', basicAuthPassword: 'password' },
  };

  beforeEach(async () => {
    getEnvMock = jest.fn().mockReturnValue(mockEnvPayload);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnvironmentController],
      providers: [
        {
          provide: EnvironmentService,
          useValue: { getEnv: getEnvMock },
        },
      ],
    }).compile();

    controller = module.get<EnvironmentController>(EnvironmentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getEnv()', () => {
    it('delegates to EnvironmentService.getEnv()', () => {
      controller.getEnv();
      expect(getEnvMock).toHaveBeenCalledTimes(1);
    });

    it('returns the result from EnvironmentService.getEnv()', () => {
      const result = controller.getEnv();
      expect(result).toBe(mockEnvPayload);
    });
  });
});
