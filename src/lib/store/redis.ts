import { Redis } from "@upstash/redis";
import type { Store, StoredSession, UserState } from "./types";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Redis-backed store for serverless deployments, where the filesystem is
 * read-only and per-instance so FileStore cannot work.
 *
 * Uses Upstash's REST client rather than a TCP Redis driver: serverless
 * functions come and go too fast to hold a connection pool open.
 */
export class RedisStore implements Store {
  constructor(private redis: Redis) {}

  private sessionKey = (sid: string) => `streak:session:${sid}`;
  private userKey = (userId: string) => `streak:user:${userId}`;
  /** Lets deleteUser find a creator's sessions without scanning every key. */
  private userSessionsKey = (userId: string) => `streak:user-sessions:${userId}`;
  /** Index of creators with reminders on, so the hourly sender never scans the keyspace. */
  private nudgeIndexKey = "streak:nudge-users";
  /** Calendar token -> user id, so a feed request is one lookup. */
  private calendarKey = (token: string) => `streak:calendar:${token}`;

  async getSession(sid: string): Promise<StoredSession | null> {
    return (await this.redis.get<StoredSession>(this.sessionKey(sid))) ?? null;
  }

  async putSession(session: StoredSession): Promise<void> {
    // Redis expires the session on its own, so dead rows never accumulate.
    await this.redis.set(this.sessionKey(session.sid), session, { ex: SESSION_TTL_SECONDS });
    await this.redis.sadd(this.userSessionsKey(session.userId), session.sid);
    await this.redis.expire(this.userSessionsKey(session.userId), SESSION_TTL_SECONDS);
  }

  async deleteSession(sid: string): Promise<void> {
    const session = await this.getSession(sid);
    await this.redis.del(this.sessionKey(sid));
    if (session) await this.redis.srem(this.userSessionsKey(session.userId), sid);
  }

  async getUserState(userId: string): Promise<UserState | null> {
    return (await this.redis.get<UserState>(this.userKey(userId))) ?? null;
  }

  async putUserState(state: UserState): Promise<void> {
    const previous = await this.getUserState(state.userId);
    // No TTL: this is the creator's own record and outlives any one session.
    await this.redis.set(this.userKey(state.userId), {
      ...state,
      updatedAt: new Date().toISOString(),
    });
    // Keep the secondary indexes in step with the record.
    if (state.nudge?.enabled) await this.redis.sadd(this.nudgeIndexKey, state.userId);
    else await this.redis.srem(this.nudgeIndexKey, state.userId);
    if (previous?.calendarToken && previous.calendarToken !== state.calendarToken) {
      await this.redis.del(this.calendarKey(previous.calendarToken));
    }
    if (state.calendarToken) {
      await this.redis.set(this.calendarKey(state.calendarToken), state.userId);
    }
  }

  async listNudgeUsers(): Promise<UserState[]> {
    const ids = await this.redis.smembers(this.nudgeIndexKey);
    if (ids.length === 0) return [];
    const states = await Promise.all(ids.map((id) => this.getUserState(id)));
    return states.filter((s): s is UserState => s !== null && Boolean(s.nudge?.enabled));
  }

  async findUserByCalendarToken(token: string): Promise<UserState | null> {
    const userId = await this.redis.get<string>(this.calendarKey(token));
    return userId ? this.getUserState(userId) : null;
  }

  async deleteUser(userId: string): Promise<void> {
    const state = await this.getUserState(userId);
    const sids = await this.redis.smembers(this.userSessionsKey(userId));
    const keys = [
      this.userKey(userId),
      this.userSessionsKey(userId),
      ...sids.map((sid) => this.sessionKey(sid)),
      ...(state?.calendarToken ? [this.calendarKey(state.calendarToken)] : []),
    ];
    await this.redis.del(...keys);
    await this.redis.srem(this.nudgeIndexKey, userId);
  }
}
