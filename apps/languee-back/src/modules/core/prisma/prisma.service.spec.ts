import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

// Mock the Prisma adapter so we never touch a real DB connection
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

// Mock PrismaClient to avoid real DB connection but preserve prototype methods
jest.mock('@prisma/client', () => {
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  class MockPrismaClient {
    $connect = mockConnect;
  }
  return { PrismaClient: MockPrismaClient };
});

const mockConfigService: Partial<ConfigService> = {
  getOrThrow: jest.fn().mockImplementation((key: string) => {
    if (key === 'postgres.databaseUrl') {
      return 'postgres://user:pass@localhost/testdb';
    }
    throw new Error(`Unexpected config key: ${key}`);
  }),
};

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('requests postgres.databaseUrl from ConfigService during construction', () => {
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(
      'postgres.databaseUrl',
    );
  });

  describe('onModuleInit()', () => {
    it('calls $connect on initialisation', async () => {
      const connectSpy = jest
        .spyOn(service, '$connect')
        .mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
