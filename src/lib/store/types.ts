/** A day the creator spent a freeze on, as an ISO calendar date in their timezone. */
export type FrozenDate = string;

export type NudgePrefs = {
  enabled: boolean;
  /** 0 = Sunday .. 6 = Saturday */
  days: number[];
  /** Local hour, 0-23. */
  hour: number;
  /** Local calendar date of the last reminder sent, so one fires per day at most. */
  lastSentOn?: string;
};

/** A browser push subscription, exactly as the Push API hands it over. */
export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Free-text label from the user agent, for the "your devices" list. */
  userAgent?: string;
  createdAt: string;
};

/**
 * What the dashboard last computed while the creator was actually looking.
 * Reminders are written from this rather than from a background API call, so
 * the app never reaches into a Fanvue account while its owner is away.
 */
export type LastSeen = {
  /** Local date the dashboard was rendered. */
  date: string;
  currentStreak: number;
  atRisk: boolean;
  longestStreak: number;
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
  /**
   * True once the creator has chosen a timezone themselves. Until then the
   * profile timezone (or UTC) is used and may be refreshed from the profile.
   */
  timezoneChosen?: boolean;
  pushSubscriptions?: PushSubscriptionRecord[];
  /** Capability token for the private calendar feed. Regenerable. */
  calendarToken?: string;
  lastSeen?: LastSeen;
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
  /** Creators with reminders switched on, for the hourly sender. */
  listNudgeUsers(): Promise<UserState[]>;
  /** Resolves a calendar feed token to its owner, or null. */
  findUserByCalendarToken(token: string): Promise<UserState | null>;
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
