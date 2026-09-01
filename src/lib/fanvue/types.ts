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
  /**
   * Major units (dollars, not cents). The API returns integer minor units;
   * conversion happens once, at the edge, so nothing downstream has to know.
   * null when the earnings scope was not granted.
   */
  earnings: number | null;
};

export type ActivityWindow = {
  days: DailyActivity[];
  earningsAvailable: boolean;
  /** ISO code from the earnings rows. Creators are not all paid in USD. */
  currency: string;
  /** Posts the API returned at all, before date parsing. Zero means an empty account. */
  postsFound: number;
  /** Posts per local hour of day, 24 buckets. Drives the reminder default. */
  postingHours: number[];
  /** Anything the app asked for but could not read, surfaced in the UI rather than hidden. */
  warnings: string[];
};

export interface ActivitySource {
  getProfile(): Promise<Profile>;
  getActivity(historyDays: number, timezone: string): Promise<ActivityWindow>;
}
