# Onboarding end-to-end QA suite

Browser tests that drive the **real** `apps/web` and `apps/admin` (Vite dev servers) against the **real**
`services/api` (built with `nest build`, run with `node dist/main.js`), a **real** Postgres and a **real** Redis.
No network call is mocked. Report: [`docs/qa-e2e-onboarding-report.md`](../docs/qa-e2e-onboarding-report.md).

This directory is **not** an npm workspace (the root globs are `apps/*`, `services/*`, `packages/*`), so
installing it never touches the root lockfile and it is not part of `npm test` / CI.

## Run it

Prerequisites: Docker Postgres + Redis up (`docker compose up -d`), a root `.env` (for DB/Redis credentials,
`JWT_SECRET`, `ADMIN_JWT_SECRET`, `DOB_ENCRYPTION_KEY`), Google Chrome installed.

```
cd e2e
npm install
npm test                       # everything (~10 min)
npx playwright test 04         # one spec
E2E_KEEP_DB=1 npx playwright test 04   # keep the scratch database between runs
```

`support/global-setup.ts` drops and recreates a scratch database `soccernity_qa` (never your `soccernity` dev
database), runs the repo's migrations on it, seeds the one admin account that cannot self-register, flushes Redis
logical DB 5, builds and starts the API on :3101, a CORS proxy on :3100, `apps/web` on :5273 and `apps/admin`
on :5274. Logs: `e2e/.run/*.log`. Screenshots/traces of failures: `e2e/.run/artifacts`.

## How emails are read

The API runs with no Postmark key, so every email it would send is written to its log with the full template
data (including the link). `support/helpers.ts` parses `e2e/.run/api.log` (`waitForEmail`). This is the real
send path up to the provider call.

## Things the harness changes (and why)

| Change | Why |
|---|---|
| `support/cors-proxy.ts` sits between the browsers and the API | The API's `enableCors()` answers `*`, which browsers reject for `credentials: "include"` - sign-up cannot complete without it (defect D-01). The proxy only rewrites CORS response headers. |
| `AUTH_RATE_LIMIT_MAX=1000` | The default 5 requests/60 s auth throttle is far below what the suite needs. |
| `STRIPE_*=replace-me`, `EMAIL_PROVIDER_API_KEY=replace-me` | Never reach Stripe or Postmark. Under-13 card verification therefore fails closed (503). |
| One test lifts `Guardian.cardVerificationRequired` in SQL | Local runs have no GeoLite2 database, so every under-13 needs the card step (by design). Marked `WORKAROUND` in the spec. |

## Known-defect tests

Tests titled `D-nn: ...` use `test.fail()`: they **pass while the defect exists** and turn red the day it is
fixed - that is the cue to delete the `test.fail()` line (and, for D-01, the CORS proxy).
