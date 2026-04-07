import { Redis } from 'ioredis';
export declare class RedisService {
    private readonly client;
    constructor(client: Redis);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    sadd(key: string, member: string): Promise<void>;
    srem(key: string, member: string): Promise<void>;
    smembers(key: string): Promise<string[]>;
}
