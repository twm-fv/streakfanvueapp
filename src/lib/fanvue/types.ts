export type Profile = {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  timezone: string;
};

/** One calendar day in the creator's own timezone. */
export type DailyActivity = {
  /** YYYY-MM-DD */
  date: string;
  posts: number;
  /** null when the earnings scope was not granted. */
  earnings: number | null;
};

export type ActivityWindow = {
  days: DailyActivity[];
  earningsAvailable: boolean;
  /** Anything the app asked for but could not read, surfaced in the UI rather than hidden. */
  warnings: string[];
};

export interface ActivitySource {
  getProfile(): Promise<Profile>;
  getActivity(historyDays: number, timezone: string): Promise<ActivityWindow>;
}
