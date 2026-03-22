import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  smembers: jest.fn(),
};

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: 'REDIS_CLIENT', useValue: mockRedisClient },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  describe('get', () => {
    it('returns value when key exists', async () => {
      mockRedisClient.get.mockResolvedValue('some-value');
      const result = await service.get('some-key');
      expect(result).toBe('some-value');
      expect(mockRedisClient.get).toHaveBeenCalledWith('some-key');
    });

    it('returns null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const result = await service.get('missing-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('sets a key with EX ttl', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      await service.set('my-key', 'my-value', 300);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'my-key',
        'my-value',
        'EX',
        300,
      );
    });
  });

  describe('del', () => {
    it('deletes a key', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      await service.del('my-key');
      expect(mockRedisClient.del).toHaveBeenCalledWith('my-key');
    });
  });

  describe('sadd', () => {
    it('adds a member to a set', async () => {
      mockRedisClient.sadd.mockResolvedValue(1);
      await service.sadd('my-set', 'member1');
      expect(mockRedisClient.sadd).toHaveBeenCalledWith('my-set', 'member1');
    });
  });

  describe('srem', () => {
    it('removes a member from a set', async () => {
      mockRedisClient.srem.mockResolvedValue(1);
      await service.srem('my-set', 'member1');
      expect(mockRedisClient.srem).toHaveBeenCalledWith('my-set', 'member1');
    });
  });

  describe('smembers', () => {
    it('returns all members of a set', async () => {
      mockRedisClient.smembers.mockResolvedValue(['a', 'b', 'c']);
      const result = await service.smembers('my-set');
      expect(result).toEqual(['a', 'b', 'c']);
      expect(mockRedisClient.smembers).toHaveBeenCalledWith('my-set');
    });

    it('returns empty array when set has no members', async () => {
      mockRedisClient.smembers.mockResolvedValue([]);
      const result = await service.smembers('empty-set');
      expect(result).toEqual([]);
    });
  });
});
