import { env } from "@/env";

/**
 * The independence disclaimer is deliberately on every page. Streak connects to
 * Fanvue through the public API; it is not built or operated by Fanvue.
 */
export function Footer() {
  return (
    <footer>
      <p>
        Streak is an independent app by {env.VENDOR_NAME}. It works with Fanvue via the public
        Fanvue API and is not built, operated or endorsed by Fanvue.
      </p>
      <p>
        <a href="/legal/privacy">Privacy</a> &middot; <a href="/legal/terms">Terms</a> &middot;{" "}
        <a href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a>
      </p>
    </footer>
  );
}
