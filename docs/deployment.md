# Deployment setup (Render + Neon + Upstash, all in the EU)

Decision Log #26 (Build Plan Section 9 / CLAUDE.md) resolves Decision Log
#9 (hosting): **Render** runs `services/api`, **Neon** is the managed
Postgres, **Upstash** is the managed Redis — three separate, unbundled
providers rather than one all-in-one platform. Everything is hosted in the
**EU**: Render's Frankfurt region, with Neon and Upstash created in EU regions.
This document is a step-by-step walkthrough for the one-time human setup none
of this repo's code or CI/CD can do on its own: creating real accounts,
obtaining real connection strings, and setting real secret values. Nothing in
this document has been performed for you — every step below is still
outstanding.

You do **not** need any DevOps background to follow this. Take it one
numbered step at a time, in order.

## Before you start

You'll need:
- A GitHub account with access to this repository (to connect Render).
- A way to pay for Render's $7/month "Starter" plan for the production
  service (a card on file) — see "Why Starter, not Free" below. Neon and
  Upstash's free tiers are sufficient for this step.
- A terminal that has `openssl` (to generate secrets).

**Region matters and cannot be fixed later.** `render.yaml` puts both services
in **Frankfurt** (`region: frankfurt`). Render cannot change a service's region
after it is created, so check it on the import screen. Neon and Upstash must
also be created in an **EU region**, in or near the same area as Render's
Frankfurt region. Nothing in this repo can check that for you; pick the region
on each provider's "create" screen.

## 1. Neon (Postgres)

1. Go to https://neon.tech and create an account (GitHub sign-in is the
   fastest option).
2. Create a new **Project**, choosing an **EU region** when asked. Name it
   something recognizable, e.g. `soccernity`.
