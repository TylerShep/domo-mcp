interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();

  constructor(private readonly defaultTtlMs: number = 5 * 60 * 1000) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  async getOrSet(key: K, factory: () => Promise<V>, ttlMs?: number): Promise<V> {
    const existing = this.get(key);
    if (existing !== undefined) return existing;
    const fresh = await factory();
    this.set(key, fresh, ttlMs);
    return fresh;
  }
}
