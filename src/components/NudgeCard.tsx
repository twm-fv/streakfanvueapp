"use client";

import { useEffect, useState } from "react";
import type { ReminderInfo } from "@/lib/app";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Nudge = { enabled: boolean; days: number[]; hour: number; customised?: boolean };
type Device = "checking" | "unsupported" | "ios-install" | "denied" | "ready" | "busy" | "subscribed";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function b64ToBytes(b64: string): Uint8Array {
  const padded = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function describe(days: number[], hour: number, tz: string) {
  const names = [...days].sort().map((d) => DAY_NAMES[d]);
  const list =
    names.length === 7
      ? "every day"
      : names.length > 1
        ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
        : names[0] ?? "";
  return `${list} around ${hh(hour)} (${tz})`;
}

/**
 * One switch. Turning it on asks the browser for permission, subscribes this
 * device, and schedules the reminder from the creator's own posting history.
 * Nothing to copy, paste or configure; an "Adjust" disclosure is there for the
 * few who want a different day or hour.
 */
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
  const [deviceTz, setDeviceTz] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("checking");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The schedule a first-time creator gets, taken from when they actually post.
  const suggestedHour =
    reminders.suggestedHour !== null ? (reminders.suggestedHour + 23) % 24 : null;
  const suggestedDays = reminders.suggestedDays;

  useEffect(() => {
    if (!reminders.live) return;
    let cancelled = false;
    (async () => {
      let tz: string | null = null;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
      } catch {
        tz = null;
      }
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let state: Device = "ready";
      if (!supported) {
        // iOS Safari only delivers web push to sites added to the Home Screen.
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
        state = ios && !standalone ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        state = "denied";
      } else {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          state = sub ? "subscribed" : "ready";
        } catch {
          state = "ready";
        }
      }
      if (cancelled) return;
      setDeviceTz(tz);
      setDevice(state);
    })();
    return () => {
      cancelled = true;
    };
  }, [reminders.live]);

  async function save(patch: Partial<Nudge> & { timezone?: string }) {
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
      return false;
    }
    const data = (await res.json()) as { nudge: Nudge; timezone: string };
    setNudge(data.nudge);
    setTimezone(data.timezone);
    return true;
  }

  async function turnOn() {
    if (!reminders.vapidPublicKey) return;
    if (device === "ios-install" || device === "unsupported" || device === "denied") return;
    setDevice("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "denied" : "ready");
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

      // First time on: schedule from their history. After that, respect edits.
      const schedule =
        nudge.customised || (suggestedHour === null && suggestedDays.length === 0)
          ? {}
          : {
              ...(suggestedHour !== null ? { hour: suggestedHour } : {}),
              ...(suggestedDays.length ? { days: suggestedDays } : {}),
            };
      const ok = await save({ enabled: true, ...schedule });
      setDevice(ok ? "subscribed" : "ready");
    } catch {
      setError("Could not turn on notifications on this device.");
      setDevice("ready");
    }
  }

  async function turnOff() {
    setDevice("busy");
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
    } catch {
      /* Turning off must always succeed from the creator's point of view. */
    }
    await save({ enabled: false });
    setDevice("ready");
  }

  function toggleDay(d: number) {
    const days = nudge.days.includes(d) ? nudge.days.filter((x) => x !== d) : [...nudge.days, d].sort();
    if (days.length === 0) return;
    save({ days, customised: true });
  }

  // ---------------------------------------------------------------- not live
  if (!reminders.live) {
    return (
      <div className="card rise" id="reminders">
        <div className="card-head">
          <h2>Reminders</h2>
          <span className="pill">Coming soon</span>
        </div>
        <p className="muted-line">
          A nudge at the hour you usually post, on the days you usually post, without Streak ever
          checking your account while you are away.
        </p>
        {suggestedHour !== null && suggestedDays.length > 0 && (
          <p className="muted-line tiny" style={{ marginTop: 8 }}>
            Yours would land {describe(suggestedDays, suggestedHour, timezone)}.
          </p>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------- live
  const on = nudge.enabled && device === "subscribed";
  const blocked = device === "ios-install" || device === "unsupported" || device === "denied";

  return (
    <div className="card rise" id="reminders">
      <div className="card-head">
        <h2>Reminders</h2>
        <button
          type="button"
          className={on ? "switch on" : "switch"}
          role="switch"
          aria-checked={on}
          aria-label="Reminders"
          aria-busy={device === "busy" || device === "checking"}
          onClick={on ? turnOff : turnOn}
          disabled={device === "busy" || device === "checking" || blocked}
        >
          <span className="knob" />
        </button>
      </div>

      {on ? (
        <>
          <p className="muted-line">
            On this device, {describe(nudge.days, nudge.hour, timezone)}.
            {reminders.deviceCount > 1 && ` ${reminders.deviceCount} devices in total.`}
          </p>

          <details className="adjust">
            <summary>Adjust</summary>
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
            </div>
            <div className="field">
              <label className="field-label" htmlFor="nudge-hour">
                Time
              </label>
              <div className="inline">
                <select
                  id="nudge-hour"
                  value={nudge.hour}
                  onChange={(e) => save({ hour: Number(e.target.value), customised: true })}
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
              {deviceTz && deviceTz !== timezone && (
                <button className="link-btn" onClick={() => save({ timezone: deviceTz })}>
                  This device is on {deviceTz}. Use that instead.
                </button>
              )}
            </div>
          </details>
        </>
      ) : (
        <p className="muted-line">
          {device === "ios-install"
            ? "On iPhone, add Streak to your Home Screen first (Share → Add to Home Screen), then turn this on."
            : device === "unsupported"
              ? "This browser cannot show notifications. Try it from your phone or another browser."
              : device === "denied"
                ? "Notifications are blocked for this site in your browser settings."
                : suggestedHour !== null && suggestedDays.length > 0
                  ? `One tap. You'll get a nudge ${describe(suggestedDays, suggestedHour, timezone)}, an hour before you usually post.`
                  : "One tap. A nudge at your usual posting time, without Streak ever checking your account while you are away."}
        </p>
      )}

      <p className="muted-line tiny" style={{ marginTop: 10 }}>
        {saving || device === "busy" ? (
          "Saving…"
        ) : error ? (
          <span className="error-line">{error}</span>
        ) : (
          "Streak writes the reminder from your last visit. It never checks Fanvue in the background."
        )}
      </p>
    </div>
  );
}
