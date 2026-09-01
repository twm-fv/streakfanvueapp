/**
 * Runs at most one in-flight operation per key, handing every concurrent caller
 * the same promise.
 *
 * Fanvue's refresh tokens rotate and are single-use: two requests refreshing the
 * same session at once would present the same refresh token twice, and reuse
 * detection invalidates the entire chain, silently signing the creator out. A
 * 30 second grace period absorbs the occasional race, but serialising is the
 * documented default and costs nothing.
 *
 * This is per-process, which on serverless means per-instance. Combined with the
 * grace period that covers the realistic cases; a distributed lock would be the
 * next step if refresh failures ever showed up in practice.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => fn())().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/** Test seam: number of operations currently in flight. */
export function inFlightCount(): number {
  return inFlight.size;
}
