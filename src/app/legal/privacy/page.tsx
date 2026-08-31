import { env } from "@/env";
import { Footer } from "@/components/Footer";
import { SCOPE_CREATOR, SCOPE_INSIGHTS, SCOPE_SELF } from "@/lib/fanvue/scopes";

export const metadata = { title: "Privacy — Streak" };

export default function Privacy() {
  return (
    <div className="wrap prose">
      <h1>Streak privacy notice</h1>
      <p className="muted-line">
        Streak is operated by {env.VENDOR_NAME}, independently of Fanvue. Contact:{" "}
        <a href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a>.
      </p>

      <h2>What Streak reads</h2>
      <p>
        When you connect your account, Fanvue asks you to approve a set of read-only scopes. Streak
        requests only these:
      </p>
      <ul>
        <li>
          <code>{SCOPE_SELF}</code> — your display name, avatar and timezone.
        </li>
        <li>
          <code>{SCOPE_CREATOR}</code> — the publication timestamps of your posts. Streak counts how
          many posts fall on each day and discards the rest. It does not read captions, media,
          messages or anything about your subscribers.
        </li>
        <li>
          <code>{SCOPE_INSIGHTS}</code> — daily earnings totals, used only for the consistency
          comparison. This scope is optional.
        </li>
      </ul>
      <p>
        Streak has no write scopes. It cannot post, message anyone, change your account or move
        money, and it never sees your Fanvue password or two-factor codes.
      </p>

      <h2>What Streak stores</h2>
      <p>Streak keeps the smallest set of data that lets the app work:</p>
      <ul>
        <li>Your Fanvue user id, used as the key for everything below.</li>
        <li>Your timezone, so streaks land on the right calendar day.</li>
        <li>The days you spent a streak freeze on, and the milestones you have earned.</li>
        <li>Your reminder preference.</li>
        <li>
          Your OAuth access and refresh tokens, encrypted at rest with AES-256-GCM, so you do not
          have to reconnect on every visit.
        </li>
      </ul>
      <p>
        Posting history and earnings are fetched from the Fanvue API when you load the page, used to
        render it, and not written to disk. Streak keeps no copy of your posts or earnings.
      </p>

      <h2>What Streak does not do</h2>
      <ul>
        <li>No selling or sharing of your data. No advertising networks. No data brokers.</li>
        <li>No third-party analytics or session-recording scripts.</li>
        <li>No sending your data to anyone outside the service you are using right now.</li>
        <li>Tokens and personal data are never written to application logs.</li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        <b>Delete my data</b> on your dashboard erases everything Streak holds for you and revokes
        its access to your Fanvue account, immediately and permanently. You can also revoke access
        from your Fanvue account settings at any time; do that and Streak loses access on its next
        request. To ask for deletion by email, write to{" "}
        <a href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a> and it will be actioned
        within 30 days.
      </p>

      <h2>Legal basis and retention</h2>
      <p>
        Streak processes this data to provide the service you asked for. Stored data is retained
        until you delete it or disconnect. Sessions expire after 30 days of inactivity.
      </p>

      <h2>Changes</h2>
      <p>
        Material changes to this notice will be announced in the app before they take effect.
      </p>
      <Footer />
    </div>
  );
}
