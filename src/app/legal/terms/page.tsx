import { env } from "@/env";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Terms — Streak" };

export default function Terms() {
  return (
    <div className="wrap prose">
      <h1>Streak terms of use</h1>
      <p className="muted-line">
        Streak is provided by {env.VENDOR_NAME}. It is an independent third-party application. It is
        not built, operated, endorsed or supported by Fanvue, and Fanvue is not a party to these
        terms.
      </p>

      <h2>What the service is</h2>
      <p>
        Streak reads your Fanvue posting history through the public Fanvue API, with your explicit
        authorisation, and presents it back to you as streaks and summary statistics. It is an
        analytics and motivation tool. It is not a scheduling tool, a posting tool or a financial
        record.
      </p>

      <h2>Accuracy</h2>
      <p>
        Figures shown in Streak are derived from what the Fanvue API returns for your account. They
        are presented for your own interest and are not a statement of account, tax record or
        financial advice. Where earnings are shown, treat Fanvue&apos;s own reporting as the source of
        truth.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your Fanvue account secure. Never share your password or two-factor codes with anyone, including Streak.</li>
        <li>Use Streak only for your own account, with authorisation you granted yourself.</li>
        <li>Do not attempt to use Streak to access another creator&apos;s data.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        Streak depends on the Fanvue API. If that API is unavailable, rate limits a request, or
        changes, parts of Streak may stop working. The service is provided as is, without warranty.
      </p>

      <h2>Ending the relationship</h2>
      <p>
        You can disconnect and delete your data from inside the app at any time, or revoke access
        from your Fanvue settings. Either ends the service immediately.
      </p>

      <h2>Contact</h2>
      <p>
        <a href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a>
      </p>
      <Footer />
    </div>
  );
}
