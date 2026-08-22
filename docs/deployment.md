# Deployment setup (Render + Neon + Upstash)

Decision Log #26 (Build Plan Section 9 / CLAUDE.md) resolves Decision Log
#9 (hosting): **Render** runs `services/api`, **Neon** is the managed
Postgres, **Upstash** is the managed Redis — three separate, unbundled
providers rather than one all-in-one platform. This document is a step-by-
step walkthrough for the one-time human setup none of this repo's code or
CI/CD can do on its own: creating real accounts, obtaining real connection
strings, and setting real secret values. Nothing in this document has been
performed for you — every step below is still outstanding.

You do **not** need any DevOps background to follow this. Take it one
numbered step at a time, in order.

## Before you start

You'll need:
- A GitHub account with access to this repository (to connect Render).
- A way to pay for Render's $7/month "Starter" plan for the production
  service (a card on file) — see "Why Starter, not Free" below. Neon and
  Upstash's free tiers are genuinely permanent and sufficient for this
  step, so no payment is needed for either of those two.

## 1. Neon (Postgres)

1. Go to https://neon.tech and create an account (GitHub sign-in is the
   fastest option).
2. Create a new **Project**. Name it something recognizable, e.g.
   `soccernity`.
3. Within that project, Neon gives you a default database and branch
   already. For the staging/production split this repo uses, create a
   second **branch** (Neon's dashboard has a "Branches" tab) named
   `staging`, so staging and production don't share data — Neon branches
   are cheap, instant copies-on-write, this is the intended use case.
4. For **each** branch (`main`/production and `staging`), open its
   "Connection Details" panel. Neon shows you two connection strings:
   - A **pooled** connection string (it will mention "pooled connection"
     or include `-pooler` in the hostname). This is your `DATABASE_URL`.
   - A **direct**/unpooled connection string (no `-pooler` in the
     hostname). This is your `DIRECT_URL`.
   Copy both, for both branches — you'll need four connection strings
   total (two per branch) by the end of this step.
5. Keep these values somewhere safe temporarily (a password manager, not
   a text file you'll forget about) — you'll paste them into Render in
   step 3.

## 2. Upstash (Redis)

1. Go to https://upstash.com and create an account (GitHub sign-in works
   here too).
2. Create a new **Redis database**. Choose a region close to Render's
   region (this repo's `render.yaml` uses `oregon` — pick an Upstash
   region in or near Oregon/US-West for the lowest latency).
3. Create two databases, one for staging and one for production — same
   reasoning as Neon's branch split: don't let a staging bug affect
   production's real Redis-backed refresh-token store.
4. For each database, Upstash's dashboard shows a connection string
   starting with `rediss://` (note the double "s" — this means TLS is
   already built into the URL, you don't need to configure anything else
   for that; `services/api`'s Redis client was verified to auto-detect
   this from the URL alone). Copy both `rediss://` URLs — these are your
   two `REDIS_URL` values.

## 3. Render (the API host)

1. Go to https://render.com and create an account, then connect your
   GitHub account so Render can access this repository.
2. From Render's dashboard, choose **New > Blueprint**.
3. Point it at this repository. Render will detect `render.yaml` at the
   repo root and show you the two services it defines:
   `soccernity-api-staging` (tracks the `staging` branch) and
   `soccernity-api` (tracks the `main` branch, production).
4. Render will prompt you to fill in every environment variable marked
   `sync: false` in `render.yaml` — it will not let you finish importing
   until you've provided a value for each (or you can skip and fill them
   in afterward from each service's "Environment" tab; either way, they
   must all be set before the service can actually boot correctly). For
   **each** of the two services, set:
   - `DATABASE_URL` — the pooled Neon connection string for that
     service's branch (production service gets the `main` branch's
     value, staging service gets the `staging` branch's value).
   - `DIRECT_URL` — the matching direct/unpooled Neon connection string
     for the same branch.
   - `REDIS_URL` — the matching Upstash `rediss://` URL for that
     environment.
   - `JWT_SECRET` — generate a real, unique value for each environment
     with `openssl rand -base64 32` (run this on your own machine; do
     not reuse the same secret across staging and production, and never
     reuse the placeholder value from `.env.example`).
   - `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_DAYS`,
     `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`,
     `RESET_TOKEN_TTL_MINUTES`, `GUARDIAN_CONSENT_TOKEN_TTL_HOURS` — copy
     the same numeric defaults from `.env.example` unless you have a
     specific reason to change them.
   - `SPORTS_DATA_API_KEY` — leave as a placeholder for now; Decision Log
     #6 (sports-data vendor) is still open as of this writing and only
     blocks Sprint 4, not deployment itself.
   - `EMAIL_PROVIDER_API_KEY`, `POSTMARK_FROM_EMAIL` — you'll need a real
     Postmark account and a verified sending domain (SPF/DKIM) before
     these can be real values; until then, leave the same placeholders
     `.env.example` uses. Guardian-consent and password-reset emails
     silently no-op (logged, not sent) until this is real — see
     `services/api/src/instrument.ts` and the email service files for
     that behavior.
   - `WEB_APP_BASE_URL` — the real deployed URL of `apps/web` for that
     environment, once it has one (used to build links inside outbound
     emails). Leave as `http://localhost:5173` until `apps/web` itself
     has a real deployment target — that's a separate, not-yet-scoped
     piece of work.
   - `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` — leave as placeholders
     until media storage is actually needed; nothing in the current
     codebase reads these yet beyond the placeholder wiring.
   - `SENTRY_DSN` — leave as a placeholder until a real Sentry
     project exists (a separate human sign-up, same category as this
     step). Sentry initialization is a graceful no-op without a real DSN.
