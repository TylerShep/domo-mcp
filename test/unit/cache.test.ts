import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "../../src/utils/cache.js";

describe("TtlCache", () => {
  it("set/get returns the cached value", () => {
    const cache = new TtlCache<string, number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("returns undefined after expiry", () => {
    vi.useFakeTimers();
    try {
      const cache = new TtlCache<string, number>(1000);
      cache.set("a", 1);
      vi.advanceTimersByTime(2000);
      expect(cache.get("a")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("getOrSet calls factory only once for repeated hits", async () => {
    const cache = new TtlCache<string, number>(60_000);
    const factory = vi.fn(async () => 42);
    expect(await cache.getOrSet("k", factory)).toBe(42);
    expect(await cache.getOrSet("k", factory)).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("delete removes a single entry", () => {
    const cache = new TtlCache<string, number>();
    cache.set("a", 1);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });

  it("clear removes all entries", () => {
    const cache = new TtlCache<string, number>();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });
});
