# Security model

Streak is a third-party app handling creator data on someone else's platform.
The design assumption is that it will be reviewed, and that a compromise of this
app must not become a compromise of a Fanvue account.

## Credentials

- **Streak never sees a Fanvue password or 2FA code.** Authentication happens on
  Fanvue's own domain. The app only ever receives an OAuth authorisation code.
- **No credential automation of any kind.** No headless browser logins, no
  stored passwords, no scraping a session cookie, no unattended login to a
  Fanvue account. Access comes from an OAuth grant the creator makes and can
  revoke.
- **The client secret is server-side only.** It appears in `src/lib/oauth.ts`,
  which runs on the server. It is never sent to the browser. Load it from a
  secrets manager in production and rotate it if it is ever exposed.

## Tokens

- **Authorisation Code flow with PKCE (S256)**, plus a random `state` checked on
  callback. Both the verifier and state are short-lived, `httpOnly` cookies.
- **The browser never holds a Fanvue token.** The session cookie contains an
  opaque random session id and nothing else. Access and refresh tokens live in
  the server-side store, encrypted with AES-256-GCM under a key derived from
  `SESSION_SECRET` via HKDF, separate from the cookie-signing key.
- **Disconnect revokes.** Logout and data deletion both call the revocation
  endpoint, so a disconnected creator leaves no usable token behind.
- **Tokens are never logged.** Token endpoint failures log a status code only,
  deliberately not the response body. The API client logs no headers or bodies.

## Data minimisation

Streak stores, per creator: their Fanvue user id, timezone, frozen dates, earned
milestones, longest recorded streak, and a reminder preference.

It does not store posts, captions, media, messages, subscriber lists, fan
identities or transaction records. Posting history and earnings are fetched at
render time, aggregated to daily counts, and discarded.

Scopes requested are read-only. There is no write scope, so the app cannot post,
message anyone, change account settings or move money. Earnings access
(`read:insights`) is optional and the app works without it.

Creators can erase everything from the dashboard. Deletion is immediate and also
revokes the token.

## Web hardening

- Content-Security-Policy with a per-request nonce and `strict-dynamic`; no
  `unsafe-inline` scripts in production. `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'self'`.
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`.
- `connect-src 'self'`: the browser never talks to Fanvue directly.
- State-changing routes require same-origin and a `SameSite=Lax` session cookie.
- Freeze eligibility and the monthly allowance are enforced server-side. The
  client cannot freeze an arbitrary day by posting a different date.
- All input is parsed with zod schemas before use.
- Per-user rate limiting on the mutating routes.

## Known limits

- `FileStore` and the in-process rate limiter are single-instance. Both need a
  shared backend before horizontal scaling. See README.
- `DEMO_MODE` bypasses authentication by design, because it serves generated
  data and touches no real account. It must be off in production.

## Reporting

Email the address in `SUPPORT_EMAIL`. Please do not open a public issue for a
security report.
