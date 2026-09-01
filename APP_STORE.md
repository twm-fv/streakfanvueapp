# Fanvue App Store submission checklist

Where this app stands against the published listing requirements, and what is
left for you to do before submitting.

> Sourced from the Fanvue developer docs
> ([App Store listing requirements](https://api.fanvue.com/docs/app-store/listing-requirements),
> [Scopes](https://api.fanvue.com/docs/authentication/scopes),
> [API Access & Usage Policy](https://legal.fanvue.com/api-policy)).
> Those pages were not reachable from the machine this was built on, so the
> checklist was assembled from their published summaries. **Re-read the live
> pages and confirm each row before you submit** — particularly exact scope
> names and endpoint paths.

## Done in this repository

| Requirement | Where |
| --- | --- |
| Meaningful functionality built on the Fanvue API | Streak, heatmap, bests, badges, consistency analysis, comeback tracker — all derived from Fanvue post and insight data |
| Request only the scopes strictly needed | `src/lib/fanvue/scopes.ts`; read-only, and `read:insights` is optional with graceful degradation |
| Client secret stored server-side, never client-side | `src/lib/oauth.ts` runs server-side only; `.env.local` is gitignored |
| Session and OAuth tokens handled as sensitive data | Encrypted at rest, opaque session cookie, revoked on disconnect — see SECURITY.md |
| No logging of tokens or personal data | Token errors log status codes only; API client logs nothing |
| Redirect URI exactly matches the registered one | Single source of truth in `OAUTH_REDIRECT_URI`, used for both authorize and token exchange |
| OAuth 2.0 with PKCE and state | `src/lib/oauth.ts`, `src/app/api/oauth/` |
| Privacy policy | `/legal/privacy` |
| Terms of use | `/legal/terms` |
| Clear third-party identification | Footer on every page; no Fanvue branding, no implication of affiliation |
| User-initiated data deletion | `/api/account` DELETE, surfaced as "Delete my data" |
| Graceful handling of rate limits | Retry with backoff honouring `Retry-After` in `src/lib/fanvue/client.ts` |

> Getting from code to a live, connected deployment is covered step by step in
> [DEPLOY.md](./DEPLOY.md). Do that first — most of the rows below are verified
> by actually connecting an account.

## Before you submit

1. **Register the app.** Fanvue Developer Area, on a creator account with KYC
   completed. Creating apps and publishing to the App Store both require it.
2. **HTTPS everywhere.** Every endpoint, page and redirect URI must use HTTPS
   with a valid certificate and no browser warnings. Redirect URIs and any
   webhook callbacks must point at domains you control.
3. **Set the real listing details.** `VENDOR_NAME` and `SUPPORT_EMAIL` currently
   hold placeholders and appear in the footer and both legal pages.
4. **Confirm the scope names** in `OAUTH_SCOPES` against the live scopes page,
   select the identical set in the developer UI, and check that the constants in
   `src/lib/fanvue/scopes.ts` match.
5. **Confirm the endpoint paths and API version.** `API_POSTS_PATH`,
   `API_INSIGHTS_EARNINGS_PATH` and `API_VERSION` carry best-effort defaults.
   Run against a real account and check the heatmap and earnings panels populate
   before submitting.
6. **Move the secret into a secrets manager** and set a rotation plan.
7. **Configure Redis** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
   Required on any serverless host; `/api/health` reports which store is live.
8. **Turn `DEMO_MODE` off.**
9. **Host the legal pages** at stable public URLs and use those in the listing.
10. **Prepare listing assets**: icon, screenshots, short and long description.
    The description should state plainly that Streak is read-only and what it
    stores, because that is what a reviewer checks against the scopes requested.

## Things deliberately not built

- **No webhooks.** Streak has no need to receive events, so it registers no
  webhook endpoint and asks for no related permission.
- **No write scopes.** The app cannot post or message on a creator's behalf.
- **No background access.** Streak calls the Fanvue API only while a creator is
  looking at the page. It runs no unattended job against their account.
- **Reminders without background account access.** Web Push and calendar
  reminders fire on the creator's schedule, written from what the dashboard last
  saw while they were present. The hourly job makes no Fanvue API call, so the
  app never holds a live session to an account whose owner is away.
