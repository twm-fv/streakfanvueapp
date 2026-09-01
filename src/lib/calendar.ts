import type { NudgePrefs } from "@/lib/store";
import { addDays, dayOfWeek, todayIn } from "@/lib/streak/dates";

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function ics(line: string) {
  // RFC 5545 folds lines over 75 octets; keeping every line short avoids it.
  return line.replace(/\r?\n/g, "\\n");
}

/**
 * A subscribable calendar with one weekly recurring reminder per chosen day, at
 * the chosen hour in the creator's timezone, each carrying an alarm. Calendar
 * apps poll the feed, so a changed preference shows up on its own.
 *
 * TZID without a VTIMEZONE block is accepted by Google, Apple and Outlook;
 * shipping full timezone definitions would triple the payload for no gain.
 */
export function buildCalendar({
  nudge,
  timezone,
  userId,
  now = new Date(),
}: {
  nudge: NudgePrefs;
  timezone: string;
  userId: string;
  now?: Date;
}): string {
  const today = todayIn(timezone, now);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const hh = String(nudge.hour).padStart(2, "0");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Streak//Reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Streak reminders",
    `X-WR-TIMEZONE:${timezone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  const days = nudge.enabled ? [...new Set(nudge.days)].sort() : [];
  for (const weekday of days) {
    // First occurrence on or after today.
    let start = today;
    while (dayOfWeek(start) !== weekday) start = addDays(start, 1);
    const dt = start.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:streak-${userId}-${weekday}@streak`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${timezone}:${dt}T${hh}0000`,
      "DURATION:PT15M",
      `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[weekday]}`,
      "SUMMARY:Time to post",
      ics("DESCRIPTION:Your usual posting window. One post keeps the streak alive."),
      "URL:/dashboard",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Time to post",
      "TRIGGER:-PT0M",
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
