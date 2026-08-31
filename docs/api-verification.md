# Step 1 — Fanvue API verification

The plan gates prototype work behind a 20-minute API test. This note records what is
already settled from the public reference and what still needs a dev account to answer.
`npm run verify:api` is that test, written out so whoever has the dev account can run it
and paste the output back in below.

## Not run yet, and why

The verification has not been executed against the live API. It needs a dev-account
access token, which means an interactive login by a person; no token is stored in this
repo and none should be. The environment this scaffold was built in also has no egress to
`api.fanvue.com`, so even an unauthenticated docs fetch was not possible from here.

To run it:

```bash
cp .env.example .env          # fill in FANVUE_DEV_ACCESS_TOKEN with a dev-account token
npm install
npm run verify:api            # add --upload to include the upload-session round trip
```

The script writes `docs/api-verification-run.md` (gitignored) and prints the same report.
Use a dev/test account. Never point it at a production creator account.

## Settled from the public reference (31 Aug 2026)

| Capability | Endpoint | State |
| --- | --- | --- |
| List creator media incl. video | `GET /media` | documented |
| Signed variant URLs | `GET /media/{uuid}?variants=main,thumbnail,blurred` | documented; video `main` returns an mp4 URL with width/height/lengthMs |
| Upload clips back | create upload session → upload → complete | documented and live |
| Granular scopes | OAuth 2.0 + PKCE, versioned API header | documented |
| SFW gate metadata | media `tags` carry `isNsfw` and categories | documented |
| Vault folders | list folders, list media in folder, add/remove | reported as existing, exact paths unconfirmed |

## Open questions the run needs to answer

1. **Signed-URL TTL.** How long does a `main` variant URL stay valid? Anything under ~15
   minutes means the engine has to be handed bytes we re-fetch, not a URL it holds.
   `--ttl-probe-minutes 20` re-checks the same URL after a wait.
2. **Large files.** Does the CDN advertise `accept-ranges` and answer a ranged GET with
   206? Without resume, multi-GB sources need a different transfer strategy.
3. **Original or transcode.** Is `main` the creator's upload or a platform transcode?
   Decides output quality ceiling and egress cost.
4. **Rate limits.** Which headers come back, and what do they allow per creator?
5. **Upload session shape.** Field names for the session id and upload URL, and whether
   the PUT wants the whole file or parts. `src/fanvue/client.ts` currently accepts either
   `uuid`/`id` and `uploadUrl`/`url`; pin it once observed.
6. **Tag coverage.** How many Vault videos actually carry `isNsfw`? The export gate treats
   missing tags as "not cleared", so poor coverage means a lot of Vault-only clips.

None of these block building. They shape implementation, which is why the scaffold keeps
transfer and upload behaviour behind narrow seams (`FanvueClient`, `ClippingEngine`).

## Findings

_Paste the output of `npm run verify:api` here once it has been run, with the date and the
account used (dev account id, not creator names)._
