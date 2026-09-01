"use client";

import { useEffect, useState } from "react";
import type { ReminderInfo } from "@/lib/app";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Nudge = { enabled: boolean; days: number[]; hour: number };
type PushState = "checking" | "unsupported" | "denied" | "idle" | "busy" | "subscribed";

function b64ToBytes(b64: string): Uint8Array {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function NudgeCard({
  initial,
  timezone: initialTz,
  reminders,
}: {
  initial: Nudge;
  timezone: string;
  reminders: ReminderInfo;
}) {
  const [nudge, setNudge] = useState<Nudge>(initial);
  const [timezone, setTimezone] = useState(initialTz);
  const [calendarPath, setCalendarPath] = useState(reminders.calendarPath);
  const [deviceTz, setDeviceTz] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>("checking");
  const [origin, setOrigin] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- discover what this device can do --------------------------------------
  // Everything here reads browser APIs, so it runs after mount and commits its
  // findings in one go once the async checks have finished.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const origin = window.location.origin;
      let tz: string | null = null;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
      } catch {
        tz = null;
      }

      let pushState: PushState = "unsupported";
      if (reminders.pushEnabled) {
        const supported =
          "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
        if (!supported) pushState = "unsupported";
        else if (Notification.permission === "denied") pushState = "denied";
        else {
          try {
            const reg = await navigator.serviceWorker.getRegistration();
            const sub = await reg?.pushManager.getSubscription();
            pushState = sub ? "subscribed" : "idle";
          } catch {
            pushState = "idle";
          }
        }
      }

      if (cancelled) return;
      setOrigin(origin);
      setDeviceTz(tz);
      setPush(pushState);
    })();
    return () => {
      cancelled = true;
    };
  }, [reminders.pushEnabled]);

  // --- persist ---------------------------------------------------------------
  async function save(patch: Partial<Nudge> & { timezone?: string; rotateCalendar?: boolean }) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/nudge", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not save that. Please try again.");
      return;
    }
    const data = (await res.json()) as { nudge: Nudge; timezone: string; calendarPath: string | null };
    setNudge(data.nudge);
    setTimezone(data.timezone);
    setCalendarPath(data.calendarPath);
  }

  function toggleDay(d: number) {
    const days = nudge.days.includes(d) ? nudge.days.filter((x) => x !== d) : [...nudge.days, d].sort();
    if (days.length === 0) return;
    save({ days });
  }

  // --- push ------------------------------------------------------------------
  async function enablePush() {
    if (!reminders.vapidPublicKey) return;
    setPush("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(reminders.vapidPublicKey) as BufferSource,
        }));
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent.slice(0, 200),
        }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      if (!nudge.enabled) await save({ enabled: true });
      setPush("subscribed");
    } catch {
      setError("Could not turn on notifications on this device.");
      setPush("idle");
    }
  }

  async function disablePush() {
    setPush("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setPush("idle");
    }
  }

  async function copyCalendar() {
    if (!calendarPath) return;
    try {
      await navigator.clipboard.writeText(origin + calendarPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed; select the link and copy it by hand.");
    }
  }

  const webcal = calendarPath ? `webcal://${origin.replace(/^https?:\/\//, "")}${calendarPath}` : null;
  const suggestedHour =
    reminders.suggestedHour !== null ? (reminders.suggestedHour + 23) % 24 : null;
  const usualDays = reminders.suggestedDays;

  return (
    <div className="card rise" id="reminders">
      <div className="card-head">
        <h2>Reminders</h2>
        <button
          type="button"
          className={nudge.enabled ? "switch on" : "switch"}
          role="switch"
          aria-checked={nudge.enabled}
          aria-label="Enable reminders"
          onClick={() => save({ enabled: !nudge.enabled })}
          disabled={saving}
        >
          <span className="knob" />
        </button>
      </div>

      <p className="muted-line">
        {nudge.enabled
          ? `On ${nudge.days.map((d) => DAY_NAMES[d]).join(", ")} at ${hh(nudge.hour)} (${timezone}).`
          : "A nudge at the time you usually post. Streak never checks your Fanvue account while you are away; the reminder uses what the dashboard last saw."}
      </p>

      {nudge.enabled && (
        <>
          {/* ---- schedule ---- */}
          <div className="field">
            <span className="field-label">Days</span>
            <div className="chip-row" role="group" aria-label="Reminder days">
              {DAY_LETTERS.map((letter, d) => (
                <button
                  key={d}
                  type="button"
                  className={nudge.days.includes(d) ? "chip on" : "chip"}
                  aria-pressed={nudge.days.includes(d)}
                  aria-label={DAY_NAMES[d]}
                  onClick={() => toggleDay(d)}
                  disabled={saving}
                >
                  {letter}
                </button>
              ))}
            </div>
            {usualDays.length > 0 &&
              usualDays.some((d) => !nudge.days.includes(d)) && (
                <button className="link-btn" onClick={() => save({ days: usualDays })}>
                  Use my usual days ({usualDays.map((d) => DAY_NAMES[d]).join(", ")})
                </button>
              )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="nudge-hour">
              Time
            </label>
            <div className="inline">
              <select
                id="nudge-hour"
                value={nudge.hour}
                onChange={(e) => save({ hour: Number(e.target.value) })}
                disabled={saving}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hh(h)}
                  </option>
                ))}
              </select>
              <span className="muted-line">{timezone}</span>
            </div>
            {suggestedHour !== null && suggestedHour !== nudge.hour && (
              <button className="link-btn" onClick={() => save({ hour: suggestedHour })}>
                Use {hh(suggestedHour)}, an hour before you usually post
              </button>
            )}
            {deviceTz && deviceTz !== timezone && (
              <button className="link-btn" onClick={() => save({ timezone: deviceTz })}>
                Switch to this device&apos;s timezone ({deviceTz})
              </button>
            )}
          </div>

          {/* ---- delivery ---- */}
          <div className="field">
            <span className="field-label">Delivery</span>

            {reminders.pushEnabled && (
              <div className="delivery">
                <div>
                  <b>Notifications</b>
                  <div className="muted-line">
                    {push === "subscribed"
                      ? "On for this device."
                      : push === "denied"
                        ? "Blocked for this site in your browser settings."
                        : push === "unsupported"
                          ? "Not supported in this browser."
                          : "A notification on this device at the chosen time."}
                    {reminders.deviceCount > 0 && push !== "subscribed" && (
                      <> {reminders.deviceCount} other device{reminders.deviceCount === 1 ? "" : "s"} enabled.</>
                    )}
                  </div>
                </div>
                {push === "subscribed" ? (
                  <button className="btn-ghost" onClick={disablePush}>
                    Turn off
                  </button>
                ) : push === "idle" ? (
                  <button className="btn-primary" onClick={enablePush}>
                    Turn on
                  </button>
                ) : push === "busy" ? (
                  <button className="btn-ghost" disabled>
                    …
                  </button>
                ) : null}
              </div>
            )}

            <div className="delivery">
              <div>
                <b>Calendar</b>
                <div className="muted-line">
                  Subscribe once and your calendar app alerts you. Works on any phone or plan.
                </div>
              </div>
              {webcal && (
                <div className="inline">
                  <a className="btn-ghost as-link" href={webcal}>
                    Add
                  </a>
                  <button className="btn-ghost" onClick={copyCalendar}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              )}
            </div>
            {calendarPath && (
              <p className="muted-line tiny">
                Google Calendar: Other calendars → From URL → paste the copied link. The link is
                private to you;{" "}
                <button className="link-btn inline-link" onClick={() => save({ rotateCalendar: true })}>
                  get a new one
                </button>{" "}
                if it ever leaks.
              </p>
            )}
          </div>
        </>
      )}

      <p className="muted-line tiny" style={{ marginTop: 10 }}>
        {saving ? "Saving…" : error ? <span className="error-line">{error}</span> : "Preferences save as you change them."}
      </p>
    </div>
  );
}
