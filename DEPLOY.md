# Deploying Streak and connecting a real Fanvue account

Nobody downloads a Fanvue app. Streak is a website you host; the App Store
listing points creators at your URL, and each creator connects their own
account through OAuth. So a public HTTPS deployment comes first — until Streak
is reachable at a real domain, no Fanvue account can connect to it, including
your own.

This guide gets you from the code on your laptop to a working connection with
your own creator account. Budget an hour.

---

## Step 1 — Create the Redis database (5 min)

Serverless hosts have a read-only, per-instance filesystem, so the default file
store would lose every token between requests. Redis replaces it.

1. Go to [upstash.com](https://upstash.com), sign up, create a **Redis**
   database. The free tier is enough.
2. From the database page, copy **`UPSTASH_REDIS_REST_URL`** and
   **`UPSTASH_REDIS_REST_TOKEN`**. Keep them somewhere safe for step 2.

You can skip this if you deploy somewhere with a persistent disk (a VM, Fly.io
with a volume, a container with storage). The file store works fine there.

> Keep these values out of chat, tickets and commits. If one leaks, rotate it
> from the Upstash console.

## Step 2 — Deploy (10 min)

Vercel is the path of least resistance for a Next.js app.

1. [vercel.com](https://vercel.com) → **Add New → Project** → import
   `twm-fv/streakfanvueapp`.
2. Set the production branch to `claude/fanvue-third-party-app-store-e9pimw`
   (or merge it to `main` first and use that).
3. Framework preset: **Next.js**. Build settings need no changes.
4. Add environment variables. `OAUTH_*` come in step 3, so set these now and
   finish the rest after:

   | Variable | Value |
   | --- | --- |
   | `SESSION_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `UPSTASH_REDIS_REST_URL` | From step 1 |
   | `UPSTASH_REDIS_REST_TOKEN` | From step 1 |
   | `VENDOR_NAME` | Your company or your name |
   | `SUPPORT_EMAIL` | A real address you monitor |

5. Deploy. You will get a URL like `https://showreel-xyz.vercel.app`.

Check it worked:

```bash
curl https://YOUR-URL/api/health
```

Expect `{"status":"ok","storage":"redis","demoMode":false,"warnings":[]}`.

**If `storage` says `file`**, the Redis variables did not take — fix that before
going further, or every creator will be silently logged out between requests.
**If `warnings` is non-empty**, it tells you exactly what is wrong.

Visiting the URL should show the landing page with a "Connect your Fanvue
account" button. Clicking it will bounce you back with a `not_configured`
error, which is correct — no OAuth credentials yet.

## Step 3 — Register the Fanvue app (10 min)

Requires a **creator account with KYC completed**. If yours is not set up that
way, this is where you stop until it is.

1. Go to the [Fanvue Developer Area](https://fanvue.com/developers/apps) and
   create an app.
2. Set the redirect URI to exactly:
   `https://YOUR-URL/api/oauth/callback`
   It must match character for character, including the scheme and any trailing
   path. No trailing slash.
3. Select scopes. Streak expects read-only:
   `read:self`, `read:post`, `read:insights`.
   **Write down the exact names shown in the UI** — they may differ from these,
   and step 5 is where you reconcile that.
4. Copy the Client ID and Client Secret.

## Step 4 — Finish the environment (5 min)

Back in Vercel, add:

| Variable | Value |
| --- | --- |
| `OAUTH_CLIENT_ID` | From step 3 |
| `OAUTH_CLIENT_SECRET` | From step 3 |
| `OAUTH_REDIRECT_URI` | `https://YOUR-URL/api/oauth/callback` |
| `BASE_URL` | `https://YOUR-URL` |
| `OAUTH_SCOPES` | The exact scope names from step 3, space separated |

Redeploy so the new variables are picked up.

## Step 5 — Connect your own account and check the data

Open your deployed URL and click **Connect your Fanvue account**. You should
land on Fanvue's consent screen, approve, and be returned to the dashboard.

Now read the dashboard carefully. It is designed to tell you what is wrong.

| What you see | What it means | Fix |
| --- | --- | --- |
| Dashboard with your real posting history | Everything is correct | Go to APP_STORE.md |
| Empty heatmap, streak 0, no warning | Posts endpoint path is wrong | Set `API_POSTS_PATH` to the correct path from the API docs |
| Warning: "Posting history needs the read:post scope" | Scope name mismatch | Fix `OAUTH_SCOPES` and `src/lib/fanvue/scopes.ts` to match the developer UI, reconnect |
| Warning: "Could not read your posts (API returned 404)" | Wrong path | As above |
| Warning: "...(API returned 403)" | Scope not granted | Reconnect and approve, or re-check the app's scope selection |
| Earnings panel off, with a warning | Insights scope or path | `API_INSIGHTS_EARNINGS_PATH`, or the scope name |
| Heatmap populated but shifted by a day | Timezone | Check the timezone shown in the heatmap heading matches your Fanvue profile |
| `oauth_state_mismatch` on return | Sign-in took over 10 minutes, or cookies blocked | Retry; if persistent, check `BASE_URL` matches the domain exactly |

Endpoint paths, scope names and the API version are now taken from the Fanvue
API reference rather than guessed: `/insights/earnings`, `read:self read:post
read:insights`, and version `2025-06-26`. They remain environment variables, so
if the API moves one, correcting it is a redeploy rather than a code change.

If a response comes back in a shape the parser does not recognise, the date and
amount field names it looks for are the constants at the top of
`src/lib/fanvue/source.ts`.

## Step 6 — Before you submit the listing

Work through [APP_STORE.md](./APP_STORE.md). The short version:

- A custom domain looks more trustworthy than `*.vercel.app`, and the listing
  will be seen by creators deciding whether to trust you with account access.
- `VENDOR_NAME` and `SUPPORT_EMAIL` must be real; they appear in the footer and
  both legal pages.
- Your privacy and terms pages are live at `/legal/privacy` and `/legal/terms` —
  use those URLs in the listing.
- `DEMO_MODE` must be unset in production. `/api/health` warns if it is not.
- Prepare an icon, screenshots and a description. Say plainly that Streak is
  read-only and what it stores; that is what a reviewer checks against the
  scopes you requested.

## Step 7 — Reminders (optional, 15 min)

Creators see **Reminders — Coming soon** until you switch this on. Once on, a
creator flips one switch, accepts the browser's notification prompt, and gets a
nudge on their usual posting days an hour before their usual posting time.
Nothing for them to configure.

1. Generate a VAPID key pair once, on your laptop:

   ```bash
   node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"
   ```

2. Generate a cron secret:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

3. Arrange an **hourly** trigger for `/api/cron/nudge`. Vercel's Hobby plan
   only allows daily crons and rejects the whole deployment if an hourly one is
   declared, so the repo ships without one. Two options:

   **Pro plan:** add a `vercel.json` at the repo root and Vercel sends
   `CRON_SECRET` as the Bearer token automatically:

   ```json
   { "crons": [{ "path": "/api/cron/nudge", "schedule": "0 * * * *" }] }
   ```

   **Free, any plan:** trigger it from GitHub Actions:

   ```yaml
   # .github/workflows/nudge.yml
   on:
     schedule: [{ cron: "0 * * * *" }]
   jobs:
     nudge:
       runs-on: ubuntu-latest
       steps:
         - run: >
             curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
             https://showreel-three.vercel.app/api/cron/nudge
   ```

   Add `CRON_SECRET` as a repository secret. The endpoint is idempotent per
   creator per day, so running both triggers at once would be harmless.

4. Add to Vercel and redeploy:

   | Variable | Value |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | From step 1 |
   | `VAPID_PRIVATE_KEY` | From step 1 |
   | `VAPID_SUBJECT` | `mailto:` your support address |
   | `CRON_SECRET` | From step 2 |
   | `REMINDERS_ENABLED` | `true`, only once step 3 is in place |

   `/api/health` reports `reminders.live: true` when everything is present, and
   the Coming soon label disappears for creators.

What the reminder says is written from what the dashboard last computed while
the creator was looking at it. The cron makes no Fanvue API call, by design.

## Operating it afterwards

- **Rotate the client secret** if it is ever exposed, from the Fanvue Developer
  Area, then update `OAUTH_CLIENT_SECRET` and redeploy.
- **`SESSION_SECRET` is load-bearing.** Changing it invalidates every session
  and makes stored tokens undecryptable, so every creator has to reconnect.
  Do not rotate it casually.
- **Watch `/api/health`** after each deploy. It is the fastest way to catch a
  missing environment variable.
