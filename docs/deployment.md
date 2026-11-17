# Deployment setup (Render + Neon + Upstash, all in the EU)

**`docs/launch-gate-runbook.md` is the launch procedure; this file is the Render setup reference.** Follow the runbook
for the order of the whole launch, the checks, the switches and the rollback; use this file for the detail of what each
Render, Neon and Upstash setting means.

Decision Log #26 (Build Plan Section 9 / CLAUDE.md) resolves Decision Log
#9 (hosting): **Render** runs `services/api` and the two static sites (`apps/web`, `apps/admin`), **Neon** is the managed
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

**Region matters and cannot be fixed later.** `render.yaml` puts both API services
in **Frankfurt** (`region: frankfurt`; the static sites have no region). Render cannot change a service's region
after it is created, so check it on the import screen. Neon and Upstash must
also be created in an **EU region**, in or near the same area as Render's
Frankfurt region. Nothing in this repo can check that for you; pick the region
on each provider's "create" screen.

## 1. Neon (Postgres)

1. Sign in at https://neon.tech: the Neon account already exists (corrected 2026-11-14 from the founder's own record). Confirm whether a project already exists; if not, create one (create an account only if you cannot sign in).
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

1. Sign in at https://upstash.com: the Upstash account already exists (corrected 2026-11-14 from the founder's own record). Confirm whether a database already exists before creating one.
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
- **`MEDIA_UPLOADS_ENABLED` switches user image and video uploads on.** Set it by
  hand in Render's dashboard, separately for staging and production (both are
  `NODE_ENV=production`). Only the exact text `true` turns it on; anything else,
  including leaving it empty, leaves uploads off and the API logs a warning at
  start-up. Off means post media, Contest entry videos, profile pictures and
  cover photos answer `403 media_uploads_disabled` (the Contest final entry
  needs a video, so Contests cannot take entries while it is off). Staff upload
  (`POST /admin/media/upload`), reading and deleting existing media and reporting
  media are not affected. **Leave it off until the launch condition is met**
  (Decision Log #524, amended by #529; runbook step 8.7): (a) the
  suspected-illegal-imagery reporting path has been tried once on staging
  (runbook step 6.14), and (b) video works on staging with a real upload
  (runbook step 6.15). Registering with the receiving bodies is not a condition
  (#529). Counsel's answer on
  B-206 is no longer a condition: it is a non-blocking list (runbook step 7.5).
  The founder turns it on at the launch gate (check B-267 item (l)), together
  with the post-media setup steps below. Locally and in tests it is on unless set to `false`.
- None of the three generated secrets (`JWT_SECRET`, `ADMIN_JWT_SECRET` and
  `DOB_ENCRYPTION_KEY`) has a code default. In production (`NODE_ENV=production`,
  which Render sets) the app now **refuses to start** if `JWT_SECRET` or
  `ADMIN_JWT_SECRET` is unset, still a placeholder such as `replace-me`, or if
  the two are the same value. The deploy then fails and the previous version
  keeps serving, instead of a half-working API (before this check, an unset
  `ADMIN_JWT_SECRET` booted fine and every admin login returned a 500 after the
  password had been checked). The error names the variable, never its value.

## 4. Render (the API host)

1. Sign in at https://render.com: the Render account already exists but is NOT configured, on purpose (corrected 2026-11-14 from the founder's own record); nothing is connected until the launch gate. At the gate, connect your
   GitHub account so Render can access this repository.
2. From Render's dashboard, choose **New > Blueprint**.
3. Point it at this repository. Render will detect `render.yaml` at the
   repo root and show you the six services it defines: the two API services,
   `soccernity-api-staging` (tracks the `staging` branch) and
   `soccernity-api` (tracks the `main` branch, production), both in the
   Frankfurt region, and the four static sites for `apps/web` and `apps/admin`
   (`soccernity-web-staging`, `soccernity-admin-staging`, `soccernity-web`,
   `soccernity-admin`; section 4b), which have no region.
   **Update 2026-11-14:** the Blueprint now also defines four static sites for `apps/web` and `apps/admin`
   (`soccernity-web-staging`, `soccernity-admin-staging`, `soccernity-web`, `soccernity-admin`; section 4b), so it shows six
   services, not two. The static sites have no region (Render does not support one for static sites).
4. Render prompts for every variable marked `sync: false` in `render.yaml`
   (only at the first import; later edits are made on each service's
   "Environment" tab). Only the two API services have any (37 each; the four
   static sites have none). The full list with its source is Appendix A of
   `docs/launch-gate-runbook.md`; the runbook's Part 3 says when each value is
   made and step 4.2 when it is entered. For **each** of the two API
   services, set:
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
   - `TRUST_PROXY_HOPS`, `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY`,
     `GEOLITE2_DB_PATH` — country derivation; see "Country derivation
     (GeoLite2)" below. All optional, all fail safe (stronger safeguarding
     control) when unset. Leave `GEOLITE2_DB_PATH` blank. `TRUST_PROXY_HOPS`
     stays unset until it has been checked on staging (runbook step 6.3).
   - `SPORTS_DATA_API_KEY` — your Highlightly API key. A placeholder until a
     real key is set (whether a Highlightly account exists: the founder to confirm, corrected 2026-11-14 from the founder's own record); Sports Hub then serves only cached data.
   - `SPORTS_DATA_RAPIDAPI_HOST` — leave blank unless the Highlightly account
     is a RapidAPI subscription.
   - `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
     `S3_ENDPOINT` — your Cloudflare R2 storage (B-265). **Two buckets, one
     token.** `S3_BUCKET` is the **public** bucket: the only one that
     `S3_PUBLIC_BASE_URL` serves. `S3_PRIVATE_BUCKET` is the **private** bucket
     and has no public address of any kind. They must be two different
     buckets. `S3_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com`
     and the same for both, and one API token (with Object Read & Write and
     the right to list objects) covers both buckets. The API sends a file to
     the bucket its folder says: `post-media/`, `profile-media/` and `media/`
     go to the public bucket, everything else (`private-media/`,
     `private-profile/`, `quarantine/`, `data-export/`, anything new) goes to
     the private bucket. **In production the API refuses to start** if a bucket
     is configured and `S3_PRIVATE_BUCKET` is unset, blank, `replace-me` or the
     same as `S3_BUCKET`. (Render sets `NODE_ENV=production` on staging too, so
     staging is covered.) The API **does** read these (Admin Console media
     upload, profile pictures and covers, post media, data exports); with no
     bucket configured at all, uploads return a clear "storage not
     configured" error (503) and everything else keeps working.
   - `S3_PUBLIC_BASE_URL` — the public address of the **public** bucket only:
     use a custom domain on that bucket, `https://media.soccernity.com`. The
     R2 endpoint above is not publicly readable, so until this is set stored
     files get a URL nobody can open. Never point it at the private bucket.
   - **Post and contest-entry media** (backend/w14-post-media-pipeline,
     Decision Log #419). Users upload photos and videos straight to the **private** R2
     bucket (the `quarantine/` folder) through a one-time link. Five things are a human job and are not
     in `render.yaml`: (1) a **CORS rule on the private R2 bucket** that allows `PUT`
     from your web app's address (without it every browser upload is blocked);
     (2) **keep the private bucket private** (Decision Log #436, row B-265;
     `services/api/src/modules/post-media/README.md`, "Deployment caveat").
     The API keeps every file that is waiting for a decision, held by reports
     or rejected in the **private bucket** (`private-media/`, and
     `private-profile/` for profile pictures and covers), and copies a file to
     the **public bucket** (`post-media/`, `profile-media/`) only when it is
     approved. That only works if the private bucket has **no public access of
     any kind**: do not enable its `r2.dev` address, do not attach a custom
     domain to it, add no public rule. The public bucket gets the custom domain
     `media.soccernity.com` (`S3_PUBLIC_BASE_URL`). Then prove it: request an
     object that lives in the private bucket through the public address and
     check you are refused (not served), and that a `post-media/` and a
     `profile-media/` object are served. This has not been verified against a
     real bucket. Moving a file between the two buckets uses R2's CopyObject
     with the source in the other bucket; Cloudflare's documentation lists
     CopyObject but does not say whether it works across buckets, so the API
     falls back to copying through itself if R2 refuses (also unverified);
     (3) **ffmpeg and ffprobe on the API host**: Render's native Node runtime
     does not include them, so the API now runs as a Docker image
     (`services/api/Dockerfile`, `runtime: docker` in `render.yaml`; Decision
     Log #527) that installs them (Debian ffmpeg 5.1.9). Were they ever missing,
     every video upload would be refused with a 503 and store nothing; photos
     are unaffected. Not yet proven on Render: whether the free plan accepts
     the Docker runtime for staging, and a real video upload on staging
     (runbook step 6.15); (4) an **AWS
     account and an IAM user** allowed `rekognition:DetectModerationLabels`,
     whose keys go in `REKOGNITION_ACCESS_KEY_ID` and
     `REKOGNITION_SECRET_ACCESS_KEY` (region `eu-west-1`); until then no
     automatic check runs and every upload waits for a moderator (nothing is
     ever approved automatically); (5) optionally a bucket lifecycle rule, on the
     private bucket, that expires the `quarantine/` prefix after 1 day, as a backstop to the API's
     own hourly cleanup. The size, length and moderation limits
     (`POST_MEDIA_*`, `MEDIA_CHECK_*`) already carry their defaults in
     `render.yaml`.
   - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` — Stripe **test** keys until
     real keys are set (the Stripe account exists, corrected 2026-11-14 from the founder's own record; the founder confirms at that step whether the keys exist yet). Placeholders mean the card-check step for
     under-13 US guardians fails closed (that guardian cannot complete
     consent); nothing else is affected.
   - `SENTRY_DSN` — placeholder until a Sentry project and DSN are set (the Sentry account exists, corrected 2026-11-14 from the founder's own record; the founder confirms at that step whether the project exists); error
     monitoring is then simply off. (Runbook steps 1.8 and 6.6.)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — the web-push key
     pair, made once per environment with `npx web-push generate-vapid-keys`
     (named in the `render.yaml` comments), and `VAPID_SUBJECT`, a `mailto:` or
     `https://` contact address. Unset or `replace-me` means web push reports
     itself unavailable; nothing else breaks. (Runbook steps 3.4 and 8.2.)
   - `REKOGNITION_ACCESS_KEY_ID`, `REKOGNITION_SECRET_ACCESS_KEY` — the AWS IAM
     user's keys for the automatic picture and video check (see the post-media
     paragraph above; the region is `REKOGNITION_REGION`, a plain value). Until
     they are real nothing is checked and nothing is ever approved
     automatically. Set the AWS opt-out of AI-services data use **before** you
     paste any key. (Runbook step 1.9.)
   - `MEDIA_UPLOADS_ENABLED` — the user-upload switch described in step 3.
     Leave it unset, or anything other than the exact text `true`, in production
     until the launch condition in runbook step 8.7 is met (Decision Log #524;
     counsel's answer on B-206 is no longer a condition, runbook step 7.5).
   - `ADMIN_2FA_ENFORCED` — the admin two-factor switch described in step 3.
     The exact text `true` turns it on; it must be `true` on production at
     launch. (Runbook steps 6.2 and 8.6.)
   - `DOB_ENCRYPTION_KEY_VERSION`, `DOB_ENCRYPTION_KEY_PREVIOUS` — leave both
     **unset** until a key rotation (step 3 above). (Runbook step 6.1.)

   **Plain values you check, not enter.** `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL`
   are plain values in `render.yaml` (they are no longer `sync: false`), equal to the
   origins of the static sites (section 4b): staging `https://staging.soccernity.com`
   and `https://admin.staging.soccernity.com`, production `https://soccernity.com` and
   `https://admin.soccernity.com`. Render does not prompt for them; change them in
   `render.yaml` only if a final domain differs. What they do:
   - `WEB_APP_BASE_URL` — the deployed **https** URL of `apps/web`, no trailing path.
     Used to build the links in the verify-email, guardian-consent, withdrawal and
     password-reset emails. If it is unset, a placeholder, or plain `http` (outside
     localhost), those emails are **not sent at all** and an error naming
     `WEB_APP_BASE_URL` is logged: an email whose only call to action is a dead link
     is worse than none. (In production an unusable value stops the API from
     starting at all.) It is also the **CORS allowlist** entry for `apps/web`: the
     API answers cross-origin browser requests only from this origin and from
     `ADMIN_APP_BASE_URL`, never `*`.
   - `ADMIN_APP_BASE_URL` — the deployed **https** URL of `apps/admin`. Used **only**
     for the CORS allowlist (QA D-01, Decision Log #407). In production each of the
     two must be a real https URL, not a placeholder and not localhost. **A value that
     is unset, not a URL, a placeholder host, `http`, or localhost makes the API refuse
     to start** (`assertProductionEnv`, B-163; Decision Log #408). Outside production
     nothing is checked and localhost origins on any port are allowed.

   Variables that already carry a value in `render.yaml` (for example
   `S3_REGION`, the `SPORTS_*` cache timings, `COPPA_VERIFICATION_AMOUNT_CENTS`,
   `ADMIN_JWT_*_TTL_*`) are set to the code's own defaults; you do not need to
   touch them.
5. Do **not** set `PORT` or `NODE_ENV`. Render supplies `NODE_ENV` itself, and
   setting it by hand would break the build (it would skip the build tools).
6. Click through to finish the Blueprint import. For each API service Render
   builds the Docker image from `services/api/Dockerfile` (three stages: build,
   production dependencies, runtime; the first deploy is slower than a native
   build; Decision Log #527), then runs the pre-deploy command (database
   migration, then the date-of-birth encryption backfill), then starts the
   container (`services/api/docker-start.sh`) and polls `/health`. To read the
   Docker build log see runbook step 4.5. Whether Render's free plan accepts the
   Docker runtime for staging is UNKNOWN (Render documentation).

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
2. **The database file.** The API's Docker image has no build step that
   downloads it. When the container **starts**, `services/api/docker-start.sh`
   runs `node services/api/dist/scripts/fetch-geolite2.js` in the background,
   which downloads the database to `services/api/geoip/GeoLite2-Country.mmdb`
   using those two values (they are runtime variables only and never reach an
   image layer). It never stops the API: with no credentials, or if the
   download fails, it logs `[geolite2] skipped/FAILED …` and carries on. It is
   downloaded again on every start, including every restart and deploy
   (MaxMind's rate limits for that are unverified). The file is
   gitignored (MaxMind's terms don't allow redistributing it). To refresh it,
   redeploy, or run the script again; the API reloads the file when it changes
   on disk. MaxMind updates GeoLite2 on weekdays; a scheduled monthly redeploy
   is the simplest refresh until an owner decides otherwise. **The download URL
   and login scheme are taken from MaxMind's documented direct-download link but
   have not been run against a real account — check the first runtime log (not the build log).**
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

### The web app's service worker (`/sw.js`) — web push, build register B-062 / B-285

`apps/web/public/sw.js` is the push service worker. Vite copies it to the web build's root, so it
must be served at **`/sw.js`** (scope `/`). `render.yaml` defines the web static sites (section 4b,
row B-179), and these are the settings that definition applies; check them on the first deploy:

- Serve `/sw.js` with a **JavaScript content type** (`application/javascript` or `text/javascript`)
  and **`Cache-Control: no-cache`** (or `max-age=0, must-revalidate`) so browsers always check for a
  new worker. Do not let the host's catch-all rewrite (every path to `index.html`) answer `/sw.js`:
  the file must be served as a real file, not as HTML, or registration fails.
- The web CSP (B-179; `docs/security-headers-csp-audit-report.md`) must allow it: `worker-src 'self'`
  (or `script-src 'self'` as the fallback when `worker-src` is absent). The worker makes no network
  request of its own, and the browser contacts the push service itself, so `connect-src` needs no
  push-service origin; the page's API calls (status, subscribe, unsubscribe) are already covered by
  `connect-src` for the API origin.
- Service workers only run on **https** (or `localhost`); the web app's real address must be https.
- The API needs the VAPID key pair (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) before
  the Push page can turn on; until then it shows "not supported on this device".

**Update 2026-11-14:** the static sites are now defined in `render.yaml` (section 4b), so the settings above are applied there:
`/sw.js` gets `Cache-Control: no-cache`, the web CSP has `worker-src 'self'`, and the rewrite does not shadow the file. The
statements above that no web static-site definition exists are out of date; whether Render serves `/sw.js` with a JavaScript
content type is not verified (section 4b, "What is NOT verified").

### QA-only variables that must never be set on Render

Two groups of variables exist only so the Playwright QA stack (`e2e/`) can run, and the API **refuses to start**
when `NODE_ENV=production` and any of them is set to a non-blank value (`validate-runtime-env.ts`). They are
deliberately absent from `render.yaml`; do not add them in the dashboard either.

- The QA test clock: `TEST_CLOCK_ISO`, `TEST_CLOCK_ADVANCE`, `E2E_TEST_CLOCK`.
- `ADMIN_LOGIN_RATE_LIMIT_MAX`: raises the Admin Console sign-in limit (normally 5 attempts per 15 minutes per IP,
  Decision Log #190) so one whole QA run is not refused. Production always keeps the limit of 5.

If a deploy fails with "Refusing to start: the QA admin login limit is configured in production", remove that
variable from the service's environment.

## 4b. Static sites (apps/web and apps/admin) — build register B-179, B-088

Added 2026-11-14 (branch `infra/static-site-hosting-definitions`). The founder lifted the deferral for the **repo files
only**: `render.yaml`, this document and the build scripts. Nothing has been created on Render, no domain or DNS record
exists, and the Blueprint has **not** been imported. Merging the change creates no service; the services appear only when a
human imports or syncs the Blueprint (steps 2 to 6 above, and "Manual steps" below).

### What is defined

Three services per environment, each on its own https origin under `soccernity.com` (Decision Log #437). The API services
are the ones from step 4; the four below are new. They are `type: web` with `runtime: static`.

| Service (`render.yaml` name) | Branch | Origin it is meant to serve | Built against the API at |
|---|---|---|---|
| `soccernity-web-staging` | `staging` | `https://staging.soccernity.com` | `https://api.staging.soccernity.com` |
| `soccernity-admin-staging` | `staging` | `https://admin.staging.soccernity.com` | `https://api.staging.soccernity.com` |
| `soccernity-web` | `main` | `https://soccernity.com` (and `www`) | `https://api.soccernity.com` |
| `soccernity-admin` | `main` | `https://admin.soccernity.com` | `https://api.soccernity.com` |

`render.yaml` deliberately has **no `domains:` entries**: attaching a custom domain, the DNS records and the Cloudflare proxy
are founder steps at the launch gate (B-249, B-251). Until then each site answers only on its `onrender.com` address, where
the host-only, same-site refresh cookie (B-246 to B-248) does **not** work: the cookie check on the real domains is item (a)
of B-267. The API's `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` are no longer `sync: false`: they are plain values in
`render.yaml`, equal to the two origins above for each environment (`services/api/src/render-static-sites.spec.ts` keeps
them equal to what the sites are built for). They are still the **CORS allowlist** and the link base of the emails, as
described in step 4. If a final domain differs from this layout, change the API's two values, the site's
`VITE_API_BASE_URL`, the `connect-src` host in the headers and that spec together.

### Common to all four sites

- **Build command.** Run from the repository root: `npm install && npm run build --workspace=apps/<app>` for staging, and
  `npm install && npm run build:release` for production (see "Pending-copy gate" below). Publish directory:
  `./apps/<app>/dist`. There is no `region` and no `plan`: Render documents both as unsupported for static sites (a global
  CDN, no compute plan). The EU rule of the API, Neon and Upstash does not apply to them: the files are public and hold no
  personal data.
- **`VITE_API_BASE_URL` is read at build time.** Vite writes it into the JavaScript bundle (`apps/web/src/api/*`,
  `apps/admin/src/api/*`). **Changing it means a rebuild**: edit the value in `render.yaml` (or on the service's Environment
  tab) and trigger a deploy; a restart does nothing. It must be the API's own https origin, the same one as in the site's
  `connect-src`. If it is unset the apps fall back to `http://localhost:3000`, which would break a deployed site.
- **Rewrite.** One rule per site: `/*` to `/index.html` (single-page app). Render serves a real file at a path before it
  applies a rewrite, so `/sw.js`, `/assets/*` and the favicon are served as files and are not shadowed.
- **Headers** live in `render.yaml` (the `headers:` list of each site; Render cannot interpolate variables, so the origins are
  written out). They can move to the Cloudflare proxy if B-251 is built; if both set a header, check the response for a
  duplicate. Every site sends, on every path: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` and a `Permissions-Policy` that turns off camera, microphone, geolocation and USB.
  **Production sites also send `Strict-Transport-Security: max-age=31536000; includeSubDomains`; staging does not**
  (HSTS is sticky: a mistake on staging would otherwise stay in browsers for a year).
- **CSP.** Deny by default (`default-src 'none'`), `script-src 'self'` with **no** `'unsafe-inline'` and **no**
  `'unsafe-eval'`, `style-src 'self'` and `font-src 'self'` (both apps self-host Inter and Montserrat now, so no font CDN),
  `base-uri 'none'`, `object-src 'none'`, `form-action 'self'`, `frame-ancestors 'none'` (this one only works as a header,
  not a meta tag). React's inline `style` props are allowed because React writes them through the style object model, not as
  an attribute. The rest is per app:
  - **web:** `connect-src` the API origin, `https://*.r2.cloudflarestorage.com` (the browser PUTs uploads to a signed link on
    the S3 endpoint) and `https://api.stripe.com`; `img-src` `data:`, `blob:` (cover-crop and upload previews) and
    `https://media.soccernity.com` (the public media bucket); `media-src` the same host; `script-src` and `frame-src` Stripe
    (`js.stripe.com`, `*.js.stripe.com`, `hooks.stripe.com`), which loads **only on the guardian card step**;
    `worker-src 'self'` for the push service worker. `/sw.js` is also sent with `Cache-Control: no-cache` so browsers always
    re-check it.
  - **admin:** `connect-src` the API origin only; `img-src` and `media-src` `https://media.soccernity.com` **and**
    `https://*.r2.cloudflarestorage.com` (the review queue plays a 5-minute signed link on the S3 endpoint); no Stripe, no
    frames, no service worker.
  - The public media host is `https://media.soccernity.com` (the custom domain on the public bucket, B-265). The one R2
    wildcard that remains, `https://*.r2.cloudflarestorage.com`, stands in for `S3_ENDPOINT` (the API's own S3 endpoint,
    used for browser uploads and the admin review link) because the account id does not exist yet. **At the launch gate,
    tighten it to your exact `<account-id>.r2.cloudflarestorage.com`.**

### Pending-copy gate (B-124) — which build runs where

- **Production** (`soccernity-web`, `soccernity-admin`) builds with `npm run build:release`. That builds **both** apps and then
  runs `check:pending-copy` on both `dist` folders, so **either production site fails to build while any
  `[COPY PENDING LEGAL REVIEW]` text would ship**. The two sites are gated the same way on purpose: the check is a property
  of the release, not of one app. It fails today by design (246 tagged places, allow-list empty). That is the gate working:
  until counsel clears those strings the production sites cannot be deployed from `main`.
- **Staging** (`soccernity-web-staging`, `soccernity-admin-staging`) builds with the plain build and **no** pending-copy check,
  so the whole stack can be stood up and exercised (including by the QA reviewer) before counsel has cleared anything.
  Staging must never be treated as the legal-copy source of truth.
- `check:pending-copy` itself and its allow-list are unchanged. Strings are cleared by removing the tag in the source and
  deleting the manifest row, never by allow-listing.

### Staging vs production

Same build, rewrite and header set, except: staging builds the plain build (no pending-copy gate), sends no HSTS, follows the
`staging` branch and uses the `staging.` origins above; production builds `build:release`, sends HSTS and follows `main`.
Staging and production never share an origin.

### `soccernity-web-staging` / `soccernity-web` (apps/web)

- Origin: `https://staging.soccernity.com` / `https://soccernity.com` (and `www.soccernity.com`: add a redirect to the root).
- Publishes `./apps/web/dist`, which contains `index.html`, `assets/`, the fonts, `sw.js` and the icons.
- **`/sw.js`** (web push, B-062 / B-285) is a real file in `dist`, so it is not rewritten; it is sent with
  `Cache-Control: no-cache` and the CSP has `worker-src 'self'`. Whether Render serves `.js` with a JavaScript content type
  is the platform default and is **not verified**; check it in the browser (below).
- Service workers run only on https (or `localhost`): the real origin must be https. The push page also needs the API's VAPID
  keys (B-285) before it can turn on.

### `soccernity-admin-staging` / `soccernity-admin` (apps/admin)

- Origin: `https://admin.staging.soccernity.com` / `https://admin.soccernity.com`.
- Publishes `./apps/admin/dist`. No service worker, so no `/sw.js` header.
- The Admin Console needs `ADMIN_JWT_SECRET` on the API and, once enforcement is on, `ADMIN_2FA_ENFORCED` true on the
  production API (B-267). Restricting the admin site by IP is **not** configured here (a later decision; the Cloudflare proxy
  would be the place).

### Manual steps that stay human

1. **Create the services.** Import the Blueprint (steps 2 to 6 above) or, if the API services already exist, **sync** the
   Blueprint so Render adds the four static sites. Render prompts for `sync: false` values only at first import; the four
   static sites have none (their only variable, `VITE_API_BASE_URL`, is a plain value).
2. **Domains and DNS** (B-249, B-251; Decision Log #437, #449): add each custom domain on its service in Render's dashboard,
   then create the DNS records at the registrar (GoDaddy) exactly as Render shows. Keep the records **"DNS only"** (not
   proxied) until the edge-protection step. The registrar and DNS records are not in the repo. Render's custom-domain and
   verification steps change; write them into the launch-gate runbook (B-180) from Render's documentation on the day.
3. **Bucket CORS rule for browser uploads.** The browser PUTs a file straight to the **private** bucket through a signed
   link, so the private R2 bucket needs a CORS rule allowing `PUT` from the web origin(s) (`https://soccernity.com`,
   `https://staging.soccernity.com`). The public bucket needs none. See the post-media paragraph in step 4. Without it,
   uploads fail in the browser even though the API side works.
4. **Two buckets, the private one with no public address** (B-265): `S3_BUCKET` is the public bucket (custom domain
   `media.soccernity.com` = `S3_PUBLIC_BASE_URL`), `S3_PRIVATE_BUCKET` the private one with no public access of any kind.
   **Prove it, in three parts** (runbook step 6.8): (a) through the public address, ask for one object from each PRIVATE
   prefix (`private-media/`, `private-profile/`, `quarantine/`, `data-export/`); each must be REFUSED; (b) through the
   same address, ask for one object from each PUBLIC prefix (`post-media/`, `profile-media/`, `media/`); each must be
   SERVED from `media.soccernity.com`; (c) in the Cloudflare dashboard check that the private bucket has public access off
   (the screen: UNKNOWN, Cloudflare documentation). Stop and do not turn uploads on if any part fails. R2's copy of a
   file from the private bucket to the public one on approval is UNPROVEN (the API falls back to copying through itself
   and logs a warning); the first real approval on staging is the test. The host in `S3_PUBLIC_BASE_URL` is the same one
   in the headers (above).
5. **Set the production API's** `WEB_APP_BASE_URL` / `ADMIN_APP_BASE_URL` only if a final domain differs from the layout above.
6. **Check the deployed headers and the service worker** once a site is live: open the site, then
   `curl -sI https://<origin>/` for the headers, `curl -sI https://<origin>/sw.js` for the JavaScript content type and
   `Cache-Control: no-cache` (web only), and `curl -sI https://<origin>/some/deep/link` for `200 text/html` (the rewrite).
   Open the browser console on the sign-up, guardian-card and upload pages and fix any CSP violation it reports.

### Inputs for the launch-gate runbook (B-180) that cannot be expressed in `render.yaml`

- The exact S3 endpoint host (your account id), to replace the one remaining wildcard.
- The custom domains, the DNS records and the registrar steps.
- The Cloudflare proxy, WAF and origin lock (B-251), and which side then owns the headers.
- Redirects: `www.soccernity.com` to the root, and any http to https redirect Render does not do itself.
- A `Node` pin for the four static sites: the root `package.json` `engines` is `>=22.22.0` with no upper bound; Render's
  documentation says to add an upper bound, and to set `NODE_VERSION` if the platform default is not wanted. Decide this at
  the gate. (The API is different: its Docker image pins Node 22.22.0, Decision Log #527.)
- Whether the admin site is later restricted by IP.

### What is NOT verified

The Render account exists but is NOT configured, on purpose (corrected 2026-11-14 from the founder's own record), and the Blueprint was **not imported**. The field names (`type: web` with `runtime: static`,
`buildCommand`, `staticPublishPath`, `routes`, `headers`) were checked against Render's documentation on 2026-11-14
(`https://render.com/docs/blueprint-spec`, `/docs/redirects-rewrites`, `/docs/static-site-headers`), **not against a live
Render deployment**. In particular **not verified**: that Render accepts the file as written; that several header rules for one
path (CSP plus the others) all apply; that Render does not also set `Strict-Transport-Security` itself (a duplicate); that
`/sw.js` is served as JavaScript; that user-set environment variables are available to the static build; that
`npm install` at the repository root (which installs every workspace, including `apps/mobile`) fits Render's static build
time and memory; the Node version Render picks; the CSP against a real browser session (the audit in
`docs/security-headers-csp-audit-report.md` served both `dist` builds under the target policy in Chrome, but the final
policy, with the Stripe card step, the upload PUT and the real bucket hosts, has not been exercised end to end); and
everything about domains, DNS, Cloudflare and the bucket.

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
4. **The four static sites** (`soccernity-web-staging`, `soccernity-admin-staging`, `soccernity-web`,
   `soccernity-admin`; section 4b). Open each site's own URL from Render's dashboard (the
   `*.onrender.com` address, until its custom domain works). YOU SHOULD SEE the app's sign-in or sign-up
   page, not a Render error page or a blank screen, and a deep link (any path inside the app) opening the
   app instead of a 404. The header, `/sw.js` and CSP checks are not repeated here: they are in section 4b
   ("Manual steps that stay human", item 6), and the staged and go-live versions are in
   `docs/launch-gate-runbook.md` Parts 6 and 10.

## Before and after go-live: where it is written

Everything about going live is in `docs/launch-gate-runbook.md`, not here:

- **Smoke test:** runbook Part 10 (step 10.1 is the manual health-check workflow of step 5.3 above; the rest are the
  manual checks after go-live).
- **Rollback:** runbook Part 11, one row per risky step (migration, key backfill, key rotation, switches). Read it
  **before** Part 9 (going live).
- **Backup:** take a Neon backup or restore point before the first production migration (runbook step 5.4; the Neon
  screen is not written down) and keep the old `DOB_ENCRYPTION_KEY` as long as any older backup exists
  (`docs/dob-encryption-rollback.md`).
- **Monitoring:** Sentry (runbook steps 1.8 and 6.6, alert rules on the `rate_limiter` tag) and "watch the first day"
  (runbook step 10.3: Sentry, Render logs, Upstash usage, Neon connections).
- **No Stripe webhook exists.** The code reads no Stripe webhook (nothing in `services/api/src`, `apps/*/src`,
  `render.yaml` or `.env.example` mentions one), so none has to be created in Stripe. Only the two keys
  (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`) are needed.

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
