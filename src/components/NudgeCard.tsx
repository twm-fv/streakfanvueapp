"use client";

import { useState } from "react";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function NudgeCard({
  initial,
  suggestedDays,
  timezone,
}: {
  initial: { enabled: boolean; days: number[]; hour: number };
  suggestedDays: number[];
  timezone: string;
}) {
  const [nudge, setNudge] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: typeof nudge) {
    setNudge(next);
    setSaving(true);
    setError(null);
    const res = await fetch("/api/nudge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) setError("Could not save that. Please try again.");
    setSaving(false);
  }

  const dayNames = (suggestedDays.length ? suggestedDays : nudge.days)
    .map((d) => WEEKDAYS[d])
    .join(" & ");

  return (
    <div className="card">
      <h2>Gentle nudge</h2>
      <div className="nudge">
        <div className="muted-line">
          {suggestedDays.length > 0 ? (
            <>
              You usually post on <b>{dayNames}</b>. Want a reminder around{" "}
              <b>{String(nudge.hour).padStart(2, "0")}:00</b> on those days?
            </>
          ) : nudge.enabled ? (
            // Never tell someone to turn on a switch they have already turned on.
            <>
              Reminders are on. Once you have more posting history, Streak will suggest the days
              that suit you.
            </>
          ) : (
            <>A daily reminder, once there is enough history to suggest the right days.</>
          )}
        </div>
        <button
          type="button"
          className={nudge.enabled ? "switch on" : "switch"}
          role="switch"
          aria-checked={nudge.enabled}
          aria-label="Enable posting reminders"
          onClick={() =>
            save({
              ...nudge,
              enabled: !nudge.enabled,
              days: suggestedDays.length ? suggestedDays : nudge.days,
            })
          }
        >
          <span className="knob" />
        </button>
      </div>

      {nudge.enabled && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <label className="muted-line" htmlFor="nudge-hour">
            Remind me at
          </label>
          <select
            id="nudge-hour"
            value={nudge.hour}
            onChange={(e) => save({ ...nudge, hour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          <span className="muted-line">{timezone}</span>
        </div>
      )}

      <p className="muted-line" style={{ marginTop: 12, fontSize: 12 }}>
        {saving ? "Saving…" : "Your preference is saved. Reminder delivery is not enabled in this release."}
      </p>
      {error && (
        <p className="muted-line" style={{ color: "#b3261e" }}>
          {error}
        </p>
      )}
    </div>
  );
}
