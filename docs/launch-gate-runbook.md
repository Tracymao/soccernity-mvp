# Soccernity launch-gate runbook

**Status:** DRAFT v0.1, written 2026-11-14 for build-register row **B-180** (and the launch gate **B-090**). It decides nothing. It records what the repository says, in order, so one person can follow it. Where the repository does not say, the step says **UNKNOWN** or **NOT DECIDED** and names the founder question.

**Who this is for:** the founder, who is not an engineer. Every step says WHO does it. If a step says AGENT, that is a Claude Code session or an engineer; if it says COUNSEL, it is a lawyer's answer you must have in writing before you go on.

**What this replaces:** `docs/deployment.md` is the older, shorter guide. This runbook supersedes it for the launch. `docs/deployment.md` is NOT edited by this PR (another PR owns that file); where it is out of date this runbook says so and the list is in `docs/launch-gate-runbook-report.md`.

**The platform is not live.** No Render, Neon, Upstash, Cloudflare, Postmark, Stripe, MaxMind, Sentry, AWS or Highlightly account exists yet (register B-088, B-090). Nothing in this runbook has been run against a real account. Every command that is shown was read in a file in this repository, and the file is named next to it. Vendor screens change; this runbook never describes a vendor's menu. Wherever a step needs a vendor screen, follow the vendor's own current documentation on the day.

---

## How to read a step

Each step has:

- **WHO** - FOUNDER, AGENT, QA, or COUNSEL.
- **DO** - what to do.
- **YOU SHOULD SEE** - what tells you it worked.
- **IF NOT** - what to do if it did not.
- **ROW / SOURCE** - the register row (`docs/build-register.md`) or the file the step comes from.

A step marked **GATE** must be finished before the next part starts. A step marked **UNKNOWN** or **NOT DECIDED** cannot be done until a founder question (listed at the end) is answered.

## Words used (glossary)

- **Staging** - the practice copy of the site. **Production** - the real site. They have separate databases, separate keys and separate web addresses. Never reuse a secret between them.
- **API** - the server behind the sites (`services/api`). **Web** - the public site (`apps/web`). **Admin** - the staff console (`apps/admin`).
- **Blueprint** - the file `render.yaml`. Importing it into Render creates the six Render services at once.
- **Secret / key** - a value that must never be written into the repository or shared in a chat. Keep them in a password manager.
- **`sync: false`** - in `render.yaml` this means "Render asks you for the value; the file does not contain it". There are 37 of these per API service.
- **Migration** - a change to the shape of the database. They are applied automatically on every deploy (step 5.1).
- **Tagged string** - a sentence in the app that still carries the text `[COPY PENDING LEGAL REVIEW]`. Counsel has not cleared it. There are 246 today.
- **Two-factor (2FA)** - a six-digit code from an authenticator app.
- **Proxy (Cloudflare)** - a service that sits in front of the sites. Optional; NOT DECIDED (step 8.1).

---

## Part 0 - Order of the whole launch, and what can run in parallel

1. Part 1: open the accounts. Part 2: domains. (Founder; can start today.)
2. Part 3: generate and store the secrets. (Founder; do before Part 4, because Render asks for them.)
3. Part 4: create the services in Render. Part 5: database and migrations. (Founder + agent.)
4. Part 6: checks on staging. Part 7: counsel gates. Part 8: Cloudflare (if chosen), R2, push, switches. These can run in parallel once staging is up.
5. Part 9: go live. Part 10: smoke tests. Part 11: rollback (read it BEFORE Part 9). Part 12: after launch.

**Two hard blockers to know now, before you spend money:**

