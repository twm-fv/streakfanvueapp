"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  currentStreak: number;
  message: string;
  atRisk: boolean;
  freezes: {
    used: number;
    available: number;
    allowance: number;
    coverDates: string[];
    gapLength: number;
  };
};

export function StreakHero({ currentStreak, message, atRisk, freezes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { coverDates, gapLength, available, allowance, used } = freezes;
  const canFreeze = coverDates.length > 0;

  function actionLabel() {
    if (coverDates.length === 1) return "Cover the day you missed";
    return `Cover ${coverDates.length} missed days`;
  }

  /** Says why the button is unavailable, rather than leaving it inert. */
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
    <div className="card full streak-hero">
      <div className="flame-wrap">
        <div className={currentStreak > 0 ? "flame" : "flame cold"}>🔥</div>
      </div>
      <div>
        <div className="streak-num">{currentStreak}</div>
        <div className="streak-label">day posting streak</div>
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

        <p className="muted-line" style={{ marginTop: 8, fontSize: 12, maxWidth: 260 }}>
          {canFreeze
            ? `Uses ${coverDates.length} of your ${available} remaining freezes. A freeze does not count as a post.`
            : gapLength > 0
              ? "A freeze only helps if it covers the whole gap, so your streak actually carries on."
              : "Three freezes a month, each covering one missed day in an active streak."}
        </p>

        {error && (
          <p className="muted-line" style={{ color: "#b3261e", marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
