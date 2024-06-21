import AsyncLock from 'async-lock';
import NodeCache from 'node-cache';
import { getLoggerFor } from './log';

const logger = getLoggerFor('cache');

export class AsyncCache {
  private asyncLock: AsyncLock;

  constructor(protected services: { store: NodeCache }) {
    this.asyncLock = new AsyncLock({
      // max amount of time an item can remain in the queue before acquiring the lock
      timeout: 10_000, // 10 seconds
      // we don't want a lock to be reentered
      domainReentrant: false,
      //max amount of time allowed between entering the queue and completing execution
      maxOccupationTime: 0, // never
      // max number of tasks allowed in the queue at a time
      maxPending: 100_000,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      try {
        const res = this.services.store.get(key);
        if (res === undefined) {
          return resolve(null);
        }
        resolve(res as T);
      } catch (err) {
        reject(err);
      }
    });
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        this.services.store.set(key, value, ttlMs / 1000);
        resolve(value);
      } catch (err) {
        reject(err);
      }
    });
  }

  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    // async-lock is used to prevent multiple requests from refreshing the cache at the same time
    // this only works because the api is not a distributed system and the cache is "local"
    logger.trace({ msg: 'wrap: acquiring lock', data: { key, ttlMs } });
    return await this.asyncLock.acquire(key, async () => {
      logger.trace({ msg: 'wrap: lock acquired', data: { key, ttlMs } });

      logger.debug({ msg: 'wrap: getting cached value', data: { key, ttlMs } });
      const cached = await this.get<T>(key);
      if (cached) {
        logger.trace({ msg: 'wrap: cache hit', data: { key, ttlMs } });
        return cached;
      }
      logger.trace({ msg: 'wrap: cache miss, fetching value', data: { key, ttlMs } });
      const value = await fn();
      if (value !== null && value !== undefined) {
        logger.trace({ msg: 'wrap: setting non null cache value', data: { key, ttlMs, value } });
        await this.set(key, value, ttlMs);
        logger.trace({ msg: 'wrap: cache value set', data: { key, ttlMs } });
      }
      return value;
    });
  }
}

const globalCache = new NodeCache({
  stdTTL: 60 * 60, // 1 hour
  checkperiod: 60 * 1, // 1 minutes
  useClones: true,
  deleteOnExpire: true,
});
const cacheInstance = new AsyncCache({ store: globalCache });
export function getAsyncCache() {
  return cacheInstance;
}