- **The production web and admin sites cannot be built while any tagged string remains.** Their build command runs the pending-copy check, which fails today with 246 places (web 145, admin 101). Counsel has to clear them (Part 7). Staging builds do not run that check. (`render.yaml`, `docs/infra-static-site-hosting-report.md`, `docs/qa-launch-gate-full-run-report.md`)
- **User uploads (pictures and video) stay OFF in production until counsel gives a written answer on B-206**, and the founder then sets `MEDIA_UPLOADS_ENABLED` to `true` (step 8.9). While it is off, Contest entries cannot be made, because a final entry needs a video. (`.env.example`, Decision Log #501, B-306, B-267 (l))

---

## Part 1 - Accounts (FOUNDER)

Do these first; most take time (billing, domain checks). For each, follow the vendor's current instructions. Save every login and key in the password manager as you go.

**1.1 Render.** WHO: FOUNDER. DO: create an account and add billing. Decide the plan for each service (staging API is declared `plan: free`, production API `plan: starter`; static sites declare no plan). YOU SHOULD SEE: you can log in. IF NOT: UNKNOWN (vendor). ROW/SOURCE: B-088, B-179, Decision Log #26; `render.yaml`. NOTE: Render's documentation says `preDeployCommand` is paid-only, so the migrations may not run on the free staging plan. See step 5.2. Region is fixed at creation (Frankfurt) and cannot be changed later (`docs/deployment.md`).

**1.2 Neon (database).** WHO: FOUNDER. DO: create a project in an EU region, with one database (or branch) for staging and a separate one for production. For each you need TWO connection strings: the pooled one (goes in `DATABASE_URL`) and the unpooled/direct one (goes in `DIRECT_URL`). YOU SHOULD SEE: two strings per environment. IF NOT: UNKNOWN (vendor). ROW/SOURCE: B-088, Decision Log #26, #391; `.env.example` lines 3 to 16.

**1.3 Upstash (Redis).** WHO: FOUNDER. DO: create one Redis database per environment in an EU region. You need the `rediss://` URL (with the double s). Launch on the existing free plan was decided (Decision Log #439); check the plan's current quotas and price yourself (step 6.8). YOU SHOULD SEE: a `rediss://...` URL. ROW/SOURCE: B-088, B-267 (d), Decision Log #439; `.env.example`. KNOWN RISK (read from the code): sign-in, token refresh, registration and password reset all store tokens in Redis with no fallback, so a Redis outage blocks them until it returns. The rate limiters fail open or fall back to memory.

**1.4 Cloudflare account and R2 bucket (media storage).** WHO: FOUNDER. DO: create the account and an R2 bucket. Create an API token and keep its access key id and secret. Note your account id: the bucket's S3 address has the form `https://<account-id>.r2.cloudflarestorage.com` (`.env.example`). The token must be allowed to READ, WRITE and LIST objects (listing is needed by the nightly stray-file sweep, B-283). YOU SHOULD SEE: bucket name, endpoint, access key id, secret. ROW/SOURCE: B-207, B-265, B-283; `.env.example` lines 305 to 330. UNKNOWN: the exact token permission names in Cloudflare's screen (B-207 records only that "Object Read & Write" is believed to include listing; not checked against Cloudflare's documentation).

**1.5 Postmark (email).** WHO: FOUNDER. DO: create an account, add billing, and verify a sending domain (SPF and DKIM DNS records that Postmark gives you; these go in Part 2). Choose the "from" address on that domain. YOU SHOULD SEE: a server token and a verified sender. ROW/SOURCE: Decision Log #17; `.env.example` lines 207 to 217. The placeholder `POSTMARK_FROM_EMAIL` must be replaced by a real address on the verified domain, "not left as-is alongside a real API key" (`.env.example`).

**1.6 Stripe.** WHO: FOUNDER. DO: create an account. Use TEST keys until the founder decides otherwise (QUESTION F8). YOU SHOULD SEE: a secret key and a publishable key. ROW/SOURCE: B-162, B-088; `.env.example` lines 397 to 402. This is only for the card step on guardian consent for under-13 US children. The code reads no Stripe webhook (searched `services/api/src`), so no webhook has to be set up. The charge is 50 cents by default and refunded at once (`COPPA_VERIFICATION_AMOUNT_CENTS`).

**1.7 MaxMind (country from IP).** WHO: FOUNDER. DO: create a MaxMind account and a GeoLite2 licence. You need the account id and the licence key. ROW/SOURCE: B-024, B-020; `.env.example`; `services/api/src/scripts/fetch-geolite2.ts`. UNKNOWN: the download address the build uses has never been run against a real account (register B-024).

**1.8 Sentry.** WHO: FOUNDER. DO: create an account and a project for the API; copy its DSN. YOU SHOULD SEE: a `https://...@...sentry.io/...` DSN. ROW/SOURCE: B-267 (c); `.env.example` lines 416 to 420. Until a real DSN exists, Sentry does nothing (so every "alert goes to Sentry" statement in the register is not yet true). Alert rules are step 6.7.

**1.9 AWS (image and video check, Rekognition).** WHO: FOUNDER. DO: create an AWS account and an IAM user allowed `rekognition:DetectModerationLabels`, in an EU region (the code uses `eu-west-1` by default, `REKOGNITION_REGION`). **BEFORE you create or paste any key, set the AWS opt-out of AI-services data use** (register B-193; the exact setting name and screen: UNKNOWN, follow AWS's documentation). YOU SHOULD SEE: an access key id and secret. ROW/SOURCE: B-193, B-036, Decision Log #430; `.env.example` lines 353 to 360. With no AWS keys nothing is ever approved automatically; every upload would wait for a moderator.

**1.10 Highlightly (sports data).** WHO: FOUNDER. DO: create an account and copy the API key. Staying on the free plan (100 requests a day) was decided for now (Decision Log #323; `HIGHLIGHTLY_DAILY_REQUEST_BUDGET` is 100). YOU SHOULD SEE: a key. ROW/SOURCE: B-090; `.env.example` lines 155 to 172. Leave `SPORTS_DATA_RAPIDAPI_HOST` empty for a direct Highlightly account. No live data has ever flowed from Highlightly to this app (no account existed), and whether the header the code sends is accepted by the direct host is checked in step 6.9 (Decision Log #328; the QA verification of 2026-09 confirmed `x-rapidapi-key` alone returns 200 on the direct host).

**1.11 GoDaddy (domain `soccernity.com`).** WHO: FOUNDER. DO: confirm you can edit DNS records for `soccernity.com`. ROW/SOURCE: B-249, Decision Log #437.

**1.12 GitHub repository settings.** WHO: FOUNDER. DO: see step 12.3 (done after launch decisions). ROW/SOURCE: B-267 (g).

---

## Part 2 - Domains and DNS (FOUNDER, with AGENT)

**Names (Decision Log #437; `render.yaml`):**

| | Staging | Production |
|---|---|---|
| Web | `staging.soccernity.com` | `soccernity.com` (and `www`) |
| Admin | `admin.staging.soccernity.com` | `admin.soccernity.com` |
| API | `api.staging.soccernity.com` | `api.soccernity.com` |

All six are under one registered domain on purpose: the sign-in cookie is host-only and `SameSite=Strict`, so the web, admin and API addresses must be on the same site (Decision Log #422, #437).

**2.1 Add the custom domains in Render.** WHO: FOUNDER. DO: after the services exist (Part 4), add each name above to its Render service, following Render's current documentation. `render.yaml` contains no `domains:` entries. YOU SHOULD SEE: Render shows the DNS record it wants for each name. IF NOT: UNKNOWN (vendor). ROW/SOURCE: B-249, B-179, Decision Log #437. The record types and target values are UNKNOWN until Render shows them.

**2.2 Create the DNS records in GoDaddy.** WHO: FOUNDER. DO: add exactly the records Render and Postmark give you. YOU SHOULD SEE: Render marks each domain verified and issues a certificate; the address opens over https. IF NOT: wait, then recheck; do not change other records.

**2.3 Keep the records "DNS only" (not proxied).** WHO: FOUNDER. If you later add Cloudflare in front, the records stay un-proxied until step 8.1 says otherwise (Decision Log #437, #449).

**2.4 `www` redirect.** WHO: FOUNDER. UNKNOWN: whether `www.soccernity.com` should redirect to the root, and how (QUESTION F17). Not in `render.yaml`.

**2.5 Check the cookie works across the real names.** Done in step 6.5 (B-267 (a)). Staging cannot work on Render's default `onrender.com` addresses, because they are different sites and the host-only cookie would not be sent (Decision Log #437, B-249).

---

## Part 3 - Secrets and keys (FOUNDER, with AGENT for commands)

Do this part before Part 4, because Render asks for these values when you import the Blueprint. (This runbook puts secrets before services on purpose; the brief's usual order is services first.)

**3.1 A place to keep them.** WHO: FOUNDER. DO: create one password-manager folder per environment ("Soccernity staging", "Soccernity production"). Every secret below goes in it **the moment it is created**.

**3.2 Generate six random secrets.** WHO: FOUNDER (or AGENT). DO: run this once per value, on a terminal that has `openssl` (`docs/deployment.md`, `.env.example`):

```
openssl rand -base64 32
```

You need SIX different outputs: `JWT_SECRET`, `ADMIN_JWT_SECRET` and `DOB_ENCRYPTION_KEY` for staging, and again for production. All six must be different (the API refuses to start if the two JWT secrets are equal, or if one still reads `replace-me`). YOU SHOULD SEE: a 44-character line ending in `=`. ROW/SOURCE: B-018, B-163, B-252; `.env.example`; `validate-runtime-env.ts`.

**3.3 The date-of-birth key is special. Back it up now.** The same `DOB_ENCRYPTION_KEY` encrypts every date of birth AND every authenticator (2FA) secret, for users and admins. If it is lost or replaced by another value, all of those become unreadable, and the recovery is resetting and re-enrolling every enrolled account (`docs/dob-encryption-rollback.md`). It must base64-decode to exactly 32 bytes or the API will not start in production. ROW/SOURCE: B-252, B-272.

**3.4 Generate the web-push key pair.** WHO: FOUNDER (or AGENT). DO: `npx web-push generate-vapid-keys` (the command named in the `render.yaml` comments). It prints a public and a private key; `VAPID_SUBJECT` is a value starting `mailto:` or `https://` (the natural value is `mailto:support@soccernity.com`, `.env.example`). Make one pair per environment. ROW/SOURCE: B-285, B-062.

**3.5 Collect the rest** (from Part 1): the database and Redis URLs, the Postmark token and sender, the R2 values, the Stripe test keys, MaxMind id and key, the Sentry DSN, the AWS keys, the Highlightly key. The table in Appendix A lists every `sync: false` value, what it is, where it comes from, and which service takes it.

**3.6 Never set these.** `NODE_ENV` and `PORT` (Render sets them; setting `NODE_ENV` at build time breaks the build). `TEST_CLOCK_ISO`, `TEST_CLOCK_ADVANCE`, `E2E_TEST_CLOCK`, `ADMIN_LOGIN_RATE_LIMIT_MAX` are quality-assurance-only: the API refuses to start in production if any is set (`.env.example`, `validate-runtime-env`, Decision Log #509). `GEOLITE2_DB_PATH` is left blank.

**GATE:** all six secrets and the back-up of both DOB keys are in the password manager.

---

## Part 4 - Services in Render (FOUNDER, with AGENT)

**4.1 Import the Blueprint.** WHO: FOUNDER. DO: in Render, create a Blueprint from this repository's `render.yaml`, following Render's current documentation. It defines six services (`render.yaml`, `docs/infra-static-site-hosting-report.md`):

- `soccernity-api-staging` (branch `staging`, plan `free`) and `soccernity-api` (branch `main`, plan `starter`), region Frankfurt.
- Static sites `soccernity-web-staging` and `soccernity-admin-staging` (branch `staging`), `soccernity-web` and `soccernity-admin` (branch `main`).

YOU SHOULD SEE: six services created and a prompt for each `sync: false` value of the two API services. IF NOT: UNKNOWN. **The Blueprint has never been imported, and `render.yaml` has never been validated by Render** (no account). Unverified, from the hosting report: that Render accepts the file; that several header rules per path all apply; that Render adds no second HSTS header; that `/sw.js` is served as JavaScript; that `VITE_API_BASE_URL` reaches the static build; that a root `npm install` (which installs every workspace including `apps/mobile`) fits the static build; the Node version (the root requires `>=22.22.0` with no upper limit, and nothing pins it). If any fails, STOP and tell an agent; do not edit around it.

**4.2 Fill the `sync: false` values.** WHO: FOUNDER. DO: enter every value of Appendix A for each API service (staging values on staging, production values on production). YOU SHOULD SEE: both API services list all 37 keys with values. Plain-value variables (83 of them) already carry their defaults in the file; leave them unless a step says otherwise.

**4.3 Check the two web addresses on the API.** `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` are plain values in `render.yaml` (staging `https://staging.soccernity.com` and `https://admin.staging.soccernity.com`; production `https://soccernity.com` and `https://admin.soccernity.com`). In production the API refuses to start if either is missing, http, localhost or a placeholder. ROW/SOURCE: B-163. Note: `docs/deployment.md` still says these two are asked for at import; they are not (it carries an update note, see the report).

**4.4 Staging first.** WHO: FOUNDER. DO: let the staging services deploy first. Do not deploy production until Parts 5 to 7 pass on staging.

**GATE:** the staging API shows live in Render.

---

## Part 5 - Database, migrations, and the key backfill

**5.1 What happens at every API deploy** (read from `render.yaml`):

- Build: `npm install && npm run prisma:generate && npm run build --workspace=services/api && node services/api/dist/scripts/fetch-geolite2.js`. The last step downloads the country database; it never fails the build, and if it cannot, country comes back "unresolved" and the stronger safeguarding control is applied.
- Before the new version takes traffic (`preDeployCommand`): `npx prisma migrate deploy --schema=services/api/prisma/schema.prisma && node services/api/dist/scripts/backfill-dob-encryption.js`. The first applies every database migration not yet applied, using the direct connection (`DIRECT_URL`). The second encrypts any date of birth still in plain text, and leaves already-encrypted values alone.
- Start: `npm run start:prod --workspace=services/api`. Health: Render checks `/health`.

On a brand-new empty database, every migration is applied from the first one. The backfill then finds no rows. ROW/SOURCE: B-018, B-252, B-272.

**5.2 Check that the migrations really ran on staging.** WHO: FOUNDER (read), AGENT (fix). DO: after the first staging deploy, open its deploy log in Render and look for the migration lines and a line starting `DOB encryption backfill: scanned=`. YOU SHOULD SEE: both. IF NOT: **the free plan may skip `preDeployCommand`** (`render.yaml` header; Render's documentation). The documented fix is to move the two commands into the build command; `render.yaml` was deliberately left unchanged. NOT DECIDED (QUESTION F2): ask an agent to make that change for staging, or upgrade the staging plan. Do not guess.

**5.3 Health on staging.** DO: open `https://api.staging.soccernity.com/health` (after DNS) or the Render address. YOU SHOULD SEE: `{"status":"ok","database":"connected"}`. IF NOT: read the deploy log; the usual cause is a wrong `DATABASE_URL`. SOURCE: `.github/workflows/deploy.yml`.

**5.4 Production database.** After staging passes, the same happens on production on the first production deploy (step 9.3). Take a Neon backup or restore point first (`docs/dob-encryption-rollback.md` step 0; the screen name: UNKNOWN, follow Neon's documentation). Production migrations start from an empty database, so the "back up first" step protects only later deploys.

**5.5 First superadmin.** WHO: FOUNDER with AGENT. There is **no self-registration and no seed script** for admins; the first admin is created by writing a row directly into the database (`services/api/src/modules/admin/README.md`, Decision Log #191; the test helper `seedAdmin()` in `test/admin-auth-isolation.e2e-spec.ts` shows the fields: email, `passwordHash`, `fullName`, `role` = `superadmin`, `accountStatus` = `active`). The password must be stored as an **argon2 hash**. **UNKNOWN / NOT DECIDED (QUESTION F3): the repository contains no command that makes that hash for a real password, and none was invented here.** An agent must provide one. After that first superadmin exists, create every further admin from the Admin Console (superadmin only: `POST /admin/staff`, Decision Log #191, B-264), which returns a one-time password shown once. ROW/SOURCE: B-267, B-090.

**GATE:** staging health is green, the migration lines are in the log (or the fix is done), and the first staging superadmin exists.

---

## Part 6 - Checks on staging (before any switch)

**6.1 Rehearse a DOB-key rotation on staging.** WHO: AGENT with FOUNDER. ROW: B-267 (k), B-272. Follow `docs/dob-encryption-rollback.md`, section "Rotating the key", exactly. Commands (all from that file):

1. Back up (Neon restore point) and note the current key.
2. `openssl rand -base64 32` for the new key; save it next to the old one.
3. In one save in Render, set `DOB_ENCRYPTION_KEY_PREVIOUS` = the old key, `DOB_ENCRYPTION_KEY` = the new key, `DOB_ENCRYPTION_KEY_VERSION` = `2`; deploy once.
4. On the founder's machine: `npm install`, `npm run build --workspace=services/api`, set `DATABASE_URL`, `DOB_ENCRYPTION_KEY`, `DOB_ENCRYPTION_KEY_VERSION`, `DOB_ENCRYPTION_KEY_PREVIOUS` in the same terminal, then
   `node services/api/dist/scripts/rotate-dob-encryption-key.js --dry-run`
   and then the same command without `--dry-run`. (Render's Shell tab can run the same commands on a paid service.)
5. YOU SHOULD SEE the last line `OK: every value is at the current key version and readable.` and exit code 0. The dry run must show `unrecognised=0 no-key-for-version=0 cannot-decrypt=0` or it will refuse to write.
6. Remove `DOB_ENCRYPTION_KEY_PREVIOUS` and redeploy. Never lower or delete the version number. Keep the old key as long as any pre-rotation backup exists.

There is no undo command; undo is another rotation. **Not run against a real Render or Neon account; this rehearsal is the first run.** After the rehearsal, production starts at version 1 with a fresh key (no rotation needed at launch).

**6.2 Admin two-factor on staging (and the recovery rehearsal).** WHO: FOUNDER. DO: set `ADMIN_2FA_ENFORCED` to exactly `true` on staging (any other value is off; unset logs a warning at start). Sign in as the staging superadmin: the next sign-in shows the enrolment screen, then 10 backup codes shown once. Save them in the password manager. ROW: B-270, B-271, B-267 (j). Then read `docs/admin-two-factor-recovery.md`. It is the way out if the ONLY superadmin loses both the phone and the backup codes: in the Neon SQL editor, check it says the right environment, run the read-only check (Step 0), then the one transaction between `-- RECOVERY-SQL-BEGIN` and `-- RECOVERY-SQL-END` with the email replaced in three places, then the verify queries (Step 2). Optional Step 3 deletes the admin's Redis sessions in the Upstash data browser. **The SQL is proven by an automated test but has never run on a real Neon database; rehearse the read-only Step 0 on staging.**

**6.3 `TRUST_PROXY_HOPS` and the two-network sign-in check.** WHO: FOUNDER with AGENT. ROW: B-267 (b), B-256, B-022. This number is how many proxies sit in front of the API; get it wrong and every child looks like the same person. DO: set `TRUST_PROXY_HOPS` to 1 on staging (the starting guess; verify, do not trust it). Then: from **network A** (for example your home connection), fail one test account's sign-in five times; the sixth attempt should be blocked. Then from **network B** (for example a phone on mobile data), one sign-in attempt on a different test account must succeed. Use an email address you can read (a lockout email is sent). IF the second network is also blocked, the hop count is wrong (the API sees the proxy's address). Try 2. Repeat the whole check if Cloudflare is added later (step 8.1). Also (country check): register a throw-away account, read `User.derivedCountry` and `countryDerivationMethod` in the database; if it is "unresolved", try the other hop count. (`.env.example` lines 231 to 238; register B-267 (b).)

**6.4 Country database.** WHO: AGENT. DO: confirm the staging build log shows the country database downloaded (needs `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY`). IF NOT: the app still works but treats every country as unresolved and applies the stronger control. ROW: B-024, B-025.

**6.5 Cookie sign-in on the real names.** WHO: QA/AGENT with FOUNDER. ROW: B-267 (a), B-248, B-246, B-247, B-249. On staging's real domains: sign in on the web and the admin site, reload (still signed in), sign out (really signed out), and let an access token expire (about 15 minutes) to confirm silent refresh works (B-267 (i)). Open two tabs at the same moment after expiry and confirm neither is signed out (B-267 (h)). Also run the full Playwright suite on a same-site setup (step 6.10). Until this passes, cookie sign-in is verified only on localhost.

**6.6 Sentry alert rules.** WHO: FOUNDER. ROW: B-267 (c), B-262, B-263. After a real `SENTRY_DSN` is set (staging value first), create an alert rule on the tag `rate_limiter` (values `global` and `auth`) and one on `session_revocation`. First check which alert types your Sentry plan allows (UNKNOWN). YOU SHOULD SEE: a rule listed; trigger one on staging to prove it reaches you. These tags are only reported once a real DSN exists.

**6.7 Upstash plan.** WHO: FOUNDER. ROW: B-267 (d), Decision Log #439. Check the current quotas and price of the plan in your Upstash account against your expected traffic; the register recorded the Prod Pack at 200 dollars per month per database and declined it for launch (the figures are the founder's, not re-fetched). UNKNOWN: what happens at the free plan's limits (QUESTION F13).

**6.8 R2 bucket: CORS and the private-prefix check.** WHO: FOUNDER with AGENT. ROW: B-265, B-207. DO:

1. Set the bucket's CORS rule to allow `PUT` from the web origins (`https://staging.soccernity.com`, then production), so browsers can upload to the one-time links. The screen: UNKNOWN (Cloudflare documentation). This is a human step (`docs/deployment.md`).
2. Choose how files are served publicly. `S3_PUBLIC_BASE_URL` must be an address that serves ONLY the folders `post-media/` and `profile-media/`, **never** `private-media/` or `private-profile/` (or use a separate bucket for the private folders). On R2 the `r2.dev` address or a custom domain serves the whole bucket unless a path rule or Worker limits it (`modules/post-media/README.md`). NOT DECIDED: r2.dev or a custom domain, and the exact host (QUESTION F10).
3. **Prove it:** ask for an object that lives under `private-media/` through the public address; it must be REFUSED. YOU SHOULD SEE a refusal (a 403 or 404 page, not the file). IF NOT: stop; do not turn uploads on.
4. Optional: a bucket lifecycle rule on `quarantine/` of one day (a safety net; the app also purges it).
5. After the exact R2 host is known, tighten the two wildcards in the static sites' CSP in `render.yaml` (`https://*.r2.dev`, `https://*.r2.cloudflarestorage.com`) to exact hosts, and add a custom public domain if used (AGENT; `docs/infra-static-site-hosting-report.md`).

**6.9 Sports data live check.** WHO: AGENT. ROW: Decision Log #328, #323, B-090. With a real `SPORTS_DATA_API_KEY` on staging, request the live scores and one match page and confirm real data (not just an empty page). Until this is done no real Highlightly data has ever flowed through the app.

**6.10 The full Playwright run (and what clean looks like).** WHO: QA. ROW: B-134, B-219, B-267 (e), B-273. The suite is in `e2e/`, is not in CI, and drives real Chrome against the real API, Postgres and Redis. Source: `e2e/README.md`.

- Setup: `cd e2e && npm install`. If you installed with `npm ci --ignore-scripts`, also run `node node_modules/ffmpeg-static/install.js`. Docker Postgres and Redis must be running (`docker compose up -d`), a root `.env` copied, Chrome installed. Global setup runs `prisma generate` itself.
- Run: `npm test` in `e2e/` (one worker; about 40 minutes on the founder's Windows machine). **Do not run two at once**: they share fixed ports (API 3100, web 5273, admin 5274, fake object store 3191, fake Rekognition 3192) and one scratch database `soccernity_qa` that each run drops and recreates, and they use Redis database 5.
- The run rewrites about 290 tracked screenshots under `docs/`. Restore them with `git checkout -- docs/`.
- **Clean looks like:** 0 failed; the only skips are by design: spec 15 (one fresh-API test), spec 16 (8 tests, only run from day 25 of a month; or run it with `QA_TEST_CLOCK_ISO=2026-11-26T10:00:00Z QA_TEST_CLOCK_ADVANCE=1 npx playwright test 16-fc8-final-week` alone), spec 17 (2 single-phase tests), spec 24 (1 test that needs 2FA enforcement). The latest recorded whole runs: 534 passed, 1 failed (a spec defect in 37-b058, since repaired), 12 skipped by design (PR #774). The register's "180 tests" (B-219) is out of date.
- **The run must also exercise `POST /admin/media/upload`** (the staff upload): no Playwright spec covers it today (B-267 (e)); QA writes or runs one before launch.
- A same-site run on the real domains (B-267 (a)) is separate from the local run and is not yet written down as a procedure: UNKNOWN (QUESTION F19).

**6.11 Launch checks not yet recorded.** WHO: QA. ROW: B-221, B-106, B-055. (a) B-221: the guardian withdrawal page check. The pass condition is met in code but **no run is recorded**, so it is not recorded as passed; run it and write the result down. (b) B-106 and B-055: one QA pass of the six frames that were never inspected: `5802:9183`, `5815:8948`, `5542:7344`, `5542:7695`, `5803:8917`, `2896:4837` (Figma node ids). Decided (Decision Log #462) to be done once, at the launch gate.

**6.12 Under-13 approval end to end.** WHO: QA. ROW: B-162. With a Stripe TEST key and the country database on staging, register a child under 13 declaring the US, and take the guardian through the card step to approval. The code is built; this has not been run end to end against Stripe.

**6.13 Smoke test workflow.** See Part 10.

**GATE:** 6.1 to 6.12 all pass on staging.

---

## Part 7 - Counsel and legal gates (COUNSEL, FOUNDER)

None of these is decided by this runbook. They are the things that need a person who is not an engineer.

**7.1 Clear the 246 tagged strings.** WHO: COUNSEL, then AGENT. ROW: B-124, B-208, B-089, B-301. Counsel reads the strings listed in `docs/pending-copy-manifest.md` (web 145, admin 101). For each cleared string an agent removes the tag from the source and deletes its manifest row. **Strings are cleared by removing the tag, never by allow-listing:** the allow-list file `scripts/pending-copy/dist-allowlist.json` must stay `[]`. Check with `npm run check:pending-copy` (it builds the apps first). YOU SHOULD SEE: it passes (today it fails by design). The production web and admin builds run this same check, so production cannot deploy until it passes.

**7.2 Legal copy.** WHO: COUNSEL. ROW: B-089, B-159. The live Terms and Privacy pages render `docs/legal-copy-draft-tos-privacy-policy.md`. It is a draft, still not approved, with `[PROPOSAL]` markers and an unfilled company name, address and effective date (Decision Log #203 stays open for the prose). Counsel review the current version; the founder fills the company details. Do not publish while the NOT APPROVED banner remains.

**7.3 DPIA and drafts.** WHO: COUNSEL. ROW: B-159, B-236, B-241. Counsel review `docs/sprint-1-dpia-outline-draft.md`, the post-media and contest-view-data addenda (`docs/dpia-addendum-post-media-draft.md`, `docs/dpia-addendum-contest-view-data-draft.md`), and the matching legal-copy drafts (`docs/legal-copy-part-c-post-media-draft.md`, `docs/legal-copy-part-c-view-data-draft.md`). All are drafts; the DPIA sign-off block is empty.

**7.4 Guardian withdrawal wording.** WHO: COUNSEL. ROW: B-200. One inconsistency for counsel: the frames, the code email and the legal draft disagree on whether withdrawal means "deleted after 30 days", "permanently deleted" or "anonymised with a consent record kept 6 months".

**7.5 CSAM and statutory reporting (B-206).** WHO: COUNSEL. ROW: B-206, B-306, B-267 (l). OPEN. Counsel's written answer on how to handle suspected child-abuse imagery and any reporting duty. **Uploads stay off until this answer exists in writing** (step 8.9).

**7.6 Contest Rules copy.** WHO: FOUNDER, then COUNSEL. ROW: B-220. The Contest Rules modal shows a clearly marked placeholder until the founder writes the rules and counsel reviews them (Decision Log #413, #227).

**7.7 Incident-response and breach plan.** WHO: COUNSEL, FOUNDER. ROW: B-253. A draft exists (`docs/incident-response-and-breach-notification-plan-draft.md`). Counsel review it; the founder names the roles (the draft uses placeholders). It is required before any real child's data is processed (recommendation recorded under Decision Log #426; not yet decided as a rule). Open decision inside it: whether a guardian is told when a child's sign-in is locked (Decision Log #438; options are listed in the draft, none chosen).

**7.8 Penetration test.** WHO: FOUNDER. ROW: B-254. Timing was adopted (after staging is live, after 2FA and image screening exist, before launch). The scope brief is `docs/pen-test-scope-brief-draft.md`. **NOT DECIDED (QUESTION F5): vendor, budget, scope sign-off, severity scale, what "resolved" means, retest window.** The Definition-of-Done item "no open High or Critical security finding" (Decision Log #448) cannot be ticked until this has run.

**7.9 Cloudflare paperwork (only if Cloudflare is used).** WHO: COUNSEL. ROW: B-251. See step 8.1.

---

## Part 8 - Switches and optional services

**8.1 Cloudflare proxy and origin lock.** WHO: FOUNDER decides; AGENT/FOUNDER build. ROW: B-251, Decision Log #424, #449. ADOPTED in principle (free plan, in front of the API and both static sites, origin locked so Render accepts only the proxy); built at the launch gate because it needs the domains. **NOT DECIDED (QUESTION F4): whether to go ahead now.** Facts to know first: (a) Render's per-service inbound rules were described as needing a Scale or Enterprise workspace, while the services here use Free and Starter, so the origin lock may not be possible on these plans (unverified; `docs/cloudflare-processor-and-cross-border-draft.md`); (b) the proxy would see sign-in data, tokens and minors' content in transit, and contradicts the Privacy Policy draft's statement that no third party receives the registration IP; counsel decide (`docs/cloudflare-processor-and-cross-border-draft.md`); (c) after it is on, repeat the two-network check (step 6.3). If used, a short written procedure from Cloudflare's current documentation is added to this runbook on the day. The static sites' header policy in `render.yaml` can move to the proxy if wanted.

**8.2 Web push.** WHO: FOUNDER, AGENT. ROW: B-285, B-062. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (step 3.4). The web site's `/sw.js` must be served as JavaScript with `Cache-Control: no-cache`, outside the catch-all rewrite, over https, with `worker-src 'self'` (`docs/deployment.md`; `render.yaml` sets the cache header and CSP). **Done when a test push from staging reaches a real browser.** Not verified in any real browser.

**8.3 Email.** WHO: FOUNDER. ROW: Decision Log #17, B-115. Set `EMAIL_PROVIDER_API_KEY` and `POSTMARK_FROM_EMAIL` (verified domain). YOU SHOULD SEE: a registration verification email arrive. Note: if `WEB_APP_BASE_URL` is unusable the app sends no emails at all that contain links; the password-reset placeholder-address fallback is already fixed (B-115, PR #633; `docs/deployment.md` still says otherwise, see the report). Postmark live delivery has never been exercised.

**8.4 Stripe, MaxMind, Rekognition keys.** See steps 1.6, 1.7, 1.9 and 6.12. With no AWS keys nothing is auto-approved; with no Stripe keys the under-13 US card step answers 503 (fails closed).

**8.5 Video (ffmpeg).** WHO: FOUNDER decides; AGENT. ROW: B-306, B-238, B-257. ffmpeg and ffprobe are **not** on Render's native Node runtime, so video upload answers 503 until they exist (`FFMPEG_PATH`, `FFPROBE_PATH`, `modules/post-media/README.md`). UNKNOWN / NOT DECIDED (QUESTION F15): how video will be hosted for launch. Pictures work without it.

**8.6 `ADMIN_2FA_ENFORCED`.** Set to exactly `true` on production at launch (B-267 (j)). Any other value is off. Do it only after the first production superadmin has enrolled the day-one way (step 9.5) or have the recovery document ready (step 6.2).

**8.7 `MEDIA_UPLOADS_ENABLED`.** WHO: FOUNDER. ROW: B-306, B-267 (l), B-206. Leave it unset in production until step 7.5 has a written answer. Set to exactly `true` only then. While off: pictures, videos, profile picture, cover photo and Contest final entries cannot be uploaded (the API answers 403 `media_uploads_disabled`); text posts, reading, reporting and staff uploads still work. The web composer shows "Uploads aren't available right now."

**8.8 Highlightly budget.** `HIGHLIGHTLY_DAILY_REQUEST_BUDGET` stays 100 (free tier). Revisit only after real usage (Decision Log #323).

**8.9 Switches summary.** `ADMIN_2FA_ENFORCED` (exact `true`), `MEDIA_UPLOADS_ENABLED` (exact `true`). Every other tuning value is a plain default in `render.yaml`.

---

## Part 9 - Going live (FOUNDER, AGENT)

Do not start until: Parts 5 to 7 are GATE-passed, the 246 tagged strings are cleared (step 7.1), and the founder has said go.

**9.1 Merge to `main`.** The two production static sites build from `main`; production API deploys from `main`. WHO: AGENT merges only when the founder says; **Temi verifies and merges** (project rule).

**9.2 Back up production's database.** See step 5.4.

**9.3 First production deploy.** WHO: FOUNDER watches. YOU SHOULD SEE in Render: the production API builds, the pre-deploy migration lines and the backfill line appear, the service goes live, `/health` returns `{"status":"ok","database":"connected"}`; the production web and admin sites build (the pending-copy check passes) and go live. IF NOT: Part 11.

**9.4 Point the real names.** Steps 2.1 and 2.2 for production names. YOU SHOULD SEE: `https://soccernity.com`, `https://admin.soccernity.com`, `https://api.soccernity.com/health` open.

**9.5 Create the first production superadmin and enrol 2FA.** Steps 5.5 and 6.2 on production, with `ADMIN_2FA_ENFORCED` set after the admin has signed in once (or set first and enrol at first sign-in). Save the backup codes.

**9.6 Set the switches you decided.** Part 8.

**9.7 Re-run the two-network check on production** (step 6.3), then the smoke tests.

---

## Part 10 - Smoke tests after go-live (FOUNDER, QA)

**10.1 Health check workflow.** WHO: FOUNDER. DO: in GitHub, run the manual workflow "deploy" (`.github/workflows/deploy.yml`), choose staging or production. It needs the GitHub secrets `RENDER_STAGING_URL` and `RENDER_PRODUCTION_URL` set first (the API's address; set by hand, step 12.3). Run it ONLY after Render's dashboard says the deploy finished. YOU SHOULD SEE: "Smoke test passed" and `{"status":"ok","database":"connected"}`.

**10.2 Manual checks** (suggested list, built from the register's launch items; not a recorded procedure):

1. Open the web site. Register an adult account; the verification email arrives; verify; sign in; sign out.
2. Register a child under 13 (US) and under 18 (non-US); a guardian email arrives; approval works; the card step works (Stripe TEST key).
3. Sign in on the admin site as the superadmin with a code; open Moderation, Users, Contact enquiries, the Audit log.
4. Post some text; like and comment; report a post; the report appears in the admin queue.
5. Open the Terms and Privacy pages.
6. Cookie behaviour on the real domain: reload keeps the session; sign-out ends it (B-267 (a)).
7. If uploads are on: upload a picture; it appears only after the check; a private-prefix address is refused (step 6.8).
8. A lockout email arrives after repeated bad sign-ins (also proves email).

**10.3 Watch the first day.** Sentry events (once a DSN is live), Render logs, Upstash usage, Neon connections.

---

## Part 11 - Rollback (read BEFORE Part 9)

| Risky step | If it goes wrong | Source |
|---|---|---|
| A bad deploy | In Render, roll back to the previous deploy (the screen: UNKNOWN, Render's documentation). Migrations do NOT roll back by themselves. | `render.yaml` |
| A migration | There is no automatic undo. Restore from the Neon backup or restore point taken in step 5.4 (screen: UNKNOWN). Several migration files carry their own rollback SQL in a comment at the top; an agent reads that. | `docs/dob-encryption-rollback.md`, migration headers |
| The DOB column change / backfill | Decrypt everything back: `node services/api/dist/scripts/backfill-dob-encryption.js --rollback` with the same key, then `ALTER TABLE "User" ALTER COLUMN "dateOfBirth" TYPE TIMESTAMP(3) USING "dateOfBirth"::timestamp;`, then redeploy the previous version. Leaves dates of birth unprotected. | `docs/dob-encryption-rollback.md` |
| A key rotation | There is no undo command: do another rotation back to the old key with the NEXT version number. Never lower the version number. Keep the old key while any older backup exists. | `docs/dob-encryption-rollback.md` |
| Lost `DOB_ENCRYPTION_KEY` | Dates of birth cannot be recovered. Every enrolled account's two-factor must be reset and re-enrolled; every admin needs the peer reset or `docs/admin-two-factor-recovery.md`. | same |
| `ADMIN_2FA_ENFORCED` turned on and an admin is locked out | Another superadmin resets their two-factor (Admin Console). If it is the only superadmin: `docs/admin-two-factor-recovery.md`. Or set the switch back to anything other than `true` and redeploy. | `docs/admin-two-factor-recovery.md` |
| `MEDIA_UPLOADS_ENABLED` | Unset or set to anything other than `true`; redeploy. Existing media stays readable; deleting is not needed. | `.env.example` |
| Cloudflare proxy | Switch the records back to "DNS only"; if an origin lock was set, remove it first. Procedure: UNKNOWN until written. | B-251 |
| DNS | Put the previous record back (keep a copy of what was there before). | B-249 |
| Web push | Remove or blank the three VAPID values and redeploy; push reports itself unavailable. | `.env.example` |
| Postmark / Stripe / Rekognition keys | Blank them (or set back to `replace-me`); each feature fails closed (no email, card step 503, nothing auto-approved). | `.env.example` |
| Pending-copy gate blocks a production build | This is by design; do not allow-list. Clear the strings (step 7.1). | `scripts/check-pending-copy-dist.mjs` |
| A secret leaks | Generate a new value, set it, redeploy. For `JWT_SECRET` or `ADMIN_JWT_SECRET`, access tokens end at once; refresh tokens live in Redis and are separate (see the incident draft, `docs/incident-response-and-breach-notification-plan-draft.md`). For `DOB_ENCRYPTION_KEY` use the rotation. | incident draft |

---

## Part 12 - After launch (FOUNDER)

**12.1 Re-enable Dependabot version updates.** WHO: FOUNDER or AGENT. ROW: B-267 (f), Decision Log #441 (c). Version updates are paused: in `.github/dependabot.yml` both `open-pull-requests-limit: 0` entries go back to 5. Review the held major versions by hand; Sentry 11 must not be taken until `dataCollection` is set off explicitly (it would otherwise send request bodies and query strings). Security-fix PRs from GitHub are already on.

**12.2 The toolchain majors.** ROW: B-268, B-269 (built; B-268 and B-269 merged). Nothing to do beyond reviewing future bot PRs.

**12.3 GitHub repository settings and visibility.** WHO: FOUNDER. ROW: B-267 (g), Decision Log #441 (e). Secret scanning with push protection, Dependabot alerts and security updates, code scanning (CodeQL) and the required checks on `main` (Analyze, dependency-audit, build-and-test) were turned on 2026-10-29 as the founder reported them. **Before you make the repository private:** NOT DECIDED (QUESTION F7): secret scanning and code scanning are free on public repositories only (price not confirmed); the required check "Analyze (javascript-typescript)" would stop uploading and block every merge; options are to pay, or remove Analyze from the required checks and add a free scanner, or keep it public. Making it private removes no existing clone: treat any secret ever committed as exposed and rotate it. Also set the two GitHub secrets for step 10.1.

**12.4 Pen test findings.** Fix and retest (step 7.8).

**12.5 Nightly jobs to know about.** They run on their own: rejected-media and stray-file sweep (04:00; the first night, set `POST_MEDIA_STRAY_SWEEP_DRY_RUN=true` so it only counts; B-283 needs the R2 token to LIST), account anonymisation sweep, report and message retention, Contact Us retention, consent expiry, age reclassification, leaderboard rollups. Their settings are plain values in `render.yaml`.

---

## One-page checklist

| Step | Who | Row(s) | Done |
|---|---|---|---|
| 1.1 Render account | Founder | B-088, B-179 | |
| 1.2 Neon (pooled + direct strings) | Founder | B-088 | |
| 1.3 Upstash (rediss URL) | Founder | B-088, B-267 (d) | |
| 1.4 Cloudflare + R2 (token incl. list) | Founder | B-207, B-265 | |
| 1.5 Postmark + verified domain | Founder | B-088 | |
| 1.6 Stripe (test keys) | Founder | B-162 | |
| 1.7 MaxMind | Founder | B-024 | |
| 1.8 Sentry DSN | Founder | B-267 (c) | |
| 1.9 AWS, opt-out first, then Rekognition | Founder | B-193, B-036 | |
| 1.10 Highlightly key | Founder | B-090 | |
| 1.11 GoDaddy DNS access | Founder | B-249 | |
| 2.1-2.2 Custom domains + DNS | Founder | B-249, B-179 | |
| 2.4 `www` decision | Founder | F17 | |
| 3.2 Six secrets generated | Founder | B-018, B-252 | |
| 3.3 DOB key backed up | Founder | B-252, B-272 | |
| 3.4 VAPID pair | Founder | B-285 | |
| 4.1 Blueprint imported | Founder | B-179, R70 | |
| 4.2 37 values entered per API | Founder | B-018 | |
| 5.2 Migrations ran on staging | Founder, agent | B-018 | |
| 5.3 Staging /health green | Founder | B-090 | |
| 5.5 First superadmin created | Founder, agent | B-090 | |
| 6.1 DOB rotation rehearsal | Agent, founder | B-267 (k), B-272 | |
| 6.2 Admin 2FA on staging + recovery read | Founder | B-267 (j), B-270 | |
| 6.3 TRUST_PROXY_HOPS two-network check | Founder, agent | B-267 (b) | |
| 6.4 Country database | Agent | B-024 | |
| 6.5 Cookie sign-in on real names | QA | B-267 (a), (h), (i) | |
| 6.6 Sentry alert rules | Founder | B-267 (c) | |
| 6.7 Upstash plan check | Founder | B-267 (d) | |
| 6.8 R2 CORS + private-prefix refused | Founder, agent | B-265, B-207 | |
| 6.9 Sports data live | Agent | B-090 | |
| 6.10 Full Playwright run clean | QA | B-134, B-219, B-267 (e) | |
| 6.11 B-221, B-106, B-055 checks | QA | B-221, B-106, B-055 | |
| 6.12 Under-13 end to end | QA | B-162 | |
| 7.1 246 tagged strings cleared | Counsel, agent | B-124, B-208, B-301 | |
| 7.2 Legal copy | Counsel | B-089, B-159 | |
| 7.3 DPIA + addenda | Counsel | B-159, B-236, B-241 | |
| 7.4 Withdrawal wording | Counsel | B-200 | |
| 7.5 CSAM answer in writing | Counsel | B-206 | |
| 7.6 Contest Rules copy | Founder, counsel | B-220 | |
| 7.7 Incident plan | Counsel, founder | B-253 | |
| 7.8 Pen test | Founder | B-254 | |
| 8.1 Cloudflare decision | Founder | B-251 | |
| 8.2 Web push test | Founder, agent | B-285 | |
| 8.3 Email live | Founder | B-115 | |
| 8.5 Video / ffmpeg decision | Founder | B-306 | |
| 8.6 ADMIN_2FA_ENFORCED = true | Founder | B-267 (j) | |
| 8.7 MEDIA_UPLOADS_ENABLED (after 7.5) | Founder | B-306, B-267 (l) | |
| 9.1-9.7 Go live | Founder, agent | B-090 | |
| 10.1-10.3 Smoke tests | Founder, QA | B-090 | |
| 12.1 Dependabot re-enabled | Founder | B-267 (f) | |
| 12.3 Repo visibility decision | Founder | B-267 (g) | |

## Founder questions still open

- **F2** Staging migrations: the free plan may skip `preDeployCommand`. Move the two commands into the build command, or upgrade staging? (step 5.2)
- **F3** First superadmin: there is no command in the repo to hash the password. Who provides it, and how? (step 5.5)
- **F4** Cloudflare proxy and origin lock: yes or no, and does Render's plan even allow the lock? (step 8.1; B-251)
- **F5** Pen test: vendor, budget, scope sign-off, severity scale, retest window. (step 7.8; B-254)
- **F7** Repository visibility: keep public, or pay, or drop the Analyze required check, before it goes private. (step 12.3)
- **F8** Stripe at launch: test keys only, or live? (step 1.6)
- **F10** R2 public address: r2.dev or a custom domain, and the exact host for the CSP. (step 6.8)
- **F13** Upstash: what to do when the free plan's limits are reached. (step 6.7)
- **F15** Video hosting: ffmpeg is not on Render's Node runtime. (step 8.5)
- **F17** Does `www` redirect to the root, and how? (step 2.4)
- **F19** Same-site Playwright run on real domains: no written procedure exists. (step 6.10)
- Also open and owned by counsel or the founder, not by this runbook: the 246 tagged strings (B-124), B-206, B-220, B-253, the DPIA and legal copy sign-off, the withdrawal wording (B-200), and the incident-plan question on guardian lockout notices (Decision Log #438).

---

## Appendix A - every `sync: false` value (both API services take all 37)

Source: `render.yaml`. "From" is where the value comes from. Render asks for these at Blueprint import.

| Variable | What it is | From |
|---|---|---|
| `DATABASE_URL` | pooled Postgres | Neon pooled string |
| `DIRECT_URL` | direct Postgres, used by migrations | Neon direct string |
| `REDIS_URL` | `rediss://` | Upstash |
| `JWT_SECRET` | user sign-in signing secret | step 3.2 (one per environment, distinct) |
| `ADMIN_JWT_SECRET` | admin sign-in signing secret (must differ) | step 3.2 |
| `DOB_ENCRYPTION_KEY` | 32 bytes base64; also encrypts 2FA secrets | step 3.2, back up now |
| `DOB_ENCRYPTION_KEY_VERSION` | leave unset (1) at launch; used in a rotation | step 6.1 |
| `DOB_ENCRYPTION_KEY_PREVIOUS` | unset except during a rotation | step 6.1 |
| `JWT_ACCESS_TTL_SECONDS` | optional; code default 900 | leave blank or default |
| `JWT_REFRESH_TTL_DAYS` | optional; code default 30 | leave blank or default |
| `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` | optional; defaults 5 and 60000 | leave blank or default |
| `RESET_TOKEN_TTL_MINUTES` | optional; default 60 | leave blank or default |
| `GUARDIAN_CONSENT_TOKEN_TTL_HOURS` | optional; default 72 | leave blank or default |
| `ADMIN_2FA_ENFORCED` | exact `true` to require admin 2FA | step 8.6 |
| `MEDIA_UPLOADS_ENABLED` | exact `true` to allow uploads | step 8.7 (after B-206) |
| `EMAIL_PROVIDER_API_KEY` | Postmark server token | step 1.5 |
| `POSTMARK_FROM_EMAIL` | sender on a verified domain | step 1.5 |
| `SPORTS_DATA_API_KEY` | Highlightly key | step 1.10 |
| `SPORTS_DATA_RAPIDAPI_HOST` | blank for a direct account | step 1.10 |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | R2 bucket name and token | step 1.4 |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` | step 1.4 |
| `S3_PUBLIC_BASE_URL` | address serving only `post-media/` and `profile-media/` | step 6.8 |
| `REKOGNITION_ACCESS_KEY_ID`, `REKOGNITION_SECRET_ACCESS_KEY` | AWS IAM user | step 1.9 |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Stripe (test until decided) | step 1.6 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push | step 3.4 |
| `TRUST_PROXY_HOPS` | number of proxies; verified, not guessed | step 6.3 |
| `GEOLITE2_DB_PATH` | leave blank | - |
| `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY` | MaxMind | step 1.7 |
| `SENTRY_DSN` | Sentry project | step 1.8 |

## Appendix B - plain-value variables already in `render.yaml` (leave unless told)

Auth limits (`AUTH_SIGNUP_*`, `AUTH_LOGIN_*`, `AUTH_IP_CEILING_*`, `AUTH_FORGOT_PASSWORD_EMAIL_*`), `GUARDIAN_WITHDRAWAL_RATE_LIMIT_*`, `GLOBAL_RATE_LIMIT_*` (user, anon, write, upload, refresh ip, refresh token), `ADMIN_JWT_ACCESS_TTL_SECONDS`, `ADMIN_JWT_REFRESH_TTL_DAYS`, `GUARDIAN_CONSENT_WITHDRAWAL_TOKEN_TTL_HOURS`, `GUARDIAN_DECLINE_LAPSE_DAYS`, `WEB_APP_BASE_URL`, `ADMIN_APP_BASE_URL`, `SPORTS_DATA_BASE_URL`, `SPORTS_DATA_PROVIDER`, the `SPORTS_*_CACHE_TTL_SECONDS` set, `SPORTS_DATA_MAX_REFRESH_PAGES`, `HIGHLIGHTLY_DAILY_REQUEST_BUDGET`, `POINTS_DAILY_CAP_GIVEN`, `POINTS_DAILY_CAP_RECEIVED`, `S3_REGION`, the `POST_MEDIA_*` set, `FFMPEG_PATH`, `FFPROBE_PATH`, `REKOGNITION_REGION`, the `MEDIA_CHECK_*` set, `MEDIA_REPORT_HIDE_THRESHOLD`, `MEDIA_REVIEW_UNCHECKED_AFTER_MINUTES`, `COPPA_VERIFICATION_AMOUNT_CENTS`, `HELD_INVESTIGATION_ALERT_DAYS`, `REPORT_APPEAL_WINDOW_DAYS`, `ACCOUNT_HOLD_POST_CLOSURE_MONTHS`, `BAD_FAITH_HOLD_MONTHS`, `SUPPORT_INBOX_EMAIL`, `CONTACT_ENQUIRY_RETENTION_MONTHS`, `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_*`, `MESSAGE_RETENTION_MONTHS`, `REPORT_RETENTION_YEARS`, `REPORT_RETENTION_CONCERNS_MINOR_YEARS`. The exact values are in `render.yaml` and equal the code defaults (a test, `env-completeness.spec.ts`, fails if they drift).

Exact names, one per line (kept so a name search finds each one; all are plain values in `render.yaml` equal to the code default, verified present in both `render.yaml` and `.env.example`):

- `AUTH_FORGOT_PASSWORD_EMAIL_MAX`
- `AUTH_FORGOT_PASSWORD_EMAIL_WINDOW_MS`
- `AUTH_IP_CEILING_MAX`
- `AUTH_IP_CEILING_WINDOW_MS`
- `AUTH_LOGIN_ACCOUNT_CEILING_MAX`
- `AUTH_LOGIN_ACCOUNT_CEILING_WINDOW_MS`
- `AUTH_LOGIN_FAILED_ATTEMPTS_MAX`
- `AUTH_LOGIN_FAILED_ATTEMPTS_WINDOW_MS`
- `AUTH_SIGNUP_RATE_LIMIT_MAX`
- `AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS`
- `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_MAX`
- `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_WINDOW_MS`
- `GLOBAL_RATE_LIMIT_ANON_MAX`
- `GLOBAL_RATE_LIMIT_ANON_WINDOW_MS`
- `GLOBAL_RATE_LIMIT_REFRESH_IP_MAX`
- `GLOBAL_RATE_LIMIT_REFRESH_IP_WINDOW_MS`
- `GLOBAL_RATE_LIMIT_REFRESH_TOKEN_MAX`
- `GLOBAL_RATE_LIMIT_REFRESH_TOKEN_WINDOW_MS`
- `GLOBAL_RATE_LIMIT_UPLOAD_MAX`
- `GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS`
- `GLOBAL_RATE_LIMIT_USER_MAX`
- `GLOBAL_RATE_LIMIT_USER_WINDOW_MS`
- `GLOBAL_RATE_LIMIT_WRITE_MAX`
- `GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS`
- `GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX`
- `GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS`
- `MEDIA_CHECK_BATCH_SIZE`
- `MEDIA_CHECK_MAX_ATTEMPTS`
- `MEDIA_CHECK_PASS_THRESHOLD`
- `MEDIA_CHECK_PASS_THRESHOLD_MINOR`
- `MEDIA_CHECK_REJECT_CATEGORIES`
- `MEDIA_CHECK_REJECT_THRESHOLD`
- `MEDIA_CHECK_REJECT_THRESHOLD_MINOR`
- `MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS`
- `MEDIA_CHECK_VIDEO_MAX_FRAMES`
- `POST_MEDIA_IMAGE_MAX_BYTES`
- `POST_MEDIA_MAX_PER_POST`
- `POST_MEDIA_QUARANTINE_MAX_AGE_HOURS`
- `POST_MEDIA_REPORT_DAILY_LIMIT`
- `POST_MEDIA_STRAY_MIN_AGE_DAYS`
- `POST_MEDIA_STRAY_SWEEP_MAX_DELETES`
- `POST_MEDIA_UNATTACHED_MAX_AGE_DAYS`
- `POST_MEDIA_UPLOAD_LINK_TTL_SECONDS`
- `POST_MEDIA_UPLOAD_RATE_LIMIT_MAX`
- `POST_MEDIA_UPLOAD_RATE_LIMIT_WINDOW_SECONDS`
- `POST_MEDIA_VIDEO_MAX_BYTES`
- `POST_MEDIA_VIDEO_MAX_SECONDS`
- `SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS`
- `SPORTS_FINISHED_CACHE_TTL_SECONDS`
- `SPORTS_H2H_CACHE_TTL_SECONDS`
- `SPORTS_HIGHLIGHTS_CACHE_TTL_SECONDS`
- `SPORTS_LIVE_CACHE_TTL_SECONDS`
- `SPORTS_SCHEDULED_CACHE_TTL_SECONDS`
- `SPORTS_STANDINGS_CACHE_TTL_SECONDS`


## Appendix C - rows covered

Every Wave 11 and Wave 12 row is either a step above, or noted as built and needing only the check named: B-088, B-089, B-090, B-124, B-134, B-159, B-162, B-179, B-180, B-189 (typographic club marks only, no licence sought; nothing to do), B-193, B-200, B-206, B-207, B-208, B-219, B-220, B-221, B-231 (built; no launch step), B-235 (video upload decision record; see 8.5), B-236, B-241, B-265, B-267, B-273 (QA harness fix, built), B-285; and B-242, B-243 (API security headers; built in the API; the matching headers on the two static sites are in `render.yaml` and unverified, see step 4.1), B-244 (global rate limit; built; its in-memory counters per instance matter if a second API instance is ever added), B-245 (cookie session API; built), B-246 to B-248, B-250, B-252, B-255, B-256, B-262 to B-264, B-268, B-269, B-272 (built; checked in 6.1 to 6.5 and Part 12), B-249, B-251, B-253, B-254 (steps 2, 8.1, 7.7, 7.8). The full coverage table, with rows left out and why, is in `docs/launch-gate-runbook-report.md`.
