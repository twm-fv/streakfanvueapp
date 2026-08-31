"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  currentStreak: number;
  message: string;
  atRisk: boolean;
  freezes: { used: number; available: number; allowance: number; eligibleDates: string[] };
};

export function StreakHero({ currentStreak, message, atRisk, freezes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(freezes.eligibleDates[0] ?? "");
  const [error, setError] = useState<string | null>(null);

  const canFreeze = freezes.available > 0 && freezes.eligibleDates.length > 0;

  async function useFreeze() {
    setError(null);
    const res = await fetch("/api/freeze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: selected }),
    });
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
        <div className="freeze-tokens" aria-label={`${freezes.available} of ${freezes.allowance} freezes left`}>
          {Array.from({ length: freezes.allowance }, (_, i) => (
            <div key={i} className={i < freezes.used ? "token used" : "token"} aria-hidden>
              ❄
            </div>
          ))}
        </div>

        {canFreeze ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              aria-label="Day to freeze"
            >
              {freezes.eligibleDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button className="btn-ghost" onClick={useFreeze} disabled={pending}>
              {pending ? "Applying…" : "Use a streak freeze"}
            </button>
          </div>
        ) : (
          <button className="btn-ghost" disabled>
            {freezes.available === 0 ? "No freezes left this month" : "Nothing to freeze"}
          </button>
        )}

        {error && (
          <p className="muted-line" style={{ color: "#b3261e", marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
