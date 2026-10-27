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
logical DB 5, builds and starts the API on :3100, `apps/web` on :5273 and `apps/admin`
on :5274. Logs: `e2e/.run/*.log`. Screenshots/traces of failures: `e2e/.run/artifacts`.

## Driving a live Contest phase (the API test clock)

The Contest follows the Europe/London calendar, so the real clock only ever shows one phase. To see the
others in a real browser, start the suite with `QA_CONTEST_PHASE`; `support/global-setup.ts` then starts the API with
`TEST_CLOCK_ISO` (and `E2E_TEST_CLOCK=1`) set to that phase's instant, and `support/contest-clock.ts`
(`seedContestAtPhase`) seeds a consistent month: a cycle with its four rounds, members, weekly entries, votes and,
for `final_live`, the final entries. The decisions themselves (ranking, vote lock, winners, finalists, reveal) are
made by the real lifecycle service on its one-minute tick, on the test clock; the helper waits for that tick
(under two minutes), then asks the real API which phase it believes it is in.

```
QA_CONTEST_PHASE=week1_phase2 npx playwright test 17     # one phase per run: the API clock is set when the stack starts
QA_CONTEST_PHASE=final_live QA_CONTEST_MONTH=2026-12 npx playwright test 17
QA_TEST_CLOCK_ISO=2026-11-05T10:00:00Z npx playwright test 17   # an explicit instant (add QA_TEST_CLOCK_ADVANCE=1 to let it run on)
```

Phases: `week{1,2,3}_phase1`, `week{1,2,3}_phase2`, `between_weeks_after_week{1,2,3}`, `week4_upload`, `final_live`.
Seeded members log in with `Sup3r-secret-pass` (returned by `seedContestAtPhase`). Without `QA_CONTEST_PHASE` or
`QA_TEST_CLOCK_ISO` the API runs on the real clock and spec 17 skips.

Safety: the clock is read from the environment only; there is no HTTP endpoint that sets it. It is honoured only when
`NODE_ENV=test` or `E2E_TEST_CLOCK=1`, and the API refuses to start when `NODE_ENV=production` and any of
`TEST_CLOCK_ISO`, `TEST_CLOCK_ADVANCE`, `E2E_TEST_CLOCK` is set (`services/api/src/validate-runtime-env.ts`). Never
add them to `render.yaml`. Database defaults (`createdAt DEFAULT now()`) are not on the test clock; the helper
sets explicit timestamps on everything the contest reads.

## How emails are read

The API runs with no Postmark key, so every email it would send is written to its log with the full template
data (including the link). `support/helpers.ts` parses `e2e/.run/api.log` (`waitForEmail`). This is the real
send path up to the provider call.

## Things the harness changes (and why)

| Change | Why |
|---|---|
| `AUTH_RATE_LIMIT_MAX=1000` | The default 5 requests/60 s auth throttle is far below what the suite needs. |
| `STRIPE_*=replace-me`, `EMAIL_PROVIDER_API_KEY=replace-me` | Never reach Stripe or Postmark. Under-13 card verification therefore fails closed (503). |
| One test lifts `Guardian.cardVerificationRequired` in SQL | Local runs have no GeoLite2 database, so every under-13 needs the card step (by design). Marked `WORKAROUND` in the spec. |

## Known-defect tests

Tests titled `D-nn: ...` use `test.fail()`: they **pass while the defect exists** and turn red the day it is
fixed - that is the cue to delete the `test.fail()` line.

Fixed so far (Decision Log #407, backend/w3e): **D-01** (CORS; the CORS proxy is deleted, the browsers talk to the API
directly), **D-02** (age-5 floor) and **D-06** (username CONTAINS match). Their tests stay as ordinary regression tests
without `test.fail()`.
