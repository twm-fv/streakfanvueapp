import { Redis } from "@upstash/redis";
import { env } from "@/env";
import { FileStore } from "./file";
import { RedisStore } from "./redis";
import type { Store } from "./types";

let store: Store | null = null;

/**
 * Redis when it is configured, otherwise the file-backed store.
 *
 * This is the only place the backend is chosen. Local development needs no
 * setup; a serverless deployment picks up Redis from its environment. To use a
 * different database, implement `Store` and return it here.
 */
export function getStore(): Store {
  if (store) return store;

  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    store = new RedisStore(
      new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      }),
    );
  } else {
    store = new FileStore(env.DATA_DIR);
  }
  return store;
}

/** True when running on durable storage suitable for production. */
export function usingDurableStore(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

export * from "./types";
