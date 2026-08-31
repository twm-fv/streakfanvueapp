# Showreel

Prototype of a Fanvue App Store app that turns a creator's long Vault videos into a page
trailer, social teasers (9:16 / 1:1 / 16:9) or a subscriber recap. Clips go back into the
Vault; mainstream-safe ones can then be exported to TikTok/IG/YT.

Built to the standard third-party pattern: iframe frontend, OAuth 2.0 + PKCE install,
`postMessage` payments, webhooks. The clipping itself is a swappable engine (OpusClip by
default) - no clipping tech is built here.

## Status

Scaffold, not a pilot build. Everything below runs; three things are deliberately not live:

- **API verification has not been run.** It needs a dev-account token and interactive
  login. See `docs/api-verification.md` for the script and the open questions.
- **Payments are stubbed.** `PAYMENTS_ENABLED=false` records a purchase request and
  exercises the `postMessage` path without creating a Fanvue payment session or charging
  anyone. Real payments need app registration first.
- **The Embedded App SDK is a shim.** `public/fanvue-sdk.js` mirrors the real SDK's method
  names and message shapes so swapping it in is an import change.

## Quick start

```bash
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # TOKEN_ENCRYPTION_KEY
npm run dev      # http://localhost:3000
npm test         # 17 tests, no network
npm run typecheck
```

With `CLIPPING_ENGINE=mock` (the default) the render pipeline runs end to end without an
OpusClip key. It still needs a Fanvue grant to read and write the Vault, so an unconnected
app shows the install panel.

## How a render works

1. Creator opens the app in the Fanvue iframe; `/api/session` reports whether we hold a grant.
2. Install: `/auth/start` → Fanvue consent → `/auth/callback` exchanges the code (PKCE) and
   stores encrypted tokens keyed by the `sub` claim, so a reinstall keeps the credit balance.
3. `/api/media` lists Vault videos with their credit cost and social-export verdict.
4. `POST /api/clips` charges credit minutes, downloads the `main` variant to scratch, hands
   it to the clipping engine, uploads each clip back through the upload-session flow, and
   deletes the scratch copy in a `finally` block whether the job succeeded or failed.
5. `POST /api/purchase` creates a credit-pack purchase request; the frontend asks the shell
   to open the native payment modal; the result arrives at `/webhooks/fanvue`, never from
   the iframe.

## Layout

```
src/config.ts            env config, validated at boot
src/fanvue/              endpoints, OAuth + PKCE, API client, webhook signature checks
src/clipping/            engine interface, OpusClip adapter, offline mock, render pipeline
src/payments/            credit ledger (per rendered minute) and purchase requests
src/safety/              SFW export gate over existing AI tags, media access log
src/routes/              session, auth, media, clips, payments, webhooks
public/                  iframe frontend and the Embedded App SDK shim
scripts/verify-api.ts    Step 1 API verification
```

## Registration steps still needed from the developer platform

The app cannot leave mock mode until these come back from app registration:

1. `client_id` / `client_secret`, plus the authorize and token endpoint URLs.
2. Redirect URI allowlisting for `${PUBLIC_BASE_URL}/auth/callback`.
3. The frontend origin(s) to allow, so the shell's CSP and our `frame-ancestors` agree.
4. Scope names for media read/write (`.env.example` guesses `read:media write:media`).
5. The payment-session endpoint and payload, plus the credit-pack product definition.
6. Webhook delivery URL registration, the signing secret, and the exact signature and
   timestamp header names (`src/fanvue/webhooks.ts` assumes `X-Fanvue-Signature` and
   `X-Fanvue-Timestamp` over `timestamp.rawBody`).
7. An OpusClip API key, if the pilot uses the real engine rather than the mock.

## Data handling

- Creator OAuth tokens are AES-256-GCM encrypted at rest; without `TOKEN_ENCRYPTION_KEY`
  the process refuses to persist them rather than writing plaintext.
- Source video is scratch: downloaded under `WORK_DIR`, deleted when the job ends.
- `data/media-access.log` records media touches by id only - no URLs, no filenames, no
  creator-identifying detail.
- Signed URLs and tokens are never logged.
- The JSON stores under `data/` are prototype-grade. Move to a real database before any
  pilot with creators, and revisit retention.

## Not built here, on purpose

Building a clipping engine in-house, or white-labelling one as a native feature. Both
contradict the store thesis: this is a third-party app against the public APIs, and the
render cost sits with the engine vendor.
