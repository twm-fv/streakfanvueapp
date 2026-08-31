"use client";

import { useEffect, useRef, useState } from "react";

type Badge = { days: number; icon: string; label: string; unlocked: boolean };

export function Badges({
  badges,
  streak,
  creatorName,
}: {
  badges: Badge[];
  streak: number;
  creatorName: string;
}) {
  const [open, setOpen] = useState<Badge | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 280, 360);
    gradient.addColorStop(0, "#473BCE");
    gradient.addColorStop(1, "#FF7A3D");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 280, 360);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "54px sans-serif";
    ctx.fillText(open.icon, 140, 120);
    ctx.font = "700 30px sans-serif";
    ctx.fillText(`${streak} day streak!`, 140, 190);
    ctx.font = "600 15px sans-serif";
    ctx.fillText(creatorName, 140, 225);
    ctx.font = "13px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`Milestone unlocked: ${open.label}`, 140, 255);
    ctx.font = "700 13px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("made with Streak", 140, 330);
  }, [open, streak, creatorName]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `streak-${open?.days ?? "milestone"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <>
      <div className="badges">
        {badges.map((badge) => (
          <button
            key={badge.days}
            type="button"
            className={`badge ${badge.unlocked ? "unlocked" : "locked"}`}
            onClick={() => badge.unlocked && setOpen(badge)}
            disabled={!badge.unlocked}
            aria-label={
              badge.unlocked
                ? `${badge.label} milestone earned. Open share card.`
                : `${badge.label} milestone not yet earned`
            }
          >
            <div className="icon" aria-hidden>
              {badge.icon}
            </div>
            <div className="lbl">{badge.label}</div>
          </button>
        ))}
      </div>

      {open && (
        <div className="modal-bg" role="dialog" aria-modal="true" aria-label="Milestone share card">
          <div className="modal">
            <canvas ref={canvasRef} width={280} height={360} />
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setOpen(null)}>
                Close
              </button>
              <button className="btn-primary" onClick={download}>
                Download image
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
