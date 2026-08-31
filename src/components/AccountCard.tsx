"use client";

import { useState } from "react";

export function AccountCard({ demo }: { demo: boolean }) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteEverything() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      window.location.href = "/?disconnected=1";
      return;
    }
    setError("Could not delete your data. Please contact support.");
    setDeleting(false);
  }

  return (
    <div className="card">
      <h2>Your data</h2>
      <p className="muted-line">
        Streak stores your freeze days, earned milestones and reminder preference. It does not store
        your posts, media, messages or subscriber details.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {!demo && (
          <form action="/api/oauth/logout" method="post">
            <button className="btn-ghost" type="submit">
              Disconnect
            </button>
          </form>
        )}
        {confirming ? (
          <button className="btn-danger" onClick={deleteEverything} disabled={deleting}>
            {deleting ? "Deleting…" : "Yes, delete everything"}
          </button>
        ) : (
          <button className="btn-danger" onClick={() => setConfirming(true)}>
            Delete my data
          </button>
        )}
      </div>

      {confirming && !deleting && (
        <p className="muted-line" style={{ marginTop: 10 }}>
          This erases everything Streak holds for you and revokes its access to your Fanvue account.
          It cannot be undone.
        </p>
      )}
      {error && (
        <p className="muted-line" style={{ color: "#b3261e", marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}
