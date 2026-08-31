/** A day the creator spent a freeze on, as an ISO calendar date in their timezone. */
export type FrozenDate = string;

export type NudgePrefs = {
  enabled: boolean;
  /** 0 = Sunday .. 6 = Saturday */
  days: number[];
  /** Local hour, 0-23. */
  hour: number;
};

export type UserState = {
  userId: string;
  timezone: string;
  frozenDates: FrozenDate[];
  /** Milestone thresholds (in days) the creator has ever reached. */
  unlockedBadges: number[];
  /**
   * Longest streak ever recorded for this creator. Kept explicitly rather than
   * inferred from earned badges, which would only ever be a lower bound, and so
   * that a streak does not appear to shrink once it falls out of the analysis
   * window.
   */
  longestStreakEver: number;
  nudge: NudgePrefs;
  createdAt: string;
  updatedAt: string;
};

export type StoredSession = {
  sid: string;
  userId: string;
  /** Ciphertext, never plaintext. */
  accessToken: string;
  refreshToken: string | null;
  /** Epoch millis. */
  expiresAt: number;
  scope: string;
  createdAt: string;
};

export interface Store {
  getSession(sid: string): Promise<StoredSession | null>;
  putSession(session: StoredSession): Promise<void>;
  deleteSession(sid: string): Promise<void>;
  getUserState(userId: string): Promise<UserState | null>;
  putUserState(state: UserState): Promise<void>;
  /** Full erasure for a data-deletion request: state plus every session. */
  deleteUser(userId: string): Promise<void>;
}

export const MAX_FREEZES_PER_MONTH = 3;

export function defaultUserState(userId: string, timezone: string): UserState {
  const now = new Date().toISOString();
  return {
    userId,
    timezone,
    frozenDates: [],
    unlockedBadges: [],
    longestStreakEver: 0,
    nudge: { enabled: false, days: [2, 5], hour: 18 },
    createdAt: now,
    updatedAt: now,
  };
}
