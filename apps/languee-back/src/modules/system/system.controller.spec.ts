import { Test, TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

describe('SystemController', () => {
  let controller: SystemController;
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
      controllers: [SystemController],
      providers: [
        {
          provide: SystemService,
          useValue: { getEnv: getEnvMock },
        },
      ],
    }).compile();

    controller = module.get<SystemController>(SystemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getEnv()', () => {
    it('delegates to SystemService.getEnv()', () => {
      controller.getEnv();
      expect(getEnvMock).toHaveBeenCalledTimes(1);
    });

    it('returns the result from SystemService.getEnv()', () => {
      const result = controller.getEnv();
      expect(result).toBe(mockEnvPayload);
    });
  });
});
