# Security review: CareFusion AI (alpha, live site)

Date: 2026-10-31. Reviewer: Claude (white-box code review of `apps/api`, `packages/shared`, plus read-only requests to https://carefusion-roan.vercel.app). No exploit was run, no data changed, no load was sent.

**Scope and limits.** Read in full: access gate, auth guard, demo identity, security headers, rotating key, registration trust, RLS context service, upload/download path, cron endpoint, public bundle. Searched all of `apps/api/src` for SQL string building. Not read line by line: every business service (about 40 files), the web app, Keycloak config. Not verified: the real values of Vercel environment variables (the Vercel CLI was not available here). Findings marked "verify" depend on those.

## Context: alpha only

This review was done for an alpha on synthetic data. The access code is a demo gate, not production security. Findings 1, 3, 4, 5, 6, 7, 8, 9 and 12 only become real problems when real data or real users arrive; they are gated on that. Fixed on branch `security-alpha-fixes` (alpha scope): finding 2 (typed key now needs the patient's ABHA number, and five wrong keys in ten minutes lock that doctor and address for ten minutes; tests in `apps/api/test/doctor-key.test.ts`), the `/health` route (now served by the API on Vercel), and a CI dependency audit (fails on critical, reports the rest). Decided not to change for now: `ACCESS_KEY_SECRET` (finding 3), and the static-host `access-control-allow-origin: *` (finding 15; Vercel adds it to static files and `vercel.json` can only override it, not remove it; it exposes no cookies or API).

## Summary

| # | Severity | Finding |
|---|---|---|
| 1 | Critical (for anything beyond a demo) | Demo mode: anyone past the access gate can act as any of the 12 roles |
| 2 | High | Rotating 6-digit key can be guessed across all citizens (about 0.5% per try, no limit) |
| 3 | High | Access-code limit can be bypassed with a forged cookie if `ACCESS_KEY_SECRET` is the default (verify) |
| 4 | High | Access cookie never expires on the server, and is the same for everyone |
| 5 | High | Registration trusts client-supplied "OTP done" and "face check passed" |
| 6 | Medium | Government/admin services use the owner DB connection, so row-level security does not protect them |
| 7 | Medium | Row-level security silently turns off if the role switch fails |
| 8 | Medium | Registration can attach to any person id (doctor, admins, guardian) with no proof of ownership |
| 9 | Medium | Only the access gate has a rate limit; everything else can be hammered |
| 10 | Medium | Key used-list is per server instance (single-use key not guaranteed) |
| 11 | Medium | Dependency advisories: 1 high (zod), 5 moderate |
| 12 | Low | Uploaded file type is taken from the client; download links last 1 hour |
| 13 | Low | Account/identity enumeration in registration errors |
| 14 | Low | Rate-limit client id falls back to a spoofable header off Vercel |
| 15 | Low | CORS `*` and `unsafe-inline` styles on the static host; `/health` returns the web page |
| 16 | Info | Things that are done well |

## Findings

### 1. Demo mode gives every role to everyone (Critical outside the demo)
`apps/api/src/auth/auth.guard.ts`. With `DEMO_MODE=true` the API accepts `Authorization: Bearer demo:<ROLE>` or `X-Demo-Role: <ROLE>` from any caller and builds the identity from the first active user of that role. There are no passwords, OTP, MFA or sessions. So a person with the access code, or anyone who passes finding 3 or 4, can call any API as CENTRAL_ADMIN, DOCTOR and so on, including break-glass, approvals, alerts and system flags.
**Fix:** this is acceptable only while all data is synthetic and the gate is secret. Before any real use: set `DEMO_MODE=false` in production, turn on the existing JWT/Keycloak validation (`jwt.strategy.ts`), and build real staff/admin login. Until then keep the gate code private and rotate it after each test round. Make `DEMO_MODE` default fail-closed (already `false` unless set; keep it that way in code review).

### 2. Rotating key can be guessed across citizens (High)
`apps/api/src/doctor/access-key.service.ts`. A key typed as six digits is checked against every active citizen account; it is accepted if exactly one citizen matches. With about 2,350 citizens and 10^6 codes, and two valid time windows, a random six-digit guess opens somebody's record with roughly 0.4 to 0.5% probability. About 200 guesses is enough. Nothing limits attempts on the doctor open endpoint, and any DOCTOR (or any caller in demo mode) can use it. The QR form with the handle is not affected.
**Fix:** require a patient identifier together with the code (ABHA number or handle) so the space is per person; limit attempts per doctor and per IP (for example 5 failures then 15-minute lock plus an audit alert); move the used-list to shared storage (Valkey or a DB table) so single use holds across instances.

### 3. Access-code limit can be bypassed (High, verify)
`apps/api/src/access/access.service.ts`. The cookie is `HMAC(ACCESS_KEY_SECRET, "cf-access:" + code)`. If `ACCESS_KEY_SECRET` is not set in production, the secret is the default string written in the source (`cf-demo-access-key-secret-not-for-production`, also used in `access-key.service.ts` and `citizen-app/access/access.service.ts`). Then anyone with the source can compute the cookie for any guessed code and just send it. Checking a cookie is not rate limited, so the 5-tries-in-10-minutes lock does not apply.
**Fix:** confirm in Vercel that `ACCESS_KEY_SECRET` is set to a long random value (and `ACCESS_CODE` is long, 16+ characters). Make the app refuse to start in production if `ACCESS_KEY_SECRET` is missing (no default). Use a different secret per purpose.

### 4. Access cookie is permanent and shared (High)
`access.controller.ts`. `Max-Age=43200` is only a browser hint. The cookie value never changes and has no timestamp, so a copied cookie (browser extension, shared machine, proxy log) works until the code or secret changes. It also cannot be revoked per tester.
**Fix:** put an expiry timestamp and a random session id inside a signed token, check it on the server, store sessions in the DB so they can be revoked. Use the `__Host-` cookie prefix. Consider one code per tester so a leak can be traced.

### 5. Registration trusts the client (High)
`apps/api/src/registration/registration.service.ts`, `packages/shared/src/registration.ts`. The submit request carries `aadhaarToken` (any string that is not 12 digits) and `faceCheckPassed: true` as plain fields. The server never checks that an OTP was verified or a face check passed for that token. Anyone can register with an invented token, and can also register a victim's real (mock) token first, which blocks them with "already registered".
**Fix:** make the e-KYC and face-check steps return a short-lived server-signed proof (transaction id bound to the token, one use, 10-minute expiry) and verify it in `registerCitizen`. Do this before connecting a real Aadhaar/ABDM service.

### 6. Admin services bypass row-level security (Medium)
Gov, hospital-admin, pharmacy-admin and pharmacist code call `this.db.query(...)` with the owner connection; only code that uses `RequestDbService` runs as `cf_app` with RLS. For those modules authorisation depends only on scoping code, such as the `area.sql` builders in `gov-admin`. One missed `WHERE` leaks across hospitals or districts. This is a design weakness, not a confirmed leak.
**Fix:** run all authenticated reads and writes through `RequestDbService`, or add an automated test that calls every endpoint as a user from another hospital/district and expects 403/404.

### 7. RLS fails open (Medium)
`events/request-db.service.ts` `switchRole`. If `SET LOCAL ROLE cf_app` fails (for example after a database or Neon change), the code logs a warning once and continues with no RLS.
**Fix:** in production fail closed (throw) unless `RLS_SET_ROLE` is explicitly empty. Add a startup self-test that checks RLS is active.

### 8. Registration can attach to any person id (Medium)
Doctor, hospital-admin, pharmacy-admin and minor-guardian registration take a `personId` UUID with no proof the caller is that person. Person ids appear in API responses and the registration result screen. A caller who learns a UUID can create a pending doctor or admin request in that person's name, or name them as guardian. Approval limits the damage, but approvers are shown a real person's name.
**Fix:** require the caller to be signed in as that person, or a one-time code sent to that person's verified phone, before using their `personId`.

### 9. No general rate limiting (Medium)
Only the access-code check is limited. `grep` finds no throttling elsewhere. Open to brute force and cost abuse: key entry, registration, e-KYC mock, uploads, AI tools, message and complaint creation, event emit, alert creation.
**Fix:** add a global limiter (for example `@nestjs/throttler` with a DB or Valkey store) plus tighter limits on key entry, registration, uploads and anything that sends events. Vercel Firewall rate-limit rules are a quick extra layer.

### 10. Single-use key not enforced across instances (Medium)
The used-key map is in memory per serverless instance; on Vercel a second instance accepts the same key again (the file comment says Valkey was planned). Same fix as finding 2.

### 11. Dependencies (`pnpm audit --prod`)
- High: `zod` below 4.6.6 (memory exhaustion on oversized collections) in `packages/shared`.
- Moderate: `file-type` (two issues) and `@nestjs/core` 10.x (needs 11.1.18+), `react-router` 6.30.6 (open redirect via backslash, `deserializeErrors`; needs 7.18+).
The project notes say Nest 11, Zod 4 and react-router 7 upgrades were deferred on purpose.
**Fix:** schedule the upgrades; until then list them in the decision log with the reason and run `pnpm audit` in CI so new advisories fail the build.

### 12. Uploads and downloads (Low)
`documents.service.ts`. Good: type allow-list, magic-byte check for PDF/images/Word, empty-file check, 20 MB limit, random key, sanitised file name, SHA-256 stored. Weak spots: the stored `Content-Type` comes from the client (`file.mimetype`); `getPresignedUrl` has no forced `Content-Disposition: attachment`, so a file is served inline from the R2 host for 1 hour; there is no malware scan (`virus_status` stays pending).
**Fix:** set the content type from the checked signature, force download with `ResponseContentDisposition` and `nosniff`, shorten the link to a few minutes, add a scanner before release to doctors.

### 13. Enumeration in registration (Low)
Distinct 409 messages for existing Aadhaar token, phone and email let a caller test whether a person is registered. Use one generic message once real data is involved.

### 14. Client IP for the gate limiter (Low)
`x-vercel-forwarded-for` is trusted first (correct on Vercel). Off Vercel it falls back to `x-forwarded-for`, which a client can set, so an attacker could dodge the lock. Also, one NAT address shares one counter. Use the platform's trusted IP only.

### 15. Headers and routing (Low)
- Static pages return `access-control-allow-origin: *` (platform default for static files). It does not expose the API but add a header rule to remove it.
- The CSP allows `style-src 'unsafe-inline'`; acceptable for now, tighten later with nonces.
- `GET /health` on the live host returns the web page, not an API health check, because the rewrite sends it to `index.html`. Monitoring will always see 200. Route it to the function or use `/api/v1/clock`.
- `/.env`, `/.git/config`, source maps and `/swagger` do not exist (the first three return the web page or 403); good.

### 16. Done well
- All SQL I found is parameterised; the few string-built pieces use fixed fragments or numbers (`order`, `limit`, `where`). Dynamic `UPDATE ... SET` lists are built from fixed column names (`dates.service.ts`, `profile.service.ts`, `settings.service.ts`); worth one more look when those files change.
- Calendar feed token is 24 random bytes, only its SHA-256 is stored, and it can be revoked.
- Cron endpoint uses a constant-time compare and is closed when `CRON_SECRET` is unset.
- Access-code compare is constant-time; only a keyed hash of the IP is stored.
- Security headers on API and static host (HSTS preload, `nosniff`, frame deny, no-referrer, `Cache-Control: no-store` on API).
- Public bundle contains no secrets or connection strings; source maps are not served.
- Database defences: immutability triggers, hash-chained audit log, patient events blocked from government roles, no raw Aadhaar.
- Mock connectors and demo identifiers cannot pass as real numbers.

## Suggested order of work
1. Today: confirm in Vercel that `ACCESS_KEY_SECRET`, `ACCESS_CODE` and `CRON_SECRET` are set to long random values (findings 3, 9 cron). Rotate the access code after the tester round.
2. Next weekend: fix findings 2, 4, 9 and 10 (key entry with patient id plus limits, signed expiring cookie, rate limiter, shared used-list).
3. Before the Ministry demo: findings 5, 7, 8, 12, 15 and the dependency upgrades (11).
4. Before any real data: replace demo login (finding 1), move admin services behind RLS (6), add a cross-hospital authorisation test suite.

## Open questions
- Is `ACCESS_KEY_SECRET` set in production? (decides if finding 3 is real)
- Will testers get one shared code or one each?
- Should the demo remain open to every role for every tester, or should testers be limited to the roles they test?
