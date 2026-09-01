import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";
import type { Redis } from "@upstash/redis";
import { FileStore } from "./file";
import { RedisStore } from "./redis";
import { defaultUserState, type Store, type StoredSession } from "./types";

/**
 * The contract every Store implementation must satisfy. FileStore is exercised
 * here; RedisStore is exercised by the same suite when Redis credentials are
 * present, so the two backends cannot quietly diverge.
 */
function session(sid: string, userId: string): StoredSession {
  return {
    sid,
    userId,
    accessToken: "ciphertext-access",
    refreshToken: "ciphertext-refresh",
    expiresAt: Date.now() + 3_600_000,
    scope: "read:self",
    createdAt: new Date().toISOString(),
  };
}

function contract(name: string, create: () => Promise<Store>, cleanup?: () => Promise<void>) {
  describe(`Store contract: ${name}`, () => {
    afterAll(async () => {
      await cleanup?.();
    });

    it("round-trips a session", async () => {
      const store = await create();
      await store.putSession(session("sid-1", "user-1"));
      const found = await store.getSession("sid-1");
      expect(found?.userId).toBe("user-1");
      expect(found?.accessToken).toBe("ciphertext-access");
    });

    it("returns null for an unknown session", async () => {
      const store = await create();
      expect(await store.getSession("nope")).toBeNull();
    });

    it("deletes a session", async () => {
      const store = await create();
      await store.putSession(session("sid-2", "user-2"));
      await store.deleteSession("sid-2");
      expect(await store.getSession("sid-2")).toBeNull();
    });

    it("round-trips user state", async () => {
      const store = await create();
      const state = defaultUserState("user-3", "Europe/London");
      state.frozenDates = ["2026-03-14"];
      await store.putUserState(state);
      const found = await store.getUserState("user-3");
      expect(found?.frozenDates).toEqual(["2026-03-14"]);
      expect(found?.timezone).toBe("Europe/London");
    });

    it("erases state and every session for a user", async () => {
      const store = await create();
      await store.putUserState(defaultUserState("user-4", "UTC"));
      await store.putSession(session("sid-4a", "user-4"));
      await store.putSession(session("sid-4b", "user-4"));
      await store.putSession(session("sid-other", "user-5"));

      await store.deleteUser("user-4");

      expect(await store.getUserState("user-4")).toBeNull();
      expect(await store.getSession("sid-4a")).toBeNull();
      expect(await store.getSession("sid-4b")).toBeNull();
      // Another creator's session must survive.
      expect(await store.getSession("sid-other")).not.toBeNull();
    });

    it("survives concurrent writes without losing one", async () => {
      const store = await create();
      await Promise.all(
        Array.from({ length: 8 }, (_, i) => store.putSession(session(`race-${i}`, "user-race"))),
      );
      for (let i = 0; i < 8; i++) {
        expect(await store.getSession(`race-${i}`)).not.toBeNull();
      }
    });
  });
}

let dir: string | null = null;
let fileStore: FileStore | null = null;

contract(
  "FileStore",
  async () => {
    if (!fileStore) {
      dir = await mkdtemp(path.join(tmpdir(), "streak-store-"));
      fileStore = new FileStore(dir);
    }
    return fileStore;
  },
  async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  },
);

/**
 * An in-memory stand-in for the handful of Redis commands RedisStore uses.
 * This exercises the store's own logic - key naming, the user-to-sessions index,
 * and the deleteUser fan-out - without needing a live Redis. It does not
 * exercise the Upstash wire protocol.
 */
class FakeRedis {
  private values = new Map<string, unknown>();
  private sets = new Map<string, Set<string>>();
  /** Recorded so the test can assert sessions are given a TTL. */
  readonly expiries = new Map<string, number>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T) ?? null;
  }

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    // Upstash serialises through JSON; round-trip so the fake cannot hide a
    // value that would not survive the real client.
    this.values.set(key, JSON.parse(JSON.stringify(value)));
    if (opts?.ex) this.expiries.set(key, opts.ex);
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.values.delete(key);
      this.sets.delete(key);
    }
  }

  async sadd(key: string, member: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  async srem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member);
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async expire(key: string, seconds: number): Promise<void> {
    this.expiries.set(key, seconds);
  }
}

let fake: FakeRedis | null = null;
let redisStore: RedisStore | null = null;

contract("RedisStore (in-memory fake)", async () => {
  if (!redisStore) {
    fake = new FakeRedis();
    redisStore = new RedisStore(fake as unknown as Redis);
  }
  return redisStore;
});

describe("RedisStore specifics", () => {
  it("gives sessions a TTL so dead rows expire on their own", async () => {
    const redis = new FakeRedis();
    const store = new RedisStore(redis as unknown as Redis);
    await store.putSession(session("ttl-1", "user-ttl"));
    expect(redis.expiries.get("streak:session:ttl-1")).toBe(60 * 60 * 24 * 30);
  });

  it("does not expire user state, which outlives any session", async () => {
    const redis = new FakeRedis();
    const store = new RedisStore(redis as unknown as Redis);
    await store.putUserState(defaultUserState("user-perm", "UTC"));
    expect(redis.expiries.has("streak:user:user-perm")).toBe(false);
  });

  it("drops the session from the user index when deleted individually", async () => {
    const redis = new FakeRedis();
    const store = new RedisStore(redis as unknown as Redis);
    await store.putSession(session("idx-1", "user-idx"));
    await store.deleteSession("idx-1");
    expect(await redis.smembers("streak:user-sessions:user-idx")).toEqual([]);
  });
});
