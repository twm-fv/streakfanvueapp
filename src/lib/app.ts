import { env, isDemoMode, remindersLive } from "@/env";
import { getActiveSession } from "@/lib/session";
import { DemoSource } from "@/lib/fanvue/demo";
import { FanvueSource } from "@/lib/fanvue/source";
import type { ActivitySource, Profile } from "@/lib/fanvue/types";
import { getStore, defaultUserState, type UserState } from "@/lib/store";
import { analyse, type StreakSummary } from "@/lib/streak/engine";
import { deriveInsights, peakPostingHour, type Insight } from "@/lib/streak/insights";
import { isValidTimezone, todayIn } from "@/lib/streak/dates";

export type Viewer = {
  userId: string;
  profile: Profile;
  source: ActivitySource;
  grantedScopes: string;
  demo: boolean;
};

/**
 * Resolves who is looking at the app and where their data comes from.
 * Returns null when nobody is connected, which the pages render as the
 * marketing/connect screen.
 */
export async function getViewer(): Promise<Viewer | null> {
  if (isDemoMode()) {
    const source = new DemoSource();
    const profile = await source.getProfile();
    return {
      userId: profile.id,
      profile,
      source,
      grantedScopes: "read:self read:post read:insights",
      demo: true,
    };
  }

  const session = await getActiveSession();
  if (!session) return null;

  const source = new FanvueSource(session.accessToken, session.scope);
  const profile = await source.getProfile();
  return {
    userId: session.userId,
    profile,
    source,
    grantedScopes: session.scope,
    demo: false,
  };
}

export async function getUserState(viewer: Viewer): Promise<UserState> {
  const store = getStore();
  const existing = await store.getUserState(viewer.userId);
  if (existing) {
    // Follow the profile timezone only until the creator picks one themselves;
    // a chosen timezone is theirs and must not be silently overwritten.
    if (
      !existing.timezoneChosen &&
      existing.timezone !== viewer.profile.timezone &&
      isValidTimezone(viewer.profile.timezone)
    ) {
      const updated = { ...existing, timezone: viewer.profile.timezone };
      await store.putUserState(updated);
      return updated;
    }
    return existing;
  }
  const created = defaultUserState(viewer.userId, viewer.profile.timezone);
  await store.putUserState(created);
  return created;
}

export type ReminderInfo = {
  /** False until the operator has push keys, a cron secret and an hourly trigger. */
  live: boolean;
  vapidPublicKey: string | null;
  deviceCount: number;
  /** The hour the creator naturally posts, derived from their history. */
  suggestedHour: number | null;
  suggestedDays: number[];
};

export type DashboardData = {
  summary: StreakSummary;
  state: UserState;
  insights: Insight[];
  reminders: ReminderInfo;
  warnings: string[];
  earningsAvailable: boolean;
  currency: string;
  postsFound: number;
  today: string;
};

export async function buildDashboard(viewer: Viewer): Promise<DashboardData> {
  const state = await getUserState(viewer);
  const window = await viewer.source.getActivity(env.HISTORY_DAYS, state.timezone);
  const today = todayIn(state.timezone);
  const now = new Date();

  const summary = analyse({
    days: window.days,
    frozenDates: state.frozenDates,
    today,
    unlockedBadges: state.unlockedBadges,
    longestStreakEver: state.longestStreakEver ?? 0,
  });

  const insights = deriveInsights({
    summary,
    days: window.days,
    postingHours: window.postingHours,
    postsFound: window.postsFound,
    earningsAvailable: window.earningsAvailable,
    currency: window.currency,
    timezone: state.timezone,
    remindersLive: remindersLive(),
    now,
  });

  // --- persist what changed, in one write ---------------------------------
  // Milestones and the record streak must survive the streak breaking; the
  // last-seen snapshot is what a reminder is written from later, so the app
  // never has to reach into the account while its owner is away.
  const earned = summary.badges.filter((b) => b.unlocked).map((b) => b.days);
  const missing = earned.filter((d) => !state.unlockedBadges.includes(d));
  const recordImproved = summary.longestStreak > (state.longestStreakEver ?? 0);
  const lastSeen = {
    date: today,
    currentStreak: summary.currentStreak,
    atRisk: summary.atRisk,
    longestStreak: summary.longestStreak,
  };
  const seenChanged =
    !state.lastSeen ||
    state.lastSeen.date !== lastSeen.date ||
    state.lastSeen.currentStreak !== lastSeen.currentStreak ||
    state.lastSeen.atRisk !== lastSeen.atRisk;

  if (missing.length || recordImproved || seenChanged) {
    const next: UserState = {
      ...state,
      unlockedBadges: [...state.unlockedBadges, ...missing].sort((a, b) => a - b),
      longestStreakEver: Math.max(state.longestStreakEver ?? 0, summary.longestStreak),
      lastSeen,
    };
    await getStore().putUserState(next);
    Object.assign(state, next);
  }

  return {
    summary,
    state,
    insights,
    reminders: {
      live: remindersLive(),
      vapidPublicKey: remindersLive() ? env.VAPID_PUBLIC_KEY! : null,
      deviceCount: state.pushSubscriptions?.length ?? 0,
      suggestedHour: peakPostingHour(window.postingHours),
      suggestedDays: summary.cadence.topDays,
    },
    warnings: window.warnings,
    earningsAvailable: window.earningsAvailable,
    currency: window.currency,
    postsFound: window.postsFound,
    today,
  };
}