3. Within that project, Neon gives you a default database and branch
   already. For the staging/production split this repo uses, create a
   second **branch** (Neon's dashboard has a "Branches" tab) named
   `staging`, so staging and production don't share data.
4. For **each** branch (`main`/production and `staging`), open its
   "Connection Details" panel. Neon shows you two connection strings:
   - A **pooled** connection string (it will mention "pooled connection"
     or include `-pooler` in the hostname). This is your `DATABASE_URL`.
   - A **direct**/unpooled connection string (no `-pooler` in the
     hostname). This is your `DIRECT_URL`.
   Copy both, for both branches — four connection strings in total.
5. Keep these values somewhere safe temporarily (a password manager, not
   a text file you'll forget about) — you'll paste them into Render in
   step 4.

## 2. Upstash (Redis)

1. Go to https://upstash.com and create an account.
2. Create a new **Redis database**, choosing an **EU region** close to
   Render's Frankfurt region.
3. Create two databases, one for staging and one for production, so a
   staging bug cannot touch production's refresh-token store.
4. For each database, Upstash shows a connection string starting with
   `rediss://` (double "s" means TLS is built in; nothing else to
   configure). Copy both URLs — these are your two `REDIS_URL` values.

## 3. Generate your secrets

Run this on your own machine, **once for each value you need**:

```
openssl rand -base64 32
```

You need a fresh value for each of `JWT_SECRET`, `ADMIN_JWT_SECRET` and
`DOB_ENCRYPTION_KEY`, separately for staging and for production — six values.
No two may be the same.

- `JWT_SECRET` signs ordinary users' login tokens. `ADMIN_JWT_SECRET` signs
  Admin Console tokens and must be different from it — that separation is what
  stops a user token from ever working as an admin token.
- **`DOB_ENCRYPTION_KEY` encrypts every stored date of birth.** It must decode
  from base64 to **exactly 32 bytes**, which is what the command above
  produces. **Back it up** in your password manager the moment you create it:
  if it is lost or changed, every date of birth already stored becomes
  unreadable and cannot be recovered. Use a different key for staging and
  production. Each deploy runs a one-off script that encrypts any dates of
  birth still stored in plain form; that script refuses to run without a valid
  key, so a missing or malformed key makes the deploy fail *before* the new
  version goes live (intentional, and safe — nothing is changed). The running
  app also checks the key at start-up: in production (`NODE_ENV=production`) it
  **refuses to boot** if `DOB_ENCRYPTION_KEY` is unset, blank, still
  `replace-me`, or does not decode to exactly 32 bytes, and logs a message that
  names the variable (never its value). Before this, a bad key booted and only
  failed on the first sign-up or login that touched a date of birth. The same
  key also encrypts the two-factor secrets (authenticator-app sign-in, B-086), so
  it must not be rotated casually: if it is lost or changed, every stored
  two-factor secret becomes unreadable too, and every enrolled account (users
  and admins) has to be reset and re-enrol. `docs/dob-encryption-rollback.md`
  explains this.
  **Rotating it has a written procedure** (`docs/dob-encryption-rollback.md`,
  "Rotating the key"): two optional settings, `DOB_ENCRYPTION_KEY_VERSION`
  (default 1) and `DOB_ENCRYPTION_KEY_PREVIOUS` (only during a rotation), plus a
  re-encrypt script. Leave both unset until a rotation, and once a rotation has
  happened never lower or remove the version number. Both are in `render.yaml`
  for both services as hand-set (`sync: false`) values.
- **`ADMIN_2FA_ENFORCED` makes two-factor mandatory for admins.** Set it by
  hand in Render's dashboard, separately for staging and production. Only the
  exact text `true` turns it on (`TRUE`, `1` or leaving it empty all leave it
  off, and the API logs a warning at start-up while it is not `true`). It is
  off by default because turning it on before the Admin Console has its
  enrolment screens would lock every admin out; **it must be `true` in
  production at launch** (launch-gate check B-267). If the last superadmin
  ever loses their device and their backup codes, follow
  `docs/admin-two-factor-recovery.md`.
- None of these three has a code default. In production (`NODE_ENV=production`,
  which Render sets) the app now **refuses to start** if `JWT_SECRET` or
  `ADMIN_JWT_SECRET` is unset, still a placeholder such as `replace-me`, or if
  the two are the same value. The deploy then fails and the previous version
  keeps serving, instead of a half-working API (before this check, an unset
  `ADMIN_JWT_SECRET` booted fine and every admin login returned a 500 after the
  password had been checked). The error names the variable, never its value.

## 4. Render (the API host)

1. Go to https://render.com and create an account, then connect your
   GitHub account so Render can access this repository.
2. From Render's dashboard, choose **New > Blueprint**.
3. Point it at this repository. Render will detect `render.yaml` at the
   repo root and show you the two services it defines:
   `soccernity-api-staging` (tracks the `staging` branch) and
   `soccernity-api` (tracks the `main` branch, production). Both should show
   the Frankfurt region.
4. Render prompts for every variable marked `sync: false` in `render.yaml`
   (only at the first import; later edits are made on each service's
   "Environment" tab). For **each** of the two services, set:
   - `DATABASE_URL` / `DIRECT_URL` — the pooled / direct Neon strings for
     that service's branch.
   - `REDIS_URL` — the matching Upstash `rediss://` URL.
   - `JWT_SECRET`, `ADMIN_JWT_SECRET`, `DOB_ENCRYPTION_KEY` — the values from
     step 3.
   - `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_DAYS`,
     `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`,
     `RESET_TOKEN_TTL_MINUTES`, `GUARDIAN_CONSENT_TOKEN_TTL_HOURS` —
     numeric tuning values. The code has its own defaults (900, 30, 5,
     60000, 60, 72), so use those unless you have a reason to change them.
   - `EMAIL_PROVIDER_API_KEY`, `POSTMARK_FROM_EMAIL` — **real values** once you
     have a Postmark account and a verified sending domain (SPF/DKIM). Until
     then use the `.env.example` placeholders; verification, guardian-consent
     and password-reset emails are then logged, not sent, so sign-up cannot
     complete for anyone who needs an email.
   - `WEB_APP_BASE_URL` — the real deployed **https** URL of `apps/web` for
     that environment, no trailing path. Used to build the links in the
     verify-email, guardian-consent and withdrawal emails. If it is unset, a
     placeholder, or plain `http` (outside localhost), those emails are **not
     sent at all** and an error naming `WEB_APP_BASE_URL` is logged: an email
     whose only call to action is a dead link is worse than none. (In
     production an unusable value now stops the API from starting at all.) (The
     password-reset email still falls back to a placeholder address; it is a
     known follow-up.) `WEB_APP_BASE_URL` is also the **CORS allowlist** entry
     for `apps/web`: the API answers cross-origin browser requests only from
     this origin and from `ADMIN_APP_BASE_URL`, never `*`.
   - `ADMIN_APP_BASE_URL` — the real deployed **https** URL of `apps/admin` for
     that environment. Used **only** for the CORS allowlist (QA D-01, Decision
     Log #407). In production each of the two must be a real https URL, not a
     placeholder and not localhost. **A value that is unset, not a URL, a
     placeholder host, `http`, or localhost makes the API refuse to start**
     (`assertProductionEnv`, B-163; Decision Log #408). Outside production
     nothing is checked and localhost origins on any port are allowed.
   - `TRUST_PROXY_HOPS`, `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY`,
     `GEOLITE2_DB_PATH` — country derivation; see "Country derivation
     (GeoLite2)" below. All optional, all fail safe (stronger safeguarding
     control) when unset. Leave `GEOLITE2_DB_PATH` blank.
   - `SPORTS_DATA_API_KEY` — your Highlightly API key. A placeholder until a
     real account exists; Sports Hub then serves only cached data.
   - `SPORTS_DATA_RAPIDAPI_HOST` — leave blank unless the Highlightly account
     is a RapidAPI subscription.
   - `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT` — your
     Cloudflare R2 bucket, API token and
     `https://<account-id>.r2.cloudflarestorage.com` endpoint. Placeholders for
     now. The API **does** read these (Admin Console media upload and the
     profile-picture upload); until they are real, uploads return a clear
     "storage not configured" error (503) and everything else keeps working.
   - `S3_PUBLIC_BASE_URL` — optional; the public address of the bucket (its
     r2.dev subdomain or a custom domain). The R2 endpoint above is not
     publicly readable, so until this is set stored files get a URL nobody can
     open. Leave blank until the bucket has a public address.
   - **Post and contest-entry media** (backend/w14-post-media-pipeline,
     Decision Log #419). Users upload photos and videos straight to the same R2
     bucket through a one-time link. Five things are a human job and are not
     in `render.yaml`: (1) a **CORS rule on the R2 bucket** that allows `PUT`
     from your web app's address (without it every browser upload is blocked);
     (2) **keep the private prefix private** (Decision Log #436, row B-265;
     `services/api/src/modules/post-media/README.md`, "Deployment caveat").
     The API keeps every file that is waiting for a decision, held by reports
     or rejected under the **private prefix** `private-media/` (the name
     deliberately does not start with `post-media`), and copies a file to the
     public prefix `post-media/` only when it is approved. That only works if
     nothing public serves `private-media/`. With Cloudflare R2 the bucket's
     `r2.dev` address or a custom domain serves the *whole bucket* unless a
     rule limits it. So `S3_PUBLIC_BASE_URL` must map **only** `post-media/`
     (a path rule or a Worker), **or** the private files must live in a
     separate bucket. Then prove it: request a `private-media/` object through
     the public address and check you are refused (not served). This has not
     been verified against a real bucket; until it is done, a pending or
     rejected file is fetchable by anyone who holds its URL;
     (3) **ffmpeg and ffprobe on the API host**: Render's native Node runtime
     does not include them, so until they are installed (for example by moving
     the API to a Docker image that has them) every video upload is refused
     with a 503 and stores nothing; photos are unaffected; (4) an **AWS
     account and an IAM user** allowed `rekognition:DetectModerationLabels`,
     whose keys go in `REKOGNITION_ACCESS_KEY_ID` and
     `REKOGNITION_SECRET_ACCESS_KEY` (region `eu-west-1`); until then no
     automatic check runs and every upload waits for a moderator (nothing is
     ever approved automatically); (5) optionally a bucket lifecycle rule that
     expires the `quarantine/` prefix after 1 day, as a backstop to the API's
     own hourly cleanup. The size, length and moderation limits
     (`POST_MEDIA_*`, `MEDIA_CHECK_*`) already carry their defaults in
     `render.yaml`.
   - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` — Stripe **test** keys until
     a real account exists. Placeholders mean the card-check step for
     under-13 US guardians fails closed (that guardian cannot complete
     consent); nothing else is affected.
   - `SENTRY_DSN` — placeholder until a Sentry project exists; error
     monitoring is then simply off.

   Variables that already carry a value in `render.yaml` (for example
   `S3_REGION`, the `SPORTS_*` cache timings, `COPPA_VERIFICATION_AMOUNT_CENTS`,
   `ADMIN_JWT_*_TTL_*`) are set to the code's own defaults; you do not need to
   touch them.
5. Do **not** set `PORT` or `NODE_ENV`. Render supplies `NODE_ENV` itself, and
   setting it by hand would break the build (it would skip the build tools).
6. Click through to finish the Blueprint import. Render runs the build
   (install, generate the Prisma client, build), then the pre-deploy
   command (database migration, then the date-of-birth encryption backfill),
   then starts the service and polls `/health`.

### Staging and the pre-deploy command

Render documents its pre-deploy command as available for **paid** services
only (https://render.com/docs/deploys). Staging is on the Free plan, so its
migration step may not run, which would leave the staging database without
tables. Do not assume it works: after the first staging deploy, check the
deploy log for migration output. If it did not run, tell the engineer; the fix
is to move those two commands to the start of the build command, which works on
every plan. (`render.yaml` is deliberately unchanged on this point until that
is decided.)

### Why Starter, not Free, for production

Render's free tier spins a service down after a period of inactivity,
introducing a real cold-start delay on the next request. For most of this
MVP that's an acceptable tradeoff pre-launch — but the guardian-consent
email flow (Build Plan Section 8.3) is a safety-critical path a parent
needs to complete promptly; a slow first response there is worse than
$7/month. Staging has no such requirement, so it stays on Render's Free
tier in `render.yaml` to control cost.

### Country derivation (GeoLite2) — Decision Log #368

At registration the API derives the person's country from their request IP
using a **local** MaxMind GeoLite2-Country database. The IP is read in memory,
used once and dropped: it is never stored or logged, and no third party sees it.
The derived country decides whether an under-13's guardian must complete card
verification. Three things have to be in place for it to work, and **each fails
safe**: if any is missing, the country is recorded as "unresolved" and the
*stronger* control applies (card verification for every under-13). Nothing
breaks; the platform is simply stricter.

1. **A MaxMind account and the GeoLite2 licence** (founder action). Create a
   free account at https://www.maxmind.com, accept the GeoLite2 End User
   Licence Agreement, and generate a licence key. Someone must own those licence
   terms and the refresh process (still open in Decision Log #368). Set
   `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY` on each Render service.
2. **The database file.** `render.yaml`'s build command ends with
   `node services/api/dist/scripts/fetch-geolite2.js`, which downloads the
   database to `services/api/geoip/GeoLite2-Country.mmdb` using those two
   values. It never fails the build: with no credentials, or if the download
   fails, it logs `[geolite2] skipped/FAILED …` and carries on. The file is
   gitignored (MaxMind's terms don't allow redistributing it). To refresh it,
   redeploy, or run the script again; the API reloads the file when it changes
   on disk. MaxMind updates GeoLite2 on weekdays; a scheduled monthly redeploy
   is the simplest refresh until an owner decides otherwise. **The download URL
   and login scheme are taken from MaxMind's documented direct-download link but
   have not been run against a real account — check the first build log.**
3. **`TRUST_PROXY_HOPS`.** Behind Render's proxy every request's network peer is
   the proxy, so the API must be told how many proxy hops to trust to see the
   real client address. The right number is a property of Render's network and
   **must be checked, not guessed**: too low and every user looks like Render's
   proxy (lookups come out "unresolved"); too high and a visitor can forge their
   own address with an `X-Forwarded-For` header. Leave it **unset** until
   checked. To check: set it to `1`, register a throw-away account from a
   network you know the country of, and look at that row's `derivedCountry`
   (`select "derivedCountry","countryDerivationMethod" from "User" …`). If it is
   your country, keep it; if it is `null`/`unresolved`, try `2`. Setting it also
   fixes per-client rate limiting, which until now saw every user behind Render
   as one address.

How to tell what happened on any account: `User.countryDerivationMethod` is
`geolite2_local` (resolved) or `unresolved`; the boot log says
`GeoLite2 country database not loaded` when the file is missing.

## 5. After the first successful deploy

1. Confirm each service's own URL from Render's dashboard (e.g.
   `https://soccernity-api-staging.onrender.com`,
   `https://soccernity-api.onrender.com` — the exact subdomain Render
   assigns may differ).
2. Visit `<that URL>/health` directly in a browser or via `curl`. You
   should see `{"status":"ok","database":"connected"}`. If you see
   anything else, or a 5xx error, check that step 4's environment
   variables were all filled in correctly, especially `DATABASE_URL`,
   `DIRECT_URL` and `DOB_ENCRYPTION_KEY` — a typo'd value is the most likely
   first failure.
3. In this GitHub repository's settings, add two repository or
   environment secrets: `RENDER_STAGING_URL` and `RENDER_PRODUCTION_URL`,
   set to the two real URLs from item 1 above (no trailing slash). These power
   `.github/workflows/deploy.yml`'s manually-triggered smoke test — after
   confirming a deploy has finished in Render's own dashboard, run that
   workflow from GitHub Actions' "Run workflow" button, choosing
   `staging` or `production`, to confirm the live deployment is actually
   healthy.

## What this repo still can't do for you

- Create the Neon/Upstash/Render accounts themselves, or agree to any of
  their terms of service. The same goes for MaxMind (GeoLite2 licence).
- Generate or store real secret values on your behalf — the three generated
  secrets, every real connection string, and the Postmark / Sentry / R2 /
  Stripe / Highlightly credentials all require a human decision or a
  human-held account.
- Verify a live deployment actually works end-to-end. `render.yaml` has been
  checked as closely as possible without a real Render account — but nobody has
  deployed this yet. The first real deploy, following this document, is the
  actual verification.
