"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  currentStreak: number;
  message: string;
  atRisk: boolean;
  nextMilestone: { days: number; label: string; icon: string } | null;
  freezes: {
    used: number;
    available: number;
    allowance: number;
    coverDates: string[];
    gapLength: number;
  };
};

/**
 * Counts up to the streak on mount; sits still for anyone who prefers reduced
 * motion. State starts at the target so the server render and the no-motion
 * path are already correct; only the animation frames write to it.
 */
function useCountUp(target: number, ms = 700) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (target === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

export function StreakHero({ currentStreak, message, atRisk, nextMilestone, freezes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = useCountUp(currentStreak);

  const { coverDates, gapLength, available, allowance, used } = freezes;
  const canFreeze = coverDates.length > 0;

  // Progress ring towards the next milestone.
  const target = nextMilestone?.days ?? Math.max(currentStreak, 1);
  const progress = Math.min(1, currentStreak / target);
  const R = 44;
  const C = 2 * Math.PI * R;

  function actionLabel() {
    return coverDates.length === 1 ? "Cover the day you missed" : `Cover ${coverDates.length} missed days`;
  }
  function idleLabel() {
    if (gapLength === 0) return "Streak safe, nothing to cover";
    if (available === 0) return "No freezes left this month";
    return `Needs ${gapLength} freezes, you have ${available}`;
  }

  async function useFreeze() {
    setError(null);
    const res = await fetch("/api/freeze", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not apply that freeze.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="card full streak-hero rise" id="streak">
      <div className="ring-wrap" aria-hidden>
        <svg className="ring" viewBox="0 0 100 100">
          <circle className="ring-track" cx="50" cy="50" r={R} />
          <circle
            className={`ring-fill ${atRisk ? "ring-warn" : ""}`}
            cx="50"
            cy="50"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
          />
        </svg>
        <div className={currentStreak > 0 ? "flame" : "flame cold"}>🔥</div>
      </div>

      <div className="hero-text">
        <div className="streak-num" aria-live="polite">
          {shown}
        </div>
        <div className="streak-label">
          day posting streak
          {nextMilestone && currentStreak > 0 && (
            <span className="milestone-hint">
              {" "}
              · {nextMilestone.days - currentStreak} to {nextMilestone.icon} {nextMilestone.label}
            </span>
          )}
        </div>
        <div className={atRisk ? "streak-msg warn" : "streak-msg"}>{message}</div>
      </div>

      <div className="freeze-box">
        <div className="freeze-tokens" aria-label={`${available} of ${allowance} freezes left`}>
          {Array.from({ length: allowance }, (_, i) => (
            <div key={i} className={i < used ? "token used" : "token"} aria-hidden>
              ❄
            </div>
          ))}
        </div>

        {canFreeze ? (
          <button className="btn-ghost" onClick={useFreeze} disabled={pending}>
            {pending ? "Applying…" : actionLabel()}
          </button>
        ) : (
          <button className="btn-ghost" disabled>
            {idleLabel()}
          </button>
        )}

        <p className="muted-line freeze-note">
          {canFreeze
            ? `Uses ${coverDates.length} of your ${available} remaining freezes. A freeze does not count as a post.`
            : gapLength > 0
              ? "A freeze only helps if it covers the whole gap, so your streak actually carries on."
              : "Three freezes a month, each covering one missed day in an active streak."}
        </p>

        {error && <p className="muted-line error-line">{error}</p>}
      </div>
    </div>
  );
}
