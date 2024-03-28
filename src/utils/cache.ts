class CacheRecord<T> {
  constructor(
    public readonly value: T,
    public readonly expiry: number
  ) {}

  get expired() {
    return Date.now() > this.expiry;
  }
}

export class Cache<T> {
  private readonly interval: NodeJS.Timeout;
  private records: Map<string, CacheRecord<T>> = new Map();

  constructor() {
    this.interval = setInterval(() => this.cleanup(), 60000);
  }

  public get(key: string): CacheRecord<T> | undefined {
    return this.records.get(key);
  }

  public set(key: string, value: T, ttl: number): void {
    this.records.set(key, new CacheRecord(value, Date.now() + ttl));
  }

  public clear(): void {
    this.records.clear();
  }

  public dispose(): void {
    clearInterval(this.interval);
    this.records.clear();
  }

  private cleanup() {
    for (const [key, record] of this.records.entries()) {
      if (record.expired) {
        this.records.delete(key);
      }
    }
  }
}
