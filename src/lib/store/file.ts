import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import type { Store, StoredSession, UserState } from "./types";

type Snapshot = {
  sessions: Record<string, StoredSession>;
  users: Record<string, UserState>;
};

const EMPTY: Snapshot = { sessions: {}, users: {} };

/**
 * A dependency-free store good enough for local development and a single-instance
 * deployment. Writes are atomic (tmp + rename) and serialised through a promise
 * chain so concurrent requests cannot interleave a read-modify-write.
 *
 * For a multi-instance production deployment, implement `Store` against your
 * database and swap it in `getStore()`. Nothing else in the app changes.
 */
export class FileStore implements Store {
  private file: string;
  private cache: Snapshot | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "streak-store.json");
  }

  private async load(): Promise<Snapshot> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      this.cache = { sessions: parsed.sessions ?? {}, users: parsed.users ?? {} };
    } catch {
      this.cache = structuredClone(EMPTY);
    }
    return this.cache;
  }

  /** Serialises every mutation so read-modify-write stays consistent. */
  private mutate<T>(fn: (snap: Snapshot) => T | Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const snap = await this.load();
      const result = await fn(snap);
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(snap, null, 2), { mode: 0o600 });
      await rename(tmp, this.file);
      return result;
    });
    // Keep the chain alive even if this mutation rejects.
    this.queue = next.catch(() => undefined);
    return next;
  }

  async getSession(sid: string): Promise<StoredSession | null> {
    const snap = await this.load();
    return snap.sessions[sid] ?? null;
  }

  async putSession(session: StoredSession): Promise<void> {
    await this.mutate((snap) => {
      snap.sessions[session.sid] = session;
    });
  }

  async deleteSession(sid: string): Promise<void> {
    await this.mutate((snap) => {
      delete snap.sessions[sid];
    });
  }

  async getUserState(userId: string): Promise<UserState | null> {
    const snap = await this.load();
    return snap.users[userId] ?? null;
  }

  async putUserState(state: UserState): Promise<void> {
    await this.mutate((snap) => {
      snap.users[state.userId] = { ...state, updatedAt: new Date().toISOString() };
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.mutate((snap) => {
      delete snap.users[userId];
      for (const [sid, session] of Object.entries(snap.sessions)) {
        if (session.userId === userId) delete snap.sessions[sid];
      }
    });
  }
}
