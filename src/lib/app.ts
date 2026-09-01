import { env, isDemoMode } from "@/env";
import { getActiveSession } from "@/lib/session";
import { DemoSource } from "@/lib/fanvue/demo";
import { FanvueSource } from "@/lib/fanvue/source";
import type { ActivitySource, Profile } from "@/lib/fanvue/types";
import { getStore, defaultUserState, type UserState } from "@/lib/store";
import { analyse, type StreakSummary } from "@/lib/streak/engine";
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
    // A creator who changes their Fanvue timezone should not keep an old one here.
    if (existing.timezone !== viewer.profile.timezone && isValidTimezone(viewer.profile.timezone)) {
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

export type DashboardData = {
  summary: StreakSummary;
  state: UserState;
  warnings: string[];
  earningsAvailable: boolean;
  currency: string;
  today: string;
};

export async function buildDashboard(viewer: Viewer): Promise<DashboardData> {
  const state = await getUserState(viewer);
  const window = await viewer.source.getActivity(env.HISTORY_DAYS, state.timezone);
  const today = todayIn(state.timezone);

  const summary = analyse({
    days: window.days,
    frozenDates: state.frozenDates,
    today,
    unlockedBadges: state.unlockedBadges,
    longestStreakEver: state.longestStreakEver ?? 0,
  });

  // Persist the record streak and any newly earned milestones, so neither is
  // lost when the streak breaks or ages out of the analysis window.
  const earned = summary.badges.filter((b) => b.unlocked).map((b) => b.days);
  const missing = earned.filter((d) => !state.unlockedBadges.includes(d));
  const recordImproved = summary.longestStreak > (state.longestStreakEver ?? 0);
  if (missing.length || recordImproved) {
    const next: UserState = {
      ...state,
      unlockedBadges: [...state.unlockedBadges, ...missing].sort((a, b) => a - b),
      longestStreakEver: Math.max(state.longestStreakEver ?? 0, summary.longestStreak),
    };
    await getStore().putUserState(next);
    state.unlockedBadges = next.unlockedBadges;
    state.longestStreakEver = next.longestStreakEver;
  }

  return {
    summary,
    state,
    warnings: window.warnings,
    earningsAvailable: window.earningsAvailable,
    currency: window.currency,
    today,
  };
}
