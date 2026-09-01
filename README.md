# Streak

A habit tracker for Fanvue creators. Streak reads your posting history through
the public Fanvue API and turns it into a streak counter, an activity heatmap,
milestone badges and an honest look at whether consistency tracks with earnings.

**Streak is an independent third-party app.** It is not built, operated or
endorsed by Fanvue. It connects to Fanvue the same way any other App Store app
does: through OAuth, with scopes the creator approves and can revoke.

## What it does

| Panel | What it shows | Needs |
| --- | --- | --- |
| Streak counter | Consecutive posting days in the creator's own timezone, with three freezes per calendar month | `read:post` |
| Activity heatmap | Every day of the analysis window, Sunday-aligned | `read:post` |
| Personal bests | Longest streak, busiest week, biggest earning day, freezes used | `read:post` |
| Milestone badges | 7 / 30 / 100 / 365 days, with a downloadable share card | `read:post` |
| Consistency vs earnings | Weekly posts against weekly earnings, and the measured uplift | `read:insights` |
| Comeback tracker | How fast the creator returns after a break | `read:post` |
| Insights | Ranked, sample-guarded observations: streak at risk with the deadline, best-earning weekdays, posts-to-target this week, momentum, natural posting hour | `read:post`, some need `read:insights` |
| Reminders | Web Push at the chosen hour on chosen days, plus a private calendar feed; defaults derived from the creator's own posting hour and days | — |

Every panel degrades on its own. Decline `read:insights` and the earnings panel
switches itself off; the rest still works.

## Running it

```bash
pnpm install
cp .env.example .env.local   # then fill it in
pnpm dev
```

### Demo mode

To see the whole app without connecting any account:

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))") \
DEMO_MODE=true pnpm dev
```

Demo mode generates deterministic sample data and never contacts Fanvue. It
exists so the app can be demoed and reviewed without anyone handing over
credentials. **Never enable it in production.**

### Connecting to Fanvue for real

1. Create an app in the [Fanvue Developer Area](https://fanvue.com/developers/apps).
   Publishing to the App Store requires a creator account with KYC completed.
2. Register a redirect URI on a domain you own, over HTTPS:
   `https://your-domain/api/oauth/callback`.
3. Select scopes in the Fanvue UI and set the identical list in `OAUTH_SCOPES`.
   The two must match exactly.
4. Set `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`,
   `BASE_URL` and `SESSION_SECRET`.

For local HTTPS, the approach in Fanvue's own
[app starter](https://github.com/fanvue/fanvue-app-starter) works well
(`portless`, or `mkcert` plus `local-ssl-proxy`).

## Architecture

```
src/
  env.ts                  Validated configuration, fails loudly when incomplete
  lib/
    oauth.ts              PKCE, token exchange, refresh, revocation
    session.ts            Opaque session ids; tokens stay server side
    crypto.ts             HKDF key derivation, AES-256-GCM for tokens at rest
    http.ts               Same-origin checks, rate limiting, error shapes
    store/                Store interface, file and Redis implementations
    fanvue/
      client.ts           Authenticated HTTP with retry and backoff
      source.ts           Fanvue API -> normalised daily activity
      demo.ts             Deterministic sample data for DEMO_MODE
      scopes.ts           The scopes each feature needs
    streak/
      dates.ts            Timezone-correct calendar arithmetic
      engine.ts           All streak logic, pure and unit tested
  app/                    Routes, pages, legal pages
```

The streak logic is deliberately pure: `analyse()` takes daily activity and
returns everything the dashboard renders, with no I/O. That is what the tests
cover.

## Production notes

- **Storage.** Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` and
  the app uses Redis; leave them unset and it uses the file store. Serverless
  hosts **require** Redis, because their filesystem is read-only and
  per-instance. To use another database, implement the `Store` interface in
  `src/lib/store/types.ts` and return it from `getStore()`; the contract tests
  in `src/lib/store/store.test.ts` define what it must do.
- **Rate limiting.** `rateLimit()` is in-process. Back it with shared storage if
  you run more than one instance.
- **Reminders never touch Fanvue in the background.** The hourly sender writes
  each reminder from what the dashboard last computed while the creator was
  present (`lastSeen`), so the app holds no live session to anyone's account
  while they are away. That is a deliberate trust boundary, not a gap. Web Push
  needs VAPID keys and `CRON_SECRET`; the calendar feed needs nothing.
- **Endpoint paths.** `API_POSTS_PATH` and `API_INSIGHTS_EARNINGS_PATH` are
  configurable so a docs change does not require a code change. Verify them
  against the current [Fanvue API docs](https://api.fanvue.com/docs/welcome)
  before going live.

## Testing

```bash
pnpm test        # streak engine and demo data
pnpm typecheck
pnpm lint
```

See [DEPLOY.md](./DEPLOY.md) to get it live and connected to a real account,
[SECURITY.md](./SECURITY.md) for the security model, and
[APP_STORE.md](./APP_STORE.md) for the submission checklist.
