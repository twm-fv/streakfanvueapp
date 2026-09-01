import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { env, pushConfigured } from "@/env";
import { getStore, type UserState } from "@/lib/store";
import { sendPush, type PushPayload } from "@/lib/push";
import { dayOfWeek, localHour, todayIn } from "@/lib/streak/dates";

function authorised(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Writes the reminder from what the dashboard last computed while the creator
 * was present. No Fanvue call happens here, by design: the app never reaches
 * into an account whose owner is not looking at it.
 */
function compose(state: UserState, today: string): PushPayload {
  const seen = state.lastSeen;
  const url = "/dashboard";
  if (seen && seen.date === today && seen.atRisk && seen.currentStreak > 0) {
    return {
      title: `Your ${seen.currentStreak}-day streak is on the line`,
      body: "Nothing posted yet today. One post keeps it going.",
      url,
      tag: `streak-${today}`,
    };
  }
  if (seen && seen.currentStreak > 0) {
    return {
      title: `Keep your ${seen.currentStreak}-day streak going`,
      body: "It's your usual posting time.",
      url,
      tag: `streak-${today}`,
    };
  }
  return {
    title: "Time to post",
    body: "Your usual posting window is now. One post starts a streak.",
    url,
    tag: `streak-${today}`,
  };
}

/**
 * Runs hourly. For each creator with reminders on, fires once on a chosen day
 * when their local hour matches, then records the date so a second run in the
 * same hour cannot double-send.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  const store = getStore();
  const now = new Date();
  const users = await store.listNudgeUsers();

  let considered = 0;
  let sent = 0;
  let pruned = 0;

  for (const state of users) {
    const subs = state.pushSubscriptions ?? [];
    if (subs.length === 0) continue;

    const today = todayIn(state.timezone, now);
    const hour = localHour(now, state.timezone);
    const weekday = dayOfWeek(today);
    if (hour !== state.nudge.hour || !state.nudge.days.includes(weekday)) continue;
    if (state.nudge.lastSentOn === today) continue;
    considered++;

    const { delivered, expired } = await sendPush(subs, compose(state, today));
    sent += delivered;
    pruned += expired.length;

    await store.putUserState({
      ...state,
      pushSubscriptions: subs.filter((s) => !expired.includes(s.endpoint)),
      nudge: delivered > 0 ? { ...state.nudge, lastSentOn: today } : state.nudge,
    });
  }

  return NextResponse.json({ ok: true, users: users.length, considered, sent, pruned });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
