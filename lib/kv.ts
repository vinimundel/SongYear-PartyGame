import "server-only";
import { Redis } from "@upstash/redis";

interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

const memory = new Map<string, { value: unknown; expiresAt: number }>();

const memoryStore: CacheStore = {
  async get<T>(key: string) {
    const hit = memory.get(key);
    if (!hit || hit.expiresAt <= Date.now()) {
      memory.delete(key);
      return null;
    }
    return hit.value as T;
  },
  async set(key, value, ttlSeconds) {
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
};

let store: CacheStore | null = null;

export function getCacheStore(): CacheStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return (store = memoryStore);
  const redis = new Redis({ url, token });
  store = {
    async get<T>(key: string) {
      return redis.get<T>(key);
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
  };
  return store;
}
