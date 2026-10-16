# Backend W1 + W2 report - email links, env completion, verification gate, consent summary, e2e isolation, country derivation

Branch `backend/w1-w2-links-country-verification`. `services/api`, `render.yaml`, `.env.example`, `docs/deployment.md` only. No frontend change, and **B-075 is not shipped** (see Section 4). Rows: B-016, B-018, B-020, B-021, B-022 (W1) and B-023, B-024, B-025 (W2). Decisions: #367, #368, #372, #374, #375, #389.

Everything below that depends on an account or key that does not exist in this repository **fails safe** and is listed in Section 3 as a founder action. No secret was requested, read or printed.

## 1. What was built, per row

| Row | Built | Where |
|---|---|---|
| **B-016** email links | Verify-email, guardian-consent (initial, resend, automatic re-send) and withdrawal emails now carry a link built from `WEB_APP_BASE_URL` (`/verify-email?token=...`, `/guardian-consent/confirm?token=...`), in both text and HTML bodies. The old bare "code" wording is gone. If the base URL is unset, a placeholder, or plain `http` outside localhost, the email is **not sent** and an error naming `WEB_APP_BASE_URL` is logged (a dead link is worse than none). The password-reset email is unchanged (known follow-up). | `registration/email/web-app-link.util.ts`, `registration-email.service.ts` |
| **B-018** render.yaml / env | Audited against every `ConfigService.get` / `process.env.X` in `src`. The 22 gaps the audit named were already closed by PR #392; remaining work: added `TRUST_PROXY_HOPS`, `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY`, `GEOLITE2_DB_PATH`, `HELD_INVESTIGATION_ALERT_DAYS` to both services and `.env.example`; `HELD_INVESTIGATION_ALERT_DAYS` is now a real env var (default 90; was a constant, audit item 9) shared by the sweep and the admin read. **Boot-time check**: in production the app refuses to start if `JWT_SECRET` / `ADMIN_JWT_SECRET` is unset, a placeholder, or the two are equal (closes the "boots, then admin login returns 500" finding). A regression spec fails the build if code reads a variable absent from `render.yaml` (both services) or `.env.example`. | `render.yaml`, `.env.example`, `validate-runtime-env.ts`, `env-completeness.spec.ts`, `account-deletion-sweep.service.ts`, `admin-users.service.ts` |
| **B-020** verification enforcement | `EmailVerifiedGuard` reads `verificationStatus` fresh from Postgres on every request (token carries only `{sub, role}`); only exactly `verified` passes, a missing row refuses (403, code `email_verification_required`). Applied to `PATCH /users/:id`, the profile-completion write, which is what Create Profile will call. **Which routes are blocked is a judgment call** (#367 says "before Create Profile" without listing routes) - see Section 5. | `auth/guards/email-verified.guard.ts`, `users.controller.ts` |
| **B-021** request summary | `GET /auth/guardian-consent/request-summary`, token in the `X-Consent-Token` header (kept out of URLs and logs), no guard (same trust model as `POST /auth/guardian-consent`), rate limited, `Cache-Control: no-store` on every outcome including rejections. DOB is decrypted server-side for this response only. Invalid, expired and used tokens return an identical rejection. | `guardian-consent-summary.service.ts`, `.controller.ts` |
| **B-022** e2e key isolation | `test/env.ts` pins every external-service credential (Highlightly, Postmark, Stripe, R2/S3, Sentry) to the inert placeholder the app already treats as "not configured", before any spec imports `AppModule`. A real key in a developer's root `.env` can no longer reach an e2e run. The username e2e seeds verified users because of B-020. | `test/env.ts`, `test/key-isolation.e2e-spec.ts` |
| **B-023** country storage | `User.declaredCountry`, `derivedCountry`, `countryDerivationMethod`, `countryDerivedAt`. `Guardian.declaredCountry` is **kept but deprecated** (expand/contract; no longer written). Anonymisation clears all four user fields. | migration below, `schema.prisma` |
| **B-024** GeoLite2 + trust proxy | `GeoIpService` reads a local MaxMind GeoLite2-Country file via the `maxmind` package (exact-pinned 5.0.7). **The IP is used for one in-memory lookup and never stored or logged**; the result type has no field that could carry it. Every failure resolves to "unresolved" and never throws. `TRUST_PROXY_HOPS` configures Express `trust proxy`; unset trusts no proxy (fail-safe). `fetch-geolite2` downloads the database at build time and **always exits 0**. | `src/geoip/`, `src/trust-proxy.ts`, `src/scripts/fetch-geolite2.ts`, `main.ts` |
| **B-025** derived country authoritative | `requiresCardVerification(dob, derivedCountry)` replaces the declared-country key. Under-13 and (US or unresolved) means card verification. A self-declared non-US code can no longer avoid it. | `card-verification-policy.util.ts`, `registration.service.ts` |

## 2. Migration (one)

`20261016120000_add_user_country_fields` - purely additive on `"User"`:

- 4 nullable columns (`declaredCountry`, `derivedCountry`, `countryDerivationMethod`, `countryDerivedAt`).
- Backfill: copies `Guardian.declaredCountry` onto the matching `User` row where it is a valid 2-letter code (guardian rows exist only for minors).
- 3 CHECK constraints: both country codes match `^[A-Z]{2}$`, and the three derivation columns move together (all NULL, or resolved `geolite2_local` with code and time, or `unresolved` with time and no code).
- No drop. `Guardian.declaredCountry` is removed by a later migration, after B-075 ships.

No other schema change. `User` / `Guardian` safeguarding fields are untouched.

## 3. Founder actions (nothing here is blocked in code; each fails safe until done)

1. **MaxMind account + GeoLite2 licence** (free). Set `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY` on both Render services. Until then every country is "unresolved" and **every under-13 gets card verification** (stricter, never looser). Someone must own the licence terms and the refresh process (still open in #368). The download URL and Basic-auth scheme follow MaxMind's documented direct-download link and have **not been run against a real account** - check the first build log for `[geolite2] installed ...`.
2. **`TRUST_PROXY_HOPS`** on Render. Leave unset until checked; the verification procedure is in `docs/deployment.md`. Too low: every user looks like Render's proxy (lookups unresolved). Too high: a visitor can forge their address. Setting it correctly also fixes per-client rate limiting, which currently sees all users behind Render as one address.
3. **`WEB_APP_BASE_URL`** (real https URL of `apps/web`) on both services, or the verification and guardian-consent emails are not sent at all.
4. **Postmark keys** (`EMAIL_PROVIDER_API_KEY`, `POSTMARK_FROM_EMAIL`). Unchanged from before; without them emails are logged, not sent.
5. **Strong `JWT_SECRET` and `ADMIN_JWT_SECRET`**, different from each other. Production now refuses to boot otherwise, so a deploy with placeholders will fail (the previous version keeps serving).
6. Render env for the keys `render.yaml` lists with `sync: false` (Stripe, R2, Highlightly, etc.) as before.

## 4. Deliberately not done

- **B-075** (Guardian Details loses the country select) and any `apps/web` change. `RegisterDto.countryCode` stays optional because the web Age Gate does not send it yet (B-073). **B-075 must not ship before B-073**, since card verification no longer reads `Guardian.declaredCountry`.
- No removal of `Guardian.declaredCountry`.
- The password-reset email still falls back to a placeholder address.

## 5. Judgment calls and open points

- **B-020 route scope**: guard applied to `PATCH /users/:id` only. Not applied to login, reading one's own profile, the guardian status page, or posting (posting stays under `GuardianConsentGuard`), so an unverified user can still sign in and see why they are blocked. Widening is a one-line `@UseGuards`.
- **Token in a header** (`X-Consent-Token`) rather than the path or query for the summary endpoint. The web page must send it as a header; the emailed link still carries `?token=`.
- **Existing rows**: country is NULL for every user registered before this migration except where backfilled from a guardian row. Nothing re-derives it retroactively; the IP is not stored, so it could not be.
- **VPN/Tor** can spoof the derived country; already recorded as a residual risk in #368 and to be listed in the DPIA.
- **Legal copy / DPIA**: processing of IP-derived country is described in legal copy v0.8 as `[PROPOSAL, not yet built]`; counsel wording is still pending (Part C row 38). Nothing here is counsel-approved.
- **A flake class, not a bug**: on this machine the full mocked suite needs `--maxWorkers=4`; with default workers, real-HTTP specs (e.g. `registration.controller.spec.ts`) exceed the 30 s timeout under contention. They pass when run alone.

## 6. Verification

- `npx tsc --noEmit`: clean. `npx eslint src test`: clean.
- Full mocked suite (`npx jest --maxWorkers=4`): **128 suites / 1934 tests, 0 failures**. One existing spec needed updating for this work: `account-deletion-sweep.service.spec.ts` (the anonymisation payload now includes the four country fields). New unit specs: `geoip.service`, `trust-proxy`, `validate-runtime-env`, `env-completeness`, `fetch-geolite2`, `web-app-link.util`, `email-verified.guard`, `guardian-consent-summary` (service + controller), `held-investigation-alert-days`, plus updated registration, registration-email, card-verification-policy and the four users controller HTTP specs (guard overridden, plus one placement test).
- e2e (real Postgres): new `country-derivation`, `consent-summary`, `email-verification`, `email-links`, `key-isolation` specs are written and typecheck/lint clean, plus `username.e2e-spec.ts` (seeds verified users). **NOT RUN.** In this session Docker Desktop's engine would not start (`Docker Desktop is unable to start`; a restart timed out), so no test database existed; port 5432 answered only because Docker Desktop's proxy holds it open. The migration was therefore also not applied to a real database in this session. **Run `npm run test:e2e` in `services/api` before merging**, and treat any failure in those six files as unreviewed.
- `nest build`: clean. `prisma validate`: schema valid. The Prisma drift check (`migrate diff` against a migrated database) was not run, for the same reason as e2e.
