/**
 * Calendar-date helpers. A "day" here is always a YYYY-MM-DD string in the
 * creator's own timezone: a post at 23:30 in Sydney belongs to the Sydney day,
 * not the UTC one. Getting this wrong silently breaks every streak, so all
 * timezone conversion is funnelled through toLocalDate.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timezone, fmt);
  }
  return fmt;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** en-CA formats as YYYY-MM-DD, which is exactly the shape we want. */
export function toLocalDate(instant: Date, timezone: string): string {
  return formatterFor(timezone).format(instant);
}

export function todayIn(timezone: string, now = new Date()): string {
  return toLocalDate(now, timezone);
}

function parse(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  // Midday UTC keeps addDays away from DST and rounding edges.
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDays(date: string, delta: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/** Inclusive range, ascending. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday .. 6 = Saturday */
export function dayOfWeek(date: string): number {
  return parse(date).getUTCDay();
}

/** YYYY-MM */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