5. Do **not** set `PORT` — Render assigns and injects this automatically,
   and `services/api` already reads `process.env.PORT` with a fallback.
6. Click through to finish the Blueprint import. Render will run the
   `buildCommand` (install, generate the Prisma client, build), then the
   `preDeployCommand` (`prisma migrate deploy` against `DIRECT_URL`), then
   start the service and begin polling `healthCheckPath` (`/health`)
   until it responds successfully.

### Why Starter, not Free, for production

Render's free tier spins a service down after a period of inactivity,
introducing a real cold-start delay on the next request. For most of this
MVP that's an acceptable tradeoff pre-launch — but the guardian-consent
email flow (Build Plan Section 8.3) is a safety-critical path a parent
needs to complete promptly; a slow first response there is worse than
$7/month. Staging has no such requirement, so it stays on Render's Free
tier in `render.yaml` to control cost.

## 4. After the first successful deploy

1. Confirm each service's own URL from Render's dashboard (e.g.
   `https://soccernity-api-staging.onrender.com`,
   `https://soccernity-api.onrender.com` — the exact subdomain Render
   assigns may differ).
2. Visit `<that URL>/health` directly in a browser or via `curl`. You
   should see `{"status":"ok","database":"connected"}`. If you see
   anything else, or a 5xx error, check that step 3's environment
   variables were all filled in correctly, especially `DATABASE_URL` and
   `DIRECT_URL` — a typo'd connection string is the most likely first
   failure.
3. In this GitHub repository's settings, add two repository or
   environment secrets: `RENDER_STAGING_URL` and `RENDER_PRODUCTION_URL`,
   set to the two real URLs from step 1 (no trailing slash). These power
   `.github/workflows/deploy.yml`'s manually-triggered smoke test — after
   confirming a deploy has finished in Render's own dashboard, run that
   workflow from GitHub Actions' "Run workflow" button, choosing
   `staging` or `production`, to confirm the live deployment is actually
   healthy.

## What this repo still can't do for you

- Create the Neon/Upstash/Render accounts themselves, or agree to any of
  their terms of service.
- Generate or store real secret values on your behalf — `JWT_SECRET`,
  every real connection string, and the Postmark/Sentry/S3 credentials
  all require a human decision or a human-held account.
- Verify a live deployment actually works end-to-end. Everything in this
  repository (`render.yaml`, the updated `.env.example`, the Prisma
  schema's `directUrl` split) has been validated as closely as possible
  without a real Render account — but nobody has deployed this yet. The
  first real deploy, following this document, is the actual verification.
