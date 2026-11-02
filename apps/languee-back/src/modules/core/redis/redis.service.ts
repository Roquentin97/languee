import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async sadd(key: string, member: string): Promise<void> {
    await this.client.sadd(key, member);
  }

  async srem(key: string, member: string): Promise<void> {
    await this.client.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }
}
