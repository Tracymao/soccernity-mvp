# Soccernity launch-gate runbook

**Status:** DRAFT v0.1, written 2026-11-14 for build-register row **B-180** (and the launch gate **B-090**). It decides nothing. It records what the repository says, in order, so one person can follow it. Where the repository does not say, the step says **UNKNOWN** or **NOT DECIDED** and names the founder question.

**Who this is for:** the founder, who is not an engineer. Every step says WHO does it. If a step says AGENT, that is a Claude Code session or an engineer; if it says COUNSEL, it is a lawyer's answer you must have in writing before you go on.

**What this replaces:** `docs/deployment.md` is the older, shorter guide. This runbook supersedes it for the launch. `docs/deployment.md` is NOT edited by this PR (another PR owns that file); where it is out of date this runbook says so and the list is in `docs/launch-gate-runbook-report.md`.

**The platform is not live.** Accounts that EXIST (the founder's own record, corrected 2026-11-14 from the founder's own record): Neon, Upstash, Render, Cloudflare (including Email Routing for soccernity.com; the domain is registered at GoDaddy, which is only the registrar: DNS is at Cloudflare), Stripe, MaxMind, Postmark (signup done) and Sentry (account created). **Render is created but NOT configured, on purpose:** nothing is connected to it until the launch gate, to avoid paying early; the Blueprint has never been imported and `render.yaml` has never been validated by Render. **Not yet created:** AWS (Rekognition) and the Cloudflare R2 buckets (and a Google OAuth project and a Meta developer app, which are not needed because social sign-in was removed, Decision Log #479). **Unknown, not stated either way:** Highlightly, and whether each existing account already has the project, database, key or token a step asks for; where a step needs one, the founder confirms at that step (register B-088, B-090). Nothing in this runbook has been run against a real account or a real deployment. (An earlier version of this paragraph said no vendor account existed; that was wrong because the builder was never given the founder's vendor-account record.) Every command that is shown was read in a file in this repository, and the file is named next to it. Vendor screens change; this runbook never describes a vendor's menu. Wherever a step needs a vendor screen, follow the vendor's own current documentation on the day.

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
- **Tagged string** - a sentence in the app that carried the text `[COPY PENDING LEGAL REVIEW]`. The founder reviewed and cleared all of them (R108, 2026-11-22), so there are 0 today and the tag no longer appears in the built output.
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

- **The production web and admin sites cannot be built while any tagged string remains.** Their build command runs the pending-copy check. The apps' own strings carry no tag any more (R108), but the check still FAILS on the web bundle, because the Terms and Privacy Policy pages render `docs/legal-copy-draft-tos-privacy-policy.md`, which still holds 53 tagged places (admin: 0). It passes once that draft is cleared. If a tagged string is ever added again, the production build fails until it is cleared (Part 7). Staging builds do not run that check. (`render.yaml`, `docs/infra-static-site-hosting-report.md`, `docs/qa-launch-gate-full-run-report.md`)
- **User uploads (pictures and video) stay OFF in production until the launch condition in step 8.7 is met**, and the founder then sets `MEDIA_UPLOADS_ENABLED` to `true` (step 8.9). Since 2026-11-15 the condition is NOT a written answer from counsel (Decision Log #524 reversed that): it is TWO parts: (a) the suspected-illegal-imagery reporting path tried once on staging, and (b) video working on staging with a real upload. (A third part, the founder registering with the receiving bodies, was removed on 2026-11-17: Decision Log #529.) The founder accepts launching before automatic image matching exists; that is his own risk decision, not counsel's view. While the switch is off, Contest entries cannot be made, because a final entry needs a video. (`.env.example`, Decision Log #501, #524, B-306, B-267 (l), B-206, B-321)

---

## Part 1 - Accounts (FOUNDER)

Do these first; most take time (billing, domain checks). For each, follow the vendor's current instructions. Save every login and key in the password manager as you go.

**1.1 Render.** WHO: FOUNDER. DO: sign in to the existing Render account (corrected 2026-11-14 from the founder's own record) and check billing. The account exists but is NOT configured, on purpose: connect nothing until the launch gate. Decide the plan for each service (both API services are `plan: starter`, staging included, because Render refuses `preDeployCommand` on a free service: observed 2026-11-20, Decision Log #537; static sites declare no plan). YOU SHOULD SEE: you can log in. IF NOT: UNKNOWN (vendor). ROW/SOURCE: B-088, B-179, Decision Log #26; `render.yaml`. NOTE: staging moved to Starter on 2026-11-20 so the migrations run (step 5.2). Region is fixed at creation (Frankfurt) and cannot be changed later (`docs/deployment.md`).

**1.2 Neon (database).** WHO: FOUNDER. DO: sign in to the existing Neon account (corrected 2026-11-14 from the founder's own record), then create TWO separate projects, `soccernity-staging` and `soccernity-production` (not one project with two branches: separate credentials, backups and blast radius), each in the London region (`eu-west-2`). **The region is London, NOT the EU: the founder chose it on 2026-11-19 because Render has only Frankfurt for Europe (Decision Log #536, amends the wording of #391).** For each you need TWO connection strings: the pooled one (goes in `DATABASE_URL`) and the unpooled/direct one (goes in `DIRECT_URL`). YOU SHOULD SEE: two strings per environment. IF NOT: UNKNOWN (vendor). ROW/SOURCE: B-088, Decision Log #26, #391; `.env.example` lines 3 to 16.

**1.3 Upstash (Redis).** WHO: FOUNDER. DO: sign in to the existing Upstash account (corrected 2026-11-14 from the founder's own record), then confirm whether a database already exists and create one per environment in the London region (`eu-west-2`), NOT the EU (the founder's choice of 2026-11-19, Decision Log #536). You need the `rediss://` URL (with the double s). Launch on the existing free plan was decided (Decision Log #439); UPDATED 2026-11-14 (Decision Log #517): free until full launch, pay-as-you-go when real users start coming on; check the plan's current quotas and price yourself (step 6.7). YOU SHOULD SEE: a `rediss://...` URL. ROW/SOURCE: B-088, B-267 (d), Decision Log #439; `.env.example`. KNOWN RISK (read from the code): sign-in, token refresh, registration and password reset all store tokens in Redis with no fallback, so a Redis outage blocks them until it returns. The rate limiters fail open or fall back to memory.

**1.4 Cloudflare account and four R2 buckets (media storage).** WHO: FOUNDER. DO: sign in to the existing Cloudflare account (corrected 2026-11-14 from the founder's own record). Create FOUR R2 buckets, all in the EU JURISDICTION (a bucket's jurisdiction cannot be changed after it exists): production `soccernity-media-public` (this is `S3_BUCKET` in production) and `soccernity-media-private` (`S3_PRIVATE_BUCKET` in production); staging `soccernity-staging-public` and `soccernity-staging-private`. Each private bucket must have no public address of any kind: do not turn on its `r2.dev` address and attach no custom domain to it. Create TWO API tokens, one per environment, each scoped to its own two buckets ONLY, and keep each access key id and secret. Staging and production never share a bucket, a token or a media host (Decision Log #535), so test uploads never sit beside real children's files. Note your account id: because the buckets are in the EU jurisdiction the S3 address has `.eu.` in it, `https://<account-id>.eu.r2.cloudflarestorage.com` (the same for both buckets of one account; `.env.example`). Each token must be allowed to READ, WRITE and LIST objects in its two buckets (listing is needed by the nightly stray-file sweep, B-283, which lists both). YOU SHOULD SEE: four bucket names, the endpoint, two access key ids and two secrets. ROW/SOURCE: B-207, B-265, B-283; `.env.example` lines 305 to 330. UNKNOWN: the exact token permission names in Cloudflare's screen (B-207 records only that "Object Read & Write" is believed to include listing; not checked against Cloudflare's documentation).

**1.5 Postmark (email).** WHO: FOUNDER. DO: sign in to the existing Postmark account (signup is done; corrected 2026-11-14 from the founder's own record), add billing, and verify a sending domain (SPF and DKIM DNS records that Postmark gives you; these go in Part 2). The sender is `no-reply@soccernity.com`. The STAGING server is a Live server, not a Sandbox one, because staging checks need real delivery to test inboxes. YOU SHOULD SEE: a server token and a verified sender. ROW/SOURCE: Decision Log #17; `.env.example` lines 207 to 217. **PENDING APPROVAL (found on staging 2026-11-21, Decision Log #541):** while a new Postmark account is pending approval it delivers only to addresses on the SAME domain as the From address. Postmark's error is: "While your account is pending approval, all recipient addresses must share the same domain as the 'From' address". So every staging test account must use a `soccernity.com` address (Cloudflare Email Routing can forward them to a real inbox). **Getting Postmark approved is a launch gate, owned by the founder: do it before any outside person signs up on production** (step 9.1 pre-flight, step 8.3). The placeholder `POSTMARK_FROM_EMAIL` must be replaced by a real address on the verified domain, "not left as-is alongside a real API key" (`.env.example`).

**1.6 Stripe.** WHO: FOUNDER. DO: sign in to the existing Stripe account (corrected 2026-11-14 from the founder's own record). Use TEST keys until the founder decides otherwise (QUESTION F8). YOU SHOULD SEE: a secret key and a publishable key. ROW/SOURCE: B-162, B-088; `.env.example` lines 397 to 402. This is only for the card step on guardian consent for under-13 US children. The code reads no Stripe webhook (searched `services/api/src`), so no webhook has to be set up. The charge is 50 cents by default and refunded at once (`COPPA_VERIFICATION_AMOUNT_CENTS`).

**1.7 MaxMind (country from IP).** WHO: FOUNDER. DO: sign in to the existing MaxMind account (corrected 2026-11-14 from the founder's own record) and confirm a GeoLite2 licence exists, creating it if not. You need the account id and the licence key. ROW/SOURCE: B-024, B-020; `.env.example`; `services/api/src/scripts/fetch-geolite2.ts`. RECORDED 2026-11-20 (the founder's check): the GeoLite2-Country permalink in the MaxMind portal is identical to the URL in `services/api/src/scripts/fetch-geolite2.ts`, which closes the ADDRESS half of B-024. STILL UNTESTED: the key and the redirect; they are exercised for real at steps 4.6 and 6.4.

**1.8 Sentry.** WHO: FOUNDER. DO: sign in to the existing Sentry account (corrected 2026-11-14 from the founder's own record). The account is in the EU data region. Two projects, `soccernity-api-staging` and `soccernity-api-production`; copy each one's DSN. YOU SHOULD SEE: a `https://...@...sentry.io/...` DSN. ROW/SOURCE: B-267 (c); `.env.example` lines 416 to 420. Until a real DSN exists, Sentry does nothing (so every "alert goes to Sentry" statement in the register is not yet true). Alert rules are step 6.7.

**1.9 AWS (image and video check, Rekognition).** WHO: FOUNDER. DO: the AWS account is on the PAID plan (the Free plan closes the account after six months or when credits run out, and joining Organizations upgrades it anyway). One IAM user holds ONLY `rekognition:DetectModerationLabels` and is used by both environments, in an EU region (the code uses `eu-west-1` by default, `REKOGNITION_REGION`). A monthly cost budget alert exists. **BEFORE any key was created, the AI-services opt-out was set (done by the founder, recorded 2026-11-20):** AWS Organizations, an AI services opt-out policy, "Opt out from all services" (the wording comes from AWS documentation as reported by the founder; the screen itself was not checked by an agent). Register B-193. YOU SHOULD SEE: an access key id and secret. ROW/SOURCE: B-193, B-036, Decision Log #430; `.env.example` lines 353 to 360. With no AWS keys nothing is ever approved automatically; every upload would wait for a moderator.

**1.10 Highlightly (sports data).** WHO: FOUNDER. DO: create an account if you do not already have one (the founder to confirm whether one exists; corrected 2026-11-14 from the founder's own record) and copy the API key. Staying on the free plan (100 requests a day) was decided for now (Decision Log #323; `HIGHLIGHTLY_DAILY_REQUEST_BUDGET` is 100). YOU SHOULD SEE: a key. ROW/SOURCE: B-090; `.env.example` lines 155 to 172. Leave `SPORTS_DATA_RAPIDAPI_HOST` empty for a direct Highlightly account. No live data has ever flowed from Highlightly to this app (whether an account exists: the founder to confirm), and whether the header the code sends is accepted by the direct host is checked in step 6.9 (Decision Log #328; the QA verification of 2026-09 confirmed `x-rapidapi-key` alone returns 200 on the direct host).

**1.11 DNS at Cloudflare (domain `soccernity.com`).** WHO: FOUNDER. DO: confirm you can edit DNS records for `soccernity.com` in Cloudflare. GoDaddy is only the registrar: the nameservers were moved to Cloudflare, so DNS records are created in Cloudflare, not GoDaddy. All records stay "DNS only" until step 8.1. ROW/SOURCE: B-249, Decision Log #437.

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

**2.2 Create the DNS records in Cloudflare (DNS only).** WHO: FOUNDER. DO: add exactly the records Render and Postmark give you. YOU SHOULD SEE: Render marks each domain verified and issues a certificate; the address opens over https. IF NOT: wait, then recheck; do not change other records.

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

On Windows PowerShell (no `openssl`), the equivalent, one value per run:

```
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

You need SIX different outputs: `JWT_SECRET`, `ADMIN_JWT_SECRET` and `DOB_ENCRYPTION_KEY` for staging, and again for production. All six must be different (the API refuses to start if the two JWT secrets are equal, or if one still reads `replace-me`). YOU SHOULD SEE: a 44-character line ending in `=`. ROW/SOURCE: B-018, B-163, B-252; `.env.example`; `validate-runtime-env.ts`.

**3.3 The date-of-birth key is special. Back it up now.** The same `DOB_ENCRYPTION_KEY` encrypts every date of birth AND every authenticator (2FA) secret, for users and admins. If it is lost or replaced by another value, all of those become unreadable, and the recovery is resetting and re-enrolling every enrolled account (`docs/dob-encryption-rollback.md`). It must base64-decode to exactly 32 bytes or the API will not start in production. ROW/SOURCE: B-252, B-272.

**3.4 Generate the web-push key pair.** WHO: FOUNDER (or AGENT). DO: `npx web-push generate-vapid-keys` (the command named in the `render.yaml` comments). It prints a public and a private key; `VAPID_SUBJECT` is a value starting `mailto:` or `https://` (the natural value is `mailto:support@soccernity.com`, `.env.example`). Make one pair per environment. ROW/SOURCE: B-285, B-062.

**3.5 Collect the rest** (from Part 1): the database and Redis URLs, the Postmark token and sender, the R2 values, the Stripe test keys, MaxMind id and key, the Sentry DSN, the AWS keys, the Highlightly key. The table in Appendix A lists every `sync: false` value, what it is, where it comes from, and which service takes it.

**3.6 Never set these.** `NODE_ENV` and `PORT` (Render sets them; setting `NODE_ENV` at build time breaks the build). `TEST_CLOCK_ISO`, `TEST_CLOCK_ADVANCE`, `E2E_TEST_CLOCK`, `ADMIN_LOGIN_RATE_LIMIT_MAX` are quality-assurance-only: the API refuses to start in production if any is set (`.env.example`, `validate-runtime-env`, Decision Log #509). `GEOLITE2_DB_PATH` is left blank.

**GATE:** all six secrets and the back-up of both DOB keys are in the password manager.

---

## Part 4 - Services in Render (FOUNDER, with AGENT)

**4.1 Import the Blueprint.** WHO: FOUNDER. DO: first bring the `staging` branch up to `main` (it was 1,928 commits behind and had no `render.yaml`; a pull request from `main` into `staging` on GitHub does it; this was done on 2026-11-20). Then, in Render, create a Blueprint from this repository's `render.yaml`, following Render's current documentation. It defines six services (`render.yaml`, `docs/infra-static-site-hosting-report.md`): OBSERVED 2026-11-20: the first import attempt failed validation with "services[0]: pre-deploy command is not supported for free tier services" (services[0] is `soccernity-api-staging`); nothing was created. Staging is now `plan: starter` (Decision Log #537), so retry the import.

- `soccernity-api-staging` (branch `staging`, plan `free`) and `soccernity-api` (branch `main`, plan `starter`), region Frankfurt.
- Static sites `soccernity-web-staging` and `soccernity-admin-staging` (branch `staging`), `soccernity-web` and `soccernity-admin` (branch `main`).

YOU SHOULD SEE: six services created and a prompt for each `sync: false` value of the two API services. IF NOT: UNKNOWN. **The Blueprint has never been imported, and `render.yaml` has never been validated by Render** (the Render account exists but nothing is connected or configured, on purpose; corrected 2026-11-14 from the founder's own record). Unverified, from the hosting report: that Render accepts the file; that several header rules per path all apply; that Render adds no second HSTS header; that `/sw.js` is served as JavaScript; that `VITE_API_BASE_URL` reaches the static build; that a root `npm install` (which installs every workspace including `apps/mobile`) fits the static build; the Node version of the four static sites (the root requires `>=22.22.0` with no upper limit, and nothing pins it; the API's Docker image pins 22.22.0, Decision Log #527). If any fails, STOP and tell an agent; do not edit around it.

**4.2 Fill the `sync: false` values.** WHO: FOUNDER. DO: enter every value of Appendix A for each API service (staging values on staging, production values on production). YOU SHOULD SEE: both API services list all 37 keys with values. Plain-value variables (83 of them) already carry their defaults in the file; leave them unless a step says otherwise.

**4.3 Check the two web addresses on the API.** `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` are plain values in `render.yaml` (staging `https://staging.soccernity.com` and `https://admin.staging.soccernity.com`; production `https://soccernity.com` and `https://admin.soccernity.com`). In production the API refuses to start if either is missing, http, localhost or a placeholder. ROW/SOURCE: B-163. Note: `docs/deployment.md` still says these two are asked for at import; they are not (it carries an update note, see the report).

**4.4 Staging first.** WHO: FOUNDER. DO: let the staging services deploy first. Do not deploy production until Parts 5 to 7 pass on staging.

**4.4a The static sites pin Node 22.22.0 (R101, Decision Log #540).** WHO: FOUNDER. ROW: B-179, Decision Log #527, #540. All four static sites in `render.yaml` set `NODE_VERSION` to `22.22.0`, the same Node the API image uses, because the repository needs `>=22.22.0` and Render would otherwise pick its own default. DO: after this change is merged, sync the Blueprint in Render, let BOTH staging static sites (`soccernity-web-staging`, `soccernity-admin-staging`) redeploy, and open each one's BUILD log. YOU SHOULD SEE: a line saying Node 22.22.0 was used for the build (the exact wording is UNKNOWN; Render's log screen is not described here). Only after both staging sites show 22.22.0 build the two production static sites. IF NOT: do not build production; write down the Node version the log shows and give it to an agent.

**4.5 The API is a Docker image, and how to read its build log.** WHO: FOUNDER (read), AGENT (fix). ROW: B-322, Decision Log #527. Both API services are `runtime: docker` in `render.yaml`: Render builds `services/api/Dockerfile` (the repository root is the build context) instead of running an install and build command, and the container starts with `services/api/docker-start.sh`. The image carries ffmpeg and ffprobe, so video upload works (step 6.15). The first deploy builds the whole image, which is slower than the old native build. DO: in Render, open the service's deploy log (the screen: UNKNOWN (Render documentation)). YOU SHOULD SEE: the three stages of the Dockerfile in order (build, prod-deps, runtime), `npm ci`, the Prisma client being generated, the TypeScript build, the system packages (ffmpeg among them) being installed, then the pre-deploy command output (step 5.1), then the service going live. IF NOT: copy the first red error line and give it to an agent; do not edit `render.yaml` around it. Staging and production are both Starter, so the free-plan question no longer applies (Decision Log #537). The Dockerfile and image were proven locally only; no Render deploy has ever happened (`docs/infra-api-docker-ffmpeg-report.md`).

**4.6 Restart the staging API several times: does the country database still download? (PASSED ON STAGING 2026-11-21, B-024, B-322; Decision Log #541).** RESULT 2026-11-21: five consecutive staging API restarts each showed the `[geolite2] installed` line, so MaxMind did not refuse any of the five downloads. Still repeat it on production after the first production deploy. The original instructions follow. WHO: FOUNDER (read), AGENT (fix). ROW: B-024, B-322, B-267. The API image downloads the GeoLite2 country database from MaxMind at EVERY container start (`services/api/docker-start.sh`), including every restart and every deploy. MaxMind's daily download limit is UNVERIFIED: it is not known whether several starts in one day are refused. This is a check, not a known problem. DO: after the first good staging deploy and step 6.4, restart the staging API five times in a row, a few minutes apart (Render's manual restart; the screen: UNKNOWN (Render documentation)), and after each start open the RUNTIME log (not the build log). YOU SHOULD SEE: after every start a line beginning `[geolite2] installed GeoLite2-Country database`, and no line beginning `[geolite2] FAILED`. (A line beginning `[geolite2] skipped:` means the MaxMind keys are missing: go back to steps 1.7 and 4.2.) IF NOT (a start shows `[geolite2] FAILED` or the download is refused): the API keeps running, but it treats every country as "unresolved" and applies the stronger safeguarding control to everyone until the file is fetched again, so a refused download is not harmless for sign-ups. The next move is the founder's call; no code change is made at this step, and do not edit `docker-start.sh` around it. Write down the first failing line and give it to an agent.

**GATE:** the staging API shows live in Render.

---

## Part 5 - Database, migrations, and the key backfill

**5.1 What happens at every API deploy** (read from `render.yaml`):

- Build: Render builds the Docker image from `services/api/Dockerfile` (step 4.5); there is no build command. The country database is NOT downloaded at build: it is fetched when the container STARTS (`services/api/docker-start.sh` runs `node services/api/dist/scripts/fetch-geolite2.js` in the background, so the API serves from the first second). The download never stops the API; with no keys, or if it fails, country comes back "unresolved" and the stronger safeguarding control is applied. It is downloaded again on every start, including every restart and deploy (MaxMind's rate limits for that are unverified).
- Before the new version takes traffic (`preDeployCommand`): `npx prisma migrate deploy --schema=services/api/prisma/schema.prisma && node services/api/dist/scripts/backfill-dob-encryption.js`. The first applies every database migration not yet applied, using the direct connection (`DIRECT_URL`). The second encrypts any date of birth still in plain text, and leaves already-encrypted values alone.
- Start: the Dockerfile's own command, `services/api/docker-start.sh` (it starts the country download in the background, then the API). Health: Render checks `/health`.

On a brand-new empty database, every migration is applied from the first one. The backfill then finds no rows. ROW/SOURCE: B-018, B-252, B-272.

**5.2 Check that the migrations really ran on staging.** WHO: FOUNDER (read), AGENT (fix). DO: after the first staging deploy, open its deploy log in Render and look for the migration lines and a line starting `DOB encryption backfill: scanned=`. YOU SHOULD SEE: both. On Starter the command runs before each deploy (Render refuses it on a free service, which is why staging is Starter: Decision Log #537). IF NOT: copy the deploy log's first red line and give it to an agent.

**5.3 Health on staging.** DO: open `https://api.staging.soccernity.com/health` (after DNS) or the Render address. YOU SHOULD SEE: `{"status":"ok","database":"connected"}`. IF NOT: read the deploy log; the usual cause is a wrong `DATABASE_URL`. SOURCE: `.github/workflows/deploy.yml`.

**5.4 Production database.** After staging passes, the same happens on production on the first production deploy (step 9.3). Take a Neon backup or restore point first (`docs/dob-encryption-rollback.md` step 0; the screen name: UNKNOWN, follow Neon's documentation). Production migrations start from an empty database, so the "back up first" step protects only later deploys.

**5.5 First superadmin.** WHO: FOUNDER (an AGENT can be on hand). The first admin is created with ONE command built for this: `npm run create-first-superadmin -- --email <your email> --full-name "<your name>"` in `services/api` (compiled form: `node dist/scripts/create-first-superadmin.js`), built by PR #787 (register B-319). **You run the command; no argon2 hash is made by hand and nothing is written into the database by hand.** The full procedure is `docs/first-superadmin.md`: do the `--dry-run` first; the password is asked at a hidden prompt, twice, and is never typed on the command line (`--password` is refused); the command prints only the database name and host, asks you to type the database name to confirm, refuses and writes nothing if ANY superadmin already exists or the email is already used, and exits 0 only after it has read the account back and checked the stored password. Run it once per environment (staging, then production). After that first superadmin exists, create every further admin from the Admin Console (superadmin only: `POST /admin/staff`, Decision Log #191, B-264), which returns a one-time password shown once. QUESTION F3 is ANSWERED (2026-11-14). UNKNOWN: the command was tested only against scratch databases, never against a real Neon database or a real terminal prompt. ROW/SOURCE: B-319, B-267, B-090.

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

There is no undo command; undo is another rotation. **Not run against a real Render or Neon deployment; the accounts exist but nothing has been connected or run against them (corrected 2026-11-14 from the founder's own record); this rehearsal is the first run.** After the rehearsal, production starts at version 1 with a fresh key (no rotation needed at launch).

**6.2 Admin two-factor on staging (and the recovery rehearsal).** WHO: FOUNDER. DO: set `ADMIN_2FA_ENFORCED` to exactly `true` on staging (any other value is off; unset logs a warning at start). Sign in as the staging superadmin: the next sign-in shows the enrolment screen, then 10 backup codes shown once. Save them in the password manager. ROW: B-270, B-271, B-267 (j). Then read `docs/admin-two-factor-recovery.md`. It is the way out if the ONLY superadmin loses both the phone and the backup codes: in the Neon SQL editor, check it says the right environment, run the read-only check (Step 0), then the one transaction between `-- RECOVERY-SQL-BEGIN` and `-- RECOVERY-SQL-END` with the email replaced in three places, then the verify queries (Step 2). Optional Step 3 deletes the admin's Redis sessions in the Upstash data browser. **The SQL is proven by an automated test but has never run on a real Neon database; rehearse the read-only Step 0 on staging.**

**6.3 `TRUST_PROXY_HOPS` and the two-network sign-in check.** WHO: FOUNDER with AGENT. ROW: B-267 (b), B-256, B-022. This number is how many proxies sit in front of the API; get it wrong and every child looks like the same person. DO: set `TRUST_PROXY_HOPS` to 1 on staging (the starting guess; verify, do not trust it). Then: from **network A** (for example your home connection), fail one test account's sign-in five times; the sixth attempt should be blocked. Then from **network B** (for example a phone on mobile data), one sign-in attempt on a different test account must succeed. Use an email address you can read (a lockout email is sent). On staging, while the Postmark account is pending approval, use a `soccernity.com` address (see step 1.5). IF the second network is also blocked, the hop count is wrong (the API sees the proxy's address). Try 2. Repeat the whole check if Cloudflare is added later (step 8.1). Also (country check): register a throw-away account, read `User.derivedCountry` and `countryDerivationMethod` in the database; if it is "unresolved", try the other hop count. (`.env.example` lines 231 to 238; register B-267 (b).)

**6.4 Country database.** WHO: AGENT. DO: confirm the staging API's RUNTIME log (not the build log: the download happens when the container starts) shows a `[geolite2]` line saying the country database was downloaded (needs `MAXMIND_ACCOUNT_ID` and `MAXMIND_LICENSE_KEY`). IF NOT: the app still works but treats every country as unresolved and applies the stronger control. ROW: B-024, B-025. RESULT 2026-11-21: passed on staging (see step 4.6).

**6.5 Cookie sign-in on the real names.** WHO: QA/AGENT with FOUNDER. ROW: B-267 (a), B-248, B-246, B-247, B-249. On staging's real domains: sign in on the web and the admin site, reload (still signed in), sign out (really signed out), and let an access token expire (about 15 minutes) to confirm silent refresh works (B-267 (i)). Open two tabs at the same moment after expiry and confirm neither is signed out (B-267 (h)). Also run the full Playwright suite on a same-site setup (step 6.10). Until this passes, cookie sign-in is verified only on localhost. NOTE (R101, Decision Log #542): an adult whose email is not yet verified CAN sign in and see the community page. That is by design: the web routing after sign-in is only a hint, and the server refuses every write. What you should see for such an account is a post box that says "Verify your email to post." (and "Verify your email to comment." under a post), with a link to the verify-email page, NOT the guardian-approval message. The guardian message appears only when the server says the refusal is about guardian consent. Any other refusal reads "You can't do that right now."

**6.6 Sentry alert rules.** WHO: FOUNDER. ROW: B-267 (c), B-262, B-263. After a real `SENTRY_DSN` is set (staging value first), create an alert rule on the tag `rate_limiter` (values `global` and `auth`) and one on `session_revocation`. First check which alert types your Sentry plan allows (UNKNOWN). YOU SHOULD SEE: a rule listed; trigger one on staging to prove it reaches you. These tags are only reported once a real DSN exists.

**6.7 Upstash plan.** WHO: FOUNDER. ROW: B-267 (d), Decision Log #439. Check the current quotas and price of the plan in your Upstash account against your expected traffic; the register recorded the Prod Pack at 200 dollars per month per database and declined it for launch (the figures are the founder's, not re-fetched). ANSWERED 2026-11-14 (Decision Log #517, QUESTION F13): stay on the free plan until full launch and move to pay-as-you-go when real users start coming on. Security session conditions (notes, not the founder's words): production should be on pay-as-you-go BEFORE the first outside person signs up (a pilot counts), because at the free limit (500,000 commands a month) sign-in and token refresh fail and the revocation and rate-limit checks fail open; every authenticated request makes one Redis read for the revocation marker (B-305); staging can use the one free database.

**6.8 R2 buckets: CORS and the private-bucket check.** WHO: FOUNDER with AGENT. ROW: B-265, B-207. **STATUS 2026-11-21 (Decision Log #541): parts 1 to 3 PASSED ON STAGING. CORS was saved on `soccernity-staging-private`. `media.staging.soccernity.com` serves `post-media/`, `profile-media/` and `media/` and refuses `private-media/`, `private-profile/`, `quarantine/` and `data-export/` with a 404. The private bucket's `r2.dev` access is off and no custom domain is attached to it. STILL OPEN: part 4 (lifecycle rule, optional), part 5 (the cross-bucket copy, step 6.14) and part 6 (tightening the two CSP wildcards, which needs the account id). Repeat parts 1 to 3 for production.** DO:

1. Set the CORS rule on the PRIVATE bucket (the browser uploads to it through a one-time link) to allow `PUT` from the web origins (`https://staging.soccernity.com`, then production). The public bucket needs no CORS rule. The screen: UNKNOWN (Cloudflare documentation). This is a human step (`docs/deployment.md`).
2. Serve each PUBLIC bucket at its own custom domain (`S3_PUBLIC_BASE_URL`): **production `soccernity-media-public` at `https://media.soccernity.com`; staging `soccernity-staging-public` at `https://media.staging.soccernity.com`** (Decision Log #535). Do the staging one first. Add each as a custom domain on its bucket. **THE MEDIA DOMAIN IS ALWAYS PROXIED (confirmed on staging 2026-11-21, Decision Log #541):** a custom domain on an R2 public bucket is managed by Cloudflare and is always proxied; it cannot be set to "DNS only". The web, admin and API records stay "DNS only" until step 8.1 (which is deferred past launch, #518). So Cloudflare already handles the IP addresses of people who load media, before 8.1. This is flagged as an open item for the legal-draft pass (the DPIA, the Cloudflare and addenda drafts and the counsel pack; they are NOT edited by this change). The PRIVATE buckets (`S3_PRIVATE_BUCKET`) stay with no public address at all: no `r2.dev` address, no custom domain, no public rule. The API puts `post-media/`, `profile-media/` and `media/` files in the public bucket and everything else (including `private-media/`, `private-profile/` and `quarantine/`) in the private one (`modules/post-media/README.md`). The domain screens: UNKNOWN (Cloudflare documentation).
3. **Prove it**, in three parts. (a) Through the public address (`media.soccernity.com`), ask for one object from each PRIVATE prefix (`private-media/`, `private-profile/`, `quarantine/`, `data-export/`); each must be REFUSED. (b) Through the same address, ask for one object from each PUBLIC prefix (`post-media/`, `profile-media/`, `media/`); each must be SERVED from `media.soccernity.com`. (c) In the Cloudflare dashboard, check that the private bucket has public access off (the screen: UNKNOWN, Cloudflare documentation). YOU SHOULD SEE: a refusal (a 403 or 404 page, not the file) for every private prefix, the file for every public prefix, and public access off on the private bucket. IF NOT: stop; do not turn uploads on.
4. Optional: a bucket lifecycle rule of one day on the `quarantine/` prefix of the PRIVATE bucket (`quarantine/` is a private prefix; a safety net, the app also purges it).
5. **R2's copy between two buckets is UNPROVEN.** When a photo is approved, the API copies it from the private bucket to the public one. Cloudflare's S3-compatibility page lists CopyObject as supported but does not say it works from one bucket to another. The first real approval on staging is the test. If R2 refuses, the API logs the warning `[storage] cross-bucket CopyObject refused (<error name>); copying through the API instead` and copies the file through itself, so approval works either way. YOU SHOULD SEE: an approved test photo served from `media.soccernity.com` and gone from the private bucket.
6. **DONE (2026-11-21, R106, Decision Log #548).** The two wildcards in the static sites' CSP are replaced by the exact host `https://fa6d2be1dc1616bdc010c197e51376f2.eu.r2.cloudflarestorage.com` on all four static sites (the API builds path-style URLs, so this one account host is all the browser needs; no bucket host is named). The non-EU wildcard is gone. The public media host in the CSP is `https://media.staging.soccernity.com` on the two staging sites and `https://media.soccernity.com` on the two production sites; the web sites also get it as the build value `VITE_MEDIA_BASE_URL` (a change means a rebuild). Check after the first real deploy: a browser upload to the private bucket and an admin signed-link view must show no CSP error in the console.

**6.9 Sports data live check.** WHO: AGENT. ROW: Decision Log #328, #323, B-090. With a real `SPORTS_DATA_API_KEY` on staging, request the live scores and one match page and confirm real data (not just an empty page). Until this is done no real Highlightly data has ever flowed through the app.

**6.10 The full Playwright run (and what clean looks like).** WHO: QA. ROW: B-134, B-219, B-267 (e), B-273. The suite is in `e2e/`, is not in CI, and drives real Chrome against the real API, Postgres and Redis. Source: `e2e/README.md`.

- Setup: `cd e2e && npm install`. If you installed with `npm ci --ignore-scripts`, also run `node node_modules/ffmpeg-static/install.js`. Docker Postgres and Redis must be running (`docker compose up -d`), a root `.env` copied, Chrome installed. Global setup runs `prisma generate` itself.
- Run: `npm test` in `e2e/` (one worker; about 40 minutes on the founder's Windows machine). **Do not run two at once**: they share fixed ports (API 3100, web 5273, admin 5274, fake object store 3191, fake Rekognition 3192) and one scratch database `soccernity_qa` that each run drops and recreates, and they use Redis database 5.
- The run rewrites about 290 tracked screenshots under `docs/`. Restore them with `git checkout -- docs/`.
- **Clean looks like:** 0 failed; the only skips are by design: spec 15 (one fresh-API test), spec 16 (8 tests, only run from day 25 of a month; or run it with `QA_TEST_CLOCK_ISO=2026-11-26T10:00:00Z QA_TEST_CLOCK_ADVANCE=1 npx playwright test 16-fc8-final-week` alone), spec 17 (2 single-phase tests), spec 24 (1 test that needs 2FA enforcement). The latest recorded whole runs: 534 passed, 1 failed (a spec defect in 37-b058, since repaired), 12 skipped by design (PR #774). The register's "180 tests" (B-219) is out of date.
- **The run must also exercise `POST /admin/media/upload`** (the staff upload): no Playwright spec covers it today (B-267 (e)); QA writes or runs one before launch.
- A same-site run on the real domains (B-267 (a)) is separate from the local run and is not yet written down as a procedure: UNKNOWN (QUESTION F19).

**6.11 Launch checks not yet recorded.** WHO: QA. ROW: B-221, B-106, B-055. (a) B-221: the guardian withdrawal page check. The pass condition is met in code but **no run is recorded**, so it is not recorded as passed; run it and write the result down. (b) B-106 and B-055: one QA pass of the six frames that were never inspected: `5802:9183`, `5815:8948`, `5542:7344`, `5542:7695`, `5803:8917`, `2896:4837` (Figma node ids). Decided (Decision Log #462) to be done once, at the launch gate.

**6.12 Under-13 approval end to end (B-162).** WHO: QA, with FOUNDER for the keys. ROW: B-162, B-025, Decision Log #528. This is a launch-gate check on STAGING with Stripe TEST keys and the GeoLite2 country database; there is no test seam in the product code and none will be added (Decision Log #528). DO: with a Stripe TEST key set on staging and the country database present (step 6.4), register a child under 13 declaring the US, and take the guardian through the card step to approval, using a Stripe test card from Stripe's own documentation. YOU SHOULD SEE: the guardian reaches the card step; the test charge and its immediate refund show in the Stripe TEST dashboard; the guardian's approval then completes and the child's account is approved. Also register one child under 13 declaring a non-US country: no card step. IF NOT: if the card step answers 503, the Stripe key is missing or still a placeholder (it fails closed); if no card step appears for a US child, the country database did not load (step 6.4). Stop and tell an agent; do not skip this step. The code is built; this has never been run end to end against Stripe.

**6.13 Smoke test workflow.** See Part 10.

**6.14 The suspected-illegal-imagery reporting path, tried once (B-206, B-321).** WHO: AGENT with FOUNDER. ROW: B-206, B-321, Decision Log #524, #525. This is condition (a) of the launch condition in step 8.7. Use a HARMLESS test picture only; never any real or suspected illegal material, in any test. DO: (1) on STAGING only, set `MEDIA_UPLOADS_ENABLED` to exactly `true`; (2) as a test account, upload a harmless picture so it reaches the admin Media review queue (or have an agent seed one); (3) sign in to the staging admin site as a child-safety-vetted moderator, open the item and press "Suspected illegal imagery", enter a reason of 10 to 500 characters and confirm; (4) open "Suspected illegal imagery" from Media review: the record is listed as "Not filed"; open it and use "Record that this was filed" with made-up test values (a made-up reference), then see it listed as "Filed"; (5) repeat (2) to (4) for a PROFILE PICTURE and then a COVER PHOTO: as the same test account upload a harmless profile picture and a harmless cover photo; open each in Media review as the vetted moderator (it is listed as a "Profile picture" or "Cover photo" item; if the automatic image check is configured on staging and clears the picture it will not be listed, so use a picture the check is unsure about or have an agent seed one), press "Suspected illegal imagery", enter a reason of 10 to 500 characters and confirm; open "Suspected illegal imagery" and see each record listed as "Not filed" (record a made-up filing on one of them if you wish); (6) delete the test uploader's account on the staging Users page (an admin delete anonymises at once, with no waiting period); (7) in the PRIVATE R2 bucket for staging confirm every file set aside, the post picture AND the profile picture AND the cover photo (profile pictures and covers are under `private-profile/`), is STILL there (the screen: UNKNOWN (Cloudflare documentation)) and that every record is still listed. YOU SHOULD SEE: each picture gone from public view and rejected with the standard rejection (the profile picture and cover photo no longer shown on the test profile); each record kept; each file kept after the account is deleted. IF YOU SEE a profile picture or cover photo that still shows publicly, or a file gone after the account is deleted, that is a defect in the profile-picture path (Decision Log #530). IF NOT: stop; do not turn uploads on in production; give the first thing that differed to an agent. Nothing in this path contacts any authority: the filing itself is made by a person with the receiving body, outside Soccernity (step 7.5, step 8.7). The founder's own registrations with the receiving bodies are NOT part of this check (Decision Log #529).

**6.15 Video on staging with a real upload (F15, B-322).** WHO: QA or FOUNDER. ROW: B-322, B-238, B-257, Decision Log #527. This is condition (b) of the launch condition in step 8.7. With uploads on in staging (step 6.14), upload a short real video (mp4, under 100 MB and 120 seconds) through the post composer as a test account. YOU SHOULD SEE: the upload accepted, "Checking", then either approved or waiting for a moderator; the video plays for the author. IF NOT: if you see "Uploads aren't available right now" or the API answers 503 `uploads_unavailable`, look in the API's runtime log for ffmpeg or ffprobe missing and check the Docker build log (step 4.5); the image is meant to carry both. Photos must also be tried once (they need no ffmpeg).

**6.16 The static sites' headers, service worker and CSP (both staging sites).** WHO: AGENT with FOUNDER. ROW: B-179, B-180, B-088, B-250; `docs/deployment.md` section 4b ("Manual steps that stay human", item 6). Once a site is live: `curl -sI https://<origin>/` and check the headers (a Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a Permissions-Policy; no HSTS on staging, HSTS on production); `curl -sI https://<origin>/sw.js` for the JavaScript content type and `Cache-Control: no-cache` (web site only); and `curl -sI https://<origin>/some/deep/link` for `200 text/html` (the rewrite works). Then open the browser console on the sign-up, guardian-card and upload pages and look for any CSP violation. YOU SHOULD SEE: every header present, `/sw.js` served as JavaScript, the deep link giving the app, and no violation in the console. IF NOT: a violation names the blocked address; give it to an agent (the policy lives in `render.yaml`; do not weaken it by hand). UNKNOWN (Render documentation, never tried): that several header rules on one path all apply, and that Render adds no second HSTS header.

**GATE:** 6.1 to 6.16 all pass on staging.

---

## Part 7 - Counsel and legal gates (COUNSEL, FOUNDER)

None of these is decided by this runbook. They are the things that need a person who is not an engineer.

Counsel receives one pack, `docs/counsel-review-pack.docx` (source `docs/counsel-review-pack.md`): the questions, grouped, and the strings sheet. Only what is still unresolved and needs a lawyer is in it (Decision Log #532, #534).

**7.1 Confirm no tagged string remains (cleared by the founder, R108).** WHO: AGENT (check only). ROW: B-124, B-208, B-089, B-301. The founder reviewed all 144 remaining strings and cleared them (R108, 2026-11-22); no counsel review was needed. The 56 admin two-factor strings were cleared by the founder, not counsel (Decision Log #531). Six plain-fact strings on the verify-email prompt, the date-of-birth and country step, the register step and the post box were also untagged by the founder (R101, Decision Log #539); the claim in each was checked in the code first. The manifest has no rows (it had 144: web 93, admin 51) and the apps' source holds no tagged string. The check still prints 53 places today (web only), all from the rendered legal draft `docs/legal-copy-draft-tos-privacy-policy.md`; they go when that draft's tags are cleared, which the legal-draft owner does, not this step. **Strings are cleared by removing the tag, never by allow-listing:** the allow-list file `scripts/pending-copy/dist-allowlist.json` must stay `[]`. Check with `npm run check:pending-copy` (it builds the apps first). YOU SHOULD SEE: it passes once the legal draft is cleared (today it fails on 53 places in the web bundle, all from that draft). The production web and admin builds run this same check, so production cannot deploy until it passes.

**7.2 Legal copy.** WHO: COUNSEL. ROW: B-089, B-159. The live Terms and Privacy pages render `docs/legal-copy-draft-tos-privacy-policy.md`. It is a draft, still not approved, with `[PROPOSAL]` markers and an unfilled company name, address and effective date (Decision Log #203 stays open for the prose). Counsel review the current version; the founder fills the company details. Do not publish while the NOT APPROVED banner remains.

**7.3 DPIA and drafts.** WHO: COUNSEL. ROW: B-159, B-236, B-241. Counsel review `docs/sprint-1-dpia-outline-draft.md`, the post-media and contest-view-data addenda (`docs/dpia-addendum-post-media-draft.md`, `docs/dpia-addendum-contest-view-data-draft.md`), and the matching legal-copy drafts (`docs/legal-copy-part-c-post-media-draft.md`, `docs/legal-copy-part-c-view-data-draft.md`). All are drafts; the DPIA sign-off block is empty.

**7.4 Guardian withdrawal wording.** WHO: COUNSEL. ROW: B-200. One inconsistency for counsel: the frames, the code email and the legal draft disagree on whether withdrawal means "deleted after 30 days", "permanently deleted" or "anonymised with a consent record kept 6 months".

**7.5 Suspected illegal imagery: questions for counsel (B-206). NON-BLOCKING.** WHO: COUNSEL, with FOUNDER. ROW: B-206, B-321, B-323; Decision Log #524, #525, #526. **This no longer holds up launch.** Decision Log #524 reversed the earlier rule that uploads stay off until counsel answers in writing; the launch condition is now in step 8.7. The founder has accepted launching before automatic image matching (hash-matching) exists; that is the founder's own risk decision and is NOT counsel's view. The founder will also NOT register with NCMEC's CyberTipline or the UK body before uploads go on; if a need appears later he will (Decision Log #529; he relies on IWF and Hive after launch, step 12.6). Without a registration, if a vetted admin finds what looks like abuse imagery there is no prepared route to file it: the set-aside, the preservation and the filing record still work (the filing form takes any body, including "other"), and whether a legal duty to report applies regardless of registration is one of the questions below. Counsel has NOT been recorded as saying proactive detection is required; the position counsel took is the one in `docs/legal-copy-draft-tos-privacy-policy.md` (Decision Log #4). What is built: a vetted moderator can set a file aside, which keeps it (private, not deleted with the account) and opens a record; the filing itself is made by a person with the receiving body, outside Soccernity. These questions are Group 1 of the counsel pack. The questions below are for counsel to answer when they can, in plain words. Their answers may change wording, retention figures or the receiving-body list; they do not stop launch. (1) For each country Soccernity launches in, which body receives a report of suspected illegal imagery, what is the founder's legal duty to report, and by when? (The built list is: GB the IWF and the NCA, US NCMEC, EU member states the national hotline in the INHOPE network, Nigeria none; every entry is marked pending counsel and no web address is stored.) (2) How long must a set-aside file and its record be kept (the built default is 365 days, after which ordinary deletion resumes), and when may evidence be released? (3) Is the plain wording shown to the person whose file was removed, and to a guardian, acceptable? (4) Does counsel advise adding automatic image matching, and how soon (step 12.6 and Decision Log #526)?

**7.6 Contest Rules copy.** WHO: FOUNDER, then COUNSEL. ROW: B-220. The Contest Rules modal shows a clearly marked placeholder until the founder writes the rules and counsel reviews them (Decision Log #413, #227).

**7.7 Incident-response and breach plan.** WHO: COUNSEL, FOUNDER. ROW: B-253. A draft exists (`docs/incident-response-and-breach-notification-plan-draft.md`). Counsel review it; the founder names the roles (the draft uses placeholders). It is required before any real child's data is processed (recommendation recorded under Decision Log #426; not yet decided as a rule). Open decision inside it: whether a guardian is told when a child's sign-in is locked (Decision Log #438; options are listed in the draft, none chosen).

**7.8 Penetration test.** WHO: FOUNDER. ROW: B-254. Timing was adopted (after staging is live, after 2FA and image screening exist, before launch). The scope brief is `docs/pen-test-scope-brief-draft.md`. **NOT DECIDED (QUESTION F5): vendor, budget, scope sign-off, severity scale, what "resolved" means, retest window.** The Definition-of-Done item "no open High or Critical security finding" (Decision Log #448) cannot be ticked until this has run.

**7.9 Cloudflare paperwork (only if Cloudflare is used).** WHO: COUNSEL. ROW: B-251. See step 8.1.

---

## Part 8 - Switches and optional services

**8.1 Cloudflare proxy and origin lock.** WHO: FOUNDER decides; AGENT/FOUNDER build. ROW: B-251, Decision Log #424, #449. ADOPTED in principle (free plan, in front of the API and both static sites, origin locked so Render accepts only the proxy); built at the launch gate because it needs the domains. **QUESTION F4 ANSWERED 2026-11-14 (Decision Log #518): the founder defers the Cloudflare proxy and origin lock until AFTER launch; the Render DNS records stay DNS-only (step 2.3) and this step waits (B-251 stays open after launch).** Reason on record: Render's inbound IP rules need a Scale or Enterprise workspace plan, so without that plan the lock cannot be enforced (a security-session finding, not verified here). [Earlier text: NOT DECIDED (QUESTION F4): whether to go ahead now.] Facts to know first: (a) Render's per-service inbound rules were described as needing a Scale or Enterprise workspace, while the services here use Free and Starter, so the origin lock may not be possible on these plans (unverified; `docs/cloudflare-processor-and-cross-border-draft.md`); (b) the proxy would see sign-in data, tokens and minors' content in transit, and contradicts the Privacy Policy draft's statement that no third party receives the registration IP; counsel decide (`docs/cloudflare-processor-and-cross-border-draft.md`); (c) after it is on, repeat the two-network check (step 6.3). If used, a short written procedure from Cloudflare's current documentation is added to this runbook on the day. The static sites' header policy in `render.yaml` can move to the proxy if wanted.

**8.2 Web push.** WHO: FOUNDER, AGENT. ROW: B-285, B-062. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (step 3.4). The web site's `/sw.js` must be served as JavaScript with `Cache-Control: no-cache`, outside the catch-all rewrite, over https, with `worker-src 'self'` (`docs/deployment.md`; `render.yaml` sets the cache header and CSP). **Done when a test push from staging reaches a real browser.** Not verified in any real browser.

**8.3 Email.** WHO: FOUNDER. ROW: Decision Log #17, B-115, Decision Log #541. **Postmark approval must be through before any outside person signs up on production (a pending-approval account only delivers to the From domain, step 1.5).** Set `EMAIL_PROVIDER_API_KEY` and `POSTMARK_FROM_EMAIL` (verified domain). YOU SHOULD SEE: a registration verification email arrive. Note: if `WEB_APP_BASE_URL` is unusable the app sends no emails at all that contain links; the password-reset placeholder-address fallback is already fixed (B-115, PR #633; `docs/deployment.md` still says otherwise, see the report). Postmark live delivery has never been exercised.

**8.4 Stripe, MaxMind, Rekognition keys.** See steps 1.6, 1.7, 1.9 and 6.12. With no AWS keys nothing is auto-approved; with no Stripe keys the under-13 US card step answers 503 (fails closed).

**8.5 Video (ffmpeg).** WHO: AGENT; FOUNDER reads the result. ROW: B-306, B-238, B-257, B-322, Decision Log #527. ANSWERED (QUESTION F15): the API now runs as a Docker image that carries ffmpeg and ffprobe (Debian ffmpeg 5.1.9; step 4.5), so video upload no longer fails closed for lack of them. What is still open is only whether Render's free plan accepts the Docker runtime for staging (step 4.5) and a real video upload on staging (step 6.15). If ffmpeg or ffprobe were ever missing, video upload would answer 503 and store nothing (`FFMPEG_PATH`, `FFPROBE_PATH`, `modules/post-media/README.md`); pictures need neither.

**8.6 `ADMIN_2FA_ENFORCED`.** Set to exactly `true` on production at launch (B-267 (j)). Any other value is off. Do it only after the first production superadmin has enrolled the day-one way (step 9.5) or have the recovery document ready (step 6.2).

**8.7 `MEDIA_UPLOADS_ENABLED`.** WHO: FOUNDER. ROW: B-306, B-267 (l), B-206, B-321, B-322. Leave it unset in production until BOTH parts of the launch condition are met (Decision Log #524, amended by #529; counsel's written answer is NOT a condition, step 7.5 is non-blocking), then set it to exactly `true`. (a) The suspected-illegal-imagery reporting path has been tried once on staging (step 6.14: a test file set aside, a record opened, a filing recorded, and the file still present after the test account is deleted; the same for a profile picture and a cover photo). (b) Video works on staging with a real upload (step 6.15). The founder's own registrations with the receiving bodies (the US NCMEC CyberTipline, the UK body) are NOT a condition: that part was removed on 2026-11-17 (Decision Log #529). The founder accepts that, until he registers, there is no prepared route to file a report of what looks like abuse imagery, and he accepts launching before hash-matching exists; both are his own risk decisions, not counsel's view. While off: pictures, videos, profile picture, cover photo and Contest final entries cannot be uploaded (the API answers 403 `media_uploads_disabled`); text posts, reading, reporting and staff uploads still work. The web composer shows "Uploads aren't available right now."

**8.8 Highlightly budget.** `HIGHLIGHTLY_DAILY_REQUEST_BUDGET` stays 100 (free tier). Revisit only after real usage (Decision Log #323).

**8.9 Switches summary.** `ADMIN_2FA_ENFORCED` (exact `true`), `MEDIA_UPLOADS_ENABLED` (exact `true`, only after the launch condition in step 8.7). Every other tuning value is a plain default in `render.yaml`.

---

## Part 9 - Going live (FOUNDER, AGENT)

Do not start until: Parts 5 to 7 are GATE-passed, no tagged string remains (step 7.1), Postmark approval is through (step 1.5), and the founder has said go.

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
7. If uploads are on: upload a picture; it appears only after the check; the approved picture is served from `media.soccernity.com`, and the private bucket has no public address (step 6.8).
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

**12.3 GitHub repository settings and visibility.** WHO: FOUNDER. ROW: B-267 (g), Decision Log #441 (e). Secret scanning with push protection, Dependabot alerts and security updates, code scanning (CodeQL) and the required checks on `main` (Analyze, dependency-audit, build-and-test) were turned on 2026-10-29 as the founder reported them. **ANSWERED 2026-11-14 (Decision Log #519, QUESTION F7): the repository stays PUBLIC until launch, the `Analyze` required check stays required until then, and the question is asked again at the launch gate** (reason on record: code scanning on a private repository needs a paid GitHub product; the price was not confirmed). **Before you make the repository private:** [earlier text] NOT DECIDED (QUESTION F7): secret scanning and code scanning are free on public repositories only (price not confirmed); the required check "Analyze (javascript-typescript)" would stop uploading and block every merge; options are to pay, or remove Analyze from the required checks and add a free scanner, or keep it public. Making it private removes no existing clone: treat any secret ever committed as exposed and rotate it. Also set the two GitHub secrets for step 10.1.

**12.4 Pen test findings.** Fix and retest (step 7.8).

**12.5 Nightly jobs to know about.** They run on their own: rejected-media and stray-file sweep (04:00; the first night, set `POST_MEDIA_STRAY_SWEEP_DRY_RUN=true` so it only counts; B-283 needs the R2 token to LIST), account anonymisation sweep, report and message retention, Contact Us retention, consent expiry, age reclassification, leaderboard rollups. Their settings are plain values in `render.yaml`.

**12.6 Detection layer for illegal imagery (B-323; NOT BUILT, after launch).** WHO: FOUNDER first. ROW: B-323, Decision Log #526. After launch, Soccernity adds automatic matching of uploaded images against lists of known illegal images. The order decided: apply to the IWF for Image Intercept first (UK); if that is not granted, apply to Hive as the fallback. PhotoDNA and the Cloudflare scanning tool are NOT used (dropped). The Cloudflare tool was dropped because it sees only images, only after they are published, needs Cloudflare's cache in front of `media.soccernity.com` (which would reverse Decision Log #518) and does not cover video; PhotoDNA was dropped by the founder and no reason was stated (Decision Log #526). The applications are the founder's own step and are not started by this runbook; nothing is built until an application is accepted. Until then the reporting path in step 6.14 and the manual set-aside are the only controls, and the founder has accepted that risk (Decision Log #524). IF the founder is asked in writing by counsel or a regulator to add matching sooner, bring this step forward.

---

## One-page checklist

| Step | Who | Row(s) | Done |
|---|---|---|---|
| 1.1 Render account | Founder | B-088, B-179 | |
| 1.2 Neon (pooled + direct strings) | Founder | B-088 | |
| 1.3 Upstash (rediss URL) | Founder | B-088, B-267 (d) | |
| 1.4 Cloudflare + two R2 buckets (one token incl. list) | Founder | B-207, B-265 | |
| 1.5 Postmark + verified domain, and account APPROVAL (pending accounts deliver only to the From domain) | Founder | B-088 | |
| 1.6 Stripe (test keys) | Founder | B-162 | |
| 1.7 MaxMind | Founder | B-024 | |
| 1.8 Sentry DSN | Founder | B-267 (c) | |
| 1.9 AWS, opt-out first, then Rekognition | Founder | B-193, B-036 | |
| 1.10 Highlightly key | Founder | B-090 | |
| 1.11 DNS access in Cloudflare | Founder | B-249 | |
| 2.1-2.2 Custom domains + DNS | Founder | B-249, B-179 | |
| 2.4 `www` decision | Founder | F17 | |
| 3.2 Six secrets generated | Founder | B-018, B-252 | |
| 3.3 DOB key backed up | Founder | B-252, B-272 | |
| 3.4 VAPID pair | Founder | B-285 | |
| 4.1 Blueprint imported | Founder | B-179, R70 | |
| 4.2 37 values entered per API | Founder | B-018 | |
| 4.6 Restart the staging API five times: country database fetched each start (PASSED on staging 2026-11-21; repeat on production) | Founder | B-024, B-322, B-267 | |
| 5.2 Migrations ran on staging | Founder, agent | B-018 | |
| 5.3 Staging /health green | Founder | B-090 | |
| 5.5 First superadmin created (command: docs/first-superadmin.md) | Founder | B-090, B-319 | |
| 6.1 DOB rotation rehearsal | Agent, founder | B-267 (k), B-272 | |
| 6.2 Admin 2FA on staging + recovery read | Founder | B-267 (j), B-270 | |
| 6.3 TRUST_PROXY_HOPS two-network check | Founder, agent | B-267 (b) | |
| 6.4 Country database | Agent | B-024 | |
| 6.5 Cookie sign-in on real names | QA | B-267 (a), (h), (i) | |
| 6.6 Sentry alert rules | Founder | B-267 (c) | |
| 6.7 Upstash plan check | Founder | B-267 (d) | |
| 6.8 R2 CORS + private bucket refused | Founder, agent | B-265, B-207 | |
| 6.9 Sports data live | Agent | B-090 | |
| 6.10 Full Playwright run clean | QA | B-134, B-219, B-267 (e) | |
| 6.11 B-221, B-106, B-055 checks | QA | B-221, B-106, B-055 | |
| 6.12 Under-13 end to end (staging, Stripe test keys) | QA | B-162 | |
| 6.14 Suspected-imagery reporting path tried on staging (post picture, profile picture, cover) | Agent, founder | B-206, B-321 | |
| 6.15 Video on staging with a real upload | QA, founder | B-322, B-238 | |
| 6.16 Static-site headers, `/sw.js`, CSP | Agent, founder | B-179, B-180 | |
| 7.1 No tagged strings remain (R108) | Counsel, agent | B-124, B-208, B-301 | |
| 7.2 Legal copy | Counsel | B-089, B-159 | |
| 7.3 DPIA + addenda | Counsel | B-159, B-236, B-241 | |
| 7.4 Withdrawal wording | Counsel | B-200 | |
| 7.5 Suspected-imagery questions for counsel (NON-BLOCKING) | Counsel | B-206 | |
| 7.6 Contest Rules copy | Founder, counsel | B-220 | |
| 7.7 Incident plan | Counsel, founder | B-253 | |
| 7.8 Pen test | Founder | B-254 | |
| 8.1 Cloudflare proxy: WAITS until after launch (Decision Log #518) | Founder | B-251 | |
| 8.2 Web push test | Founder, agent | B-285 | |
| 8.3 Email live | Founder | B-115 | |
| 8.5 Video / ffmpeg (Docker image; checked in 6.15) | Agent | B-306, B-322 | |
| 8.6 ADMIN_2FA_ENFORCED = true | Founder | B-267 (j) | |
| 8.7 MEDIA_UPLOADS_ENABLED (after the two-part launch condition: 6.14, 6.15) | Founder | B-306, B-267 (l), B-206 | |
| 9.1-9.7 Go live | Founder, agent | B-090 | |
| 10.1-10.3 Smoke tests | Founder, QA | B-090 | |
| 12.1 Dependabot re-enabled | Founder | B-267 (f) | |
| 12.3 Repo visibility: keep public until launch, ask again at the gate (Decision Log #519) | Founder | B-267 (g) | |

## Founder questions still open

- **F2** ANSWERED 2026-11-20 (Decision Log #537): Render rejects `preDeployCommand` on the free plan, so staging is `plan: starter`, same as production; the free-plan Docker question no longer applies. (steps 4.1, 4.5, 5.2)
- **F3** ANSWERED 2026-11-14: First superadmin: the command `create-first-superadmin` now exists (PR #787, B-319, `docs/first-superadmin.md`); the founder runs it. (step 5.5) [Earlier question: there is no command in the repo to hash the password.]
- **F4** ANSWERED 2026-11-14 (Decision Log #518): deferred until after launch; DNS stays DNS-only. (step 8.1; B-251)
- **F5** Pen test: vendor, budget, scope sign-off, severity scale, retest window. (step 7.8; B-254)
- **F7** ANSWERED 2026-11-14 (Decision Log #519): keep public until launch, Analyze stays required, ask again at the launch gate. (step 12.3)
- **F8** Stripe at launch: test keys only, or live? (step 1.6)
- **F10** ANSWERED IN PART 2026-11-14 (Decision Log #520, #521): the public address is the custom domain `media.soccernity.com`, not `r2.dev`, and there are two R2 buckets (public and private). STILL OPEN: the exact S3-endpoint host for the CSP (it holds the Cloudflare account id), and whether the account that holds the DNS for soccernity.com is the account that will hold the R2 buckets. ALSO UNPROVEN: R2's copy of a file from the private bucket to the public one when it is approved (Cloudflare's page lists CopyObject but is silent on cross-bucket; the API falls back to copying through itself, with a logged warning; the first real approval on staging is the test). (step 6.8)
- **F13** ANSWERED 2026-11-14 (Decision Log #517): free plan until full launch, pay-as-you-go when real users start coming on. (step 6.7)
- **F15** ANSWERED 2026-11-15 (Decision Log #527): the API runs as a Docker image that carries ffmpeg and ffprobe. The free-plan Docker question no longer applies: staging is Starter (Decision Log #537). (steps 4.5, 6.15, 8.5)
- **F17** Does `www` redirect to the root, and how? (step 2.4)
- **F19** Same-site Playwright run on real domains: no written procedure exists. (step 6.10)
- Also open and owned by counsel or the founder, not by this runbook: Postmark account approval (a launch gate before any outside person signs up on production, step 1.5, Decision Log #541), the 53 tagged places left in the legal draft (B-124), counsel's non-blocking questions on suspected illegal imagery (step 7.5, B-206), B-220, B-253, the DPIA and legal copy sign-off, the withdrawal wording (B-200), and the incident-plan question on guardian lockout notices (Decision Log #438).

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
| `MEDIA_UPLOADS_ENABLED` | exact `true` to allow uploads | step 8.7 (after the launch condition) |
| `EMAIL_PROVIDER_API_KEY` | Postmark server token | step 1.5 |
| `POSTMARK_FROM_EMAIL` | sender on a verified domain | step 1.5 |
| `SPORTS_DATA_API_KEY` | Highlightly key | step 1.10 |
| `SPORTS_DATA_RAPIDAPI_HOST` | blank for a direct account | step 1.10 |
| `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | R2 PUBLIC bucket name, and that environment's token (staging and production differ: `soccernity-staging-public` and its own token on staging, `soccernity-media-public` and its own token on production) | step 1.4 |
| `S3_PRIVATE_BUCKET` | R2 PRIVATE bucket name (`soccernity-staging-private` on staging, `soccernity-media-private` on production; no public address; production refuses to start without it) | step 1.4 |
| `S3_ENDPOINT` | `https://<account-id>.eu.r2.cloudflarestorage.com` (the buckets are in the EU jurisdiction; same on both environments) | step 1.4 |
| `S3_PUBLIC_BASE_URL` | the custom domain on that environment's public bucket only: `https://media.staging.soccernity.com` on staging, `https://media.soccernity.com` on production | step 6.8 |
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

Every Wave 11 and Wave 12 row is either a step above, or noted as built and needing only the check named: B-088, B-089, B-090, B-124, B-134, B-159, B-162, B-179, B-180, B-189 (typographic club marks only, no licence sought; nothing to do), B-193, B-200, B-206 (steps 6.14, 7.5, 8.7), B-207, B-208, B-219, B-220, B-221, B-231 (built; no launch step), B-235 (video upload decision record; see 8.5), B-236, B-241, B-265, B-267, B-273 (QA harness fix, built), B-285, B-321 (suspected-imagery reporting path; built; tried once in step 6.14), B-322 (API Docker image; built; steps 4.5 and 6.15), B-323 (detection layer after launch; NOT built; a founder application step, step 12.6); and B-242, B-243 (API security headers; built in the API; the matching headers on the two static sites are in `render.yaml` and unverified, see step 4.1), B-244 (global rate limit; built; its in-memory counters per instance matter if a second API instance is ever added), B-245 (cookie session API; built), B-246 to B-248, B-250, B-252, B-255, B-256, B-262 to B-264, B-268, B-269, B-272 (built; checked in 6.1 to 6.5 and Part 12), B-249, B-251, B-253, B-254 (steps 2, 8.1, 7.7, 7.8). The full coverage table, with rows left out and why, is in `docs/launch-gate-runbook-report.md`.
