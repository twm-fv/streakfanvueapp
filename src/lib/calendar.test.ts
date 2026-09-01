import { describe, expect, it } from "vitest";
import { buildCalendar } from "./calendar";

const NOW = new Date("2026-09-01T10:00:00Z"); // a Tuesday

describe("calendar feed", () => {
  it("emits one weekly recurring event per chosen day, in the creator's timezone", () => {
    const ics = buildCalendar({
      nudge: { enabled: true, days: [2, 5], hour: 18 },
      timezone: "Europe/London",
      userId: "u1",
      now: NOW,
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=FR");
    expect(ics).toContain("DTSTART;TZID=Europe/London:20260901T180000"); // today is Tuesday
    expect(ics).toContain("DTSTART;TZID=Europe/London:20260904T180000"); // next Friday
    expect(ics).toContain("BEGIN:VALARM");
  });

  it("is empty but valid when reminders are off", () => {
    const ics = buildCalendar({
      nudge: { enabled: false, days: [1], hour: 9 },
      timezone: "UTC",
      userId: "u2",
      now: NOW,
    });
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("uses CRLF line endings as the format requires", () => {
    const ics = buildCalendar({
      nudge: { enabled: true, days: [0], hour: 8 },
      timezone: "UTC",
      userId: "u3",
      now: NOW,
    });
    expect(ics.split("\r\n").length).toBeGreaterThan(5);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});
