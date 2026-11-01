# Penetration test - scope brief (DRAFT)

**Status:** DRAFT, 2026-10-31. Written for the founder to take to a penetration-test vendor. It is a working brief, not a legal document, a contract or a quote. Nothing in it has been agreed with a vendor.

**What is decided and what is not.** Decision Log #451 adopts the *timing* (after staging is live and after two-factor authentication and image screening exist, before launch). Scope sign-off, the vendor and the budget are **OPEN** and are left as marked blanks below (`FOUNDER TO FILL`). Findings feed the Definition of Done item adopted in Decision Log #448 (Build Plan Section 7): *"No open High or Critical security finding; penetration-test findings resolved"*. Register row: B-254 (`docs/build-register.md`).

**Where the facts come from.** Every statement of fact below was read from this repository on 2026-10-31 (`origin/main` `d6d13c3`); the file or Decision Log entry is named next to it. Things that are *planned* rather than built are labelled **PLANNED**. The platform is **not live**: there is no staging yet, Render is not connected, and nothing here has been tested against a real deployment. If the code and this brief disagree when the test starts, the code wins and this brief should be corrected.

---

## 1. Purpose and timing

Soccernity is a football community platform for grassroots players, **including children**. The test should answer one question: *can an attacker, or a user acting outside their permissions, read or change data they should not, take over an account, or get around a safeguarding control?*

**Timing (Decision Log #451, adopting the recommendation in #427):** after staging is live, and after two-factor authentication and image screening exist, before launch.

**Preconditions, and their state on 2026-10-31.** The test should not start until all are true.

| Precondition | Register rows | State on 2026-10-31 |
|---|---|---|
| Staging live | B-090 (launch gate), B-179, B-249 | **Not met.** Render is not connected; `render.yaml` defines only the two API services; the static sites and the custom domains are not set up (Decision Log #409, #437). |
| Two-factor in force for users and admins | B-086, B-270 (backend), B-087, B-111, B-271 (screens) | **Not met.** The backend is built (PRs #564, #565, `services/api/src/modules/two-factor/README.md`); no user or admin screens exist yet, so `ADMIN_2FA_ENFORCED` is off by default and turning it on today would leave the Admin Console unable to sign in (build-register B-271). It must be `true` on the staging that is tested. |
| Image screening | B-036 | **Built in code, not wired.** The automatic image and video check (Amazon Rekognition) is built (`services/api/src/modules/post-media/README.md`); it needs an AWS account and keys that do not exist yet (Decision Log #430). |

## 2. System overview (what the tester will meet)

From `README.md`, `render.yaml`, `docs/deployment.md`, Decision Log #26, #391, #409, #437 and the code:

- **API:** NestJS (Node.js, TypeScript) in `services/api`, one modular monolith. Planned host: Render, Frankfurt region (Decision Log #391).
- **Web app and Admin Console:** two React single-page apps, `apps/web` and `apps/admin`. **PLANNED** as two separate Render static sites (Decision Log #409), each on its own https origin.
- **Planned domains (Decision Log #437):** production `soccernity.com` (and `www`), `admin.soccernity.com`, `api.soccernity.com`; staging `staging.soccernity.com`, `admin.staging.soccernity.com`, `api.staging.soccernity.com`. All under one registrable domain, which the host-only SameSite=Strict cookie needs.
- **Data stores:** PostgreSQL (Neon, EU) through Prisma; Redis (Upstash, EU) for refresh tokens, password-reset and email-verification tokens, rate-limit counters, two-factor challenges (`services/api/src/modules/auth/token/refresh-token.store.ts`, `modules/admin/token/admin-refresh-token.store.ts`, `password-reset/reset-token.store.ts`, `registration/email-verification/email-verification-token.store.ts`).
- **Object store:** Cloudflare R2 (S3-compatible) for user media (Decision Log #307, #419).
- **Third parties the API talks to:** Stripe (a card step for under-13 guardians in the US band), Postmark (email), Amazon Rekognition (image and video check), MaxMind GeoLite2 (a local database file, country from IP), Sentry (errors), Highlightly (sports data).
- **Edge:** **PLANNED**, not built: a free-plan Cloudflare proxy with an origin lock (Decision Log #449, build-register B-251).
- **Two audiences with separate authentication.** User accounts and Admin Console accounts use different tables, different JWT signing secrets (`JWT_SECRET`, `ADMIN_JWT_SECRET`), different cookies and different Redis key namespaces (`services/api/src/modules/admin/README.md`).
- **Roles:** user accounts have `role` on the user; admin accounts are `editor`, `moderator` or `superadmin` (`AdminUser.role`).

## 3. In-scope surfaces

For each surface: what exists, and what a tester should try to break. The list is a proposal for sign-off (Section 4 for what is out).

### 3.1 API authentication and sessions

What exists:

- **Cookie session mode is the default for browsers** (build-register B-245, B-248; `services/api/src/session-cookie/session-cookie.ts`). A request is in cookie mode when it carries `X-Auth-Mode: cookie` **or** an `Origin` header on the exact-origin allowlist the CORS layer uses (`WEB_APP_BASE_URL`, `ADMIN_APP_BASE_URL`, plus localhost outside production).
- In cookie mode the refresh token is an `HttpOnly`, `Secure`, `SameSite=Strict`, host-only cookie (no `Domain`) and is **not** in the response body. User cookie: `sn_rt`, `Path=/auth`. Admin cookie: `sn_admin_rt`, `Path=/admin/auth`. The access token is in the body and is kept **in memory** by the apps, never in `localStorage` or `sessionStorage` (build-register B-246, B-247).
- A request with **no** `Origin` (native clients, scripts) and no header gets body tokens instead. A foreign origin without the header also gets body mode, never a cookie.
- Refresh and logout in cookie mode read the cookie and never the body; a missing or non-allowlisted `Origin` there is a 403.
- Refresh tokens rotate on every use; replaying a consumed token revokes the whole token family (reuse detection window 5 minutes, `REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS`, `ADMIN_REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS`). Access tokens are valid for 15 minutes by default (`JWT_ACCESS_TTL_SECONDS=900`, `ADMIN_JWT_ACCESS_TTL_SECONDS=900`); user refresh tokens 30 days, admin 7 days (`.env.example`). The admin cookie is a session cookie (it ends when the browser closes, PR #541), but the server-side refresh record still lives up to 7 days.
- The JWT payload carries only `{ sub, role }` (safeguarding state such as `isMinor` is never in the token and is re-read from the database on each check, Build Plan Section 5.7).
- CORS: exact-origin allowlist, credentials allowed, no wildcard (`services/api/src/cors-options.ts`). Production refuses to boot on an unset or invalid origin variable, a placeholder or duplicate JWT secret, or an invalid `DOB_ENCRYPTION_KEY` (`services/api/src/validate-runtime-env.ts`).

Try: forged and cross-audience tokens (user token on admin routes and the reverse, user cookie at the admin refresh path); cookie scope and attributes on the real domains (the check is B-267 item (a)); getting a cookie or a body refresh token from a foreign `Origin`; missing, null and spoofed `Origin`; reusing a rotated token from a second client; token fixation; logout and "all sessions" revocation; behaviour after deactivation, suspension and deletion; the refresh-gate for an admin without two-factor when enforcement is on (`admin_two_factor_enrolment_required`); account lifecycle routes that bypass a second factor (reactivation was one such path and now returns a challenge).

### 3.2 Two-factor authentication (users and admins)

What exists (`services/api/src/modules/two-factor/README.md`, `two-factor.constants.ts`):

- Authenticator-app TOTP, SHA-1, 6 digits, 30-second step, one step either side; a code from a step already used is refused. User two-factor is **optional**; admin two-factor is **mandatory before launch** and enforced by `ADMIN_2FA_ENFORCED` (Decision Log #446, #447).
- The TOTP secret is stored only as ciphertext, encrypted with the **same key as the date of birth** (`DOB_ENCRYPTION_KEY`).
- 10 backup codes, 10 characters each, letters and digits without `0 O 1 I`, stored as argon2 hashes, single use; the check always runs 10 hash verifications so timing does not reveal how many are left.
- Sign-in answers a challenge (5 minutes) instead of a session for an enrolled account; admin enrolment at sign-in uses an enrolment token (10 minutes). Five wrong codes lock code entry **for that account** for 15 minutes (a known consequence: someone who knows a password can keep the owner's code entry locked); per-IP limits on code routes (users 30, admins 10 per 15 minutes).
- A superadmin can reset another admin's two-factor (never their own); the last-superadmin recovery is a documented database step (`docs/admin-two-factor-recovery.md`).

Try: code brute force across accounts and IPs; the account-lock denial of service; replay; challenge and enrolment token misuse and expiry; backup-code reuse and enumeration; downgrade (turning two-factor off without the password); the recovery paths; TOTP secret exposure through any response or log; behaviour when Redis is down (second-factor sign-in is unavailable, accepted in Decision Log #439).

### 3.3 Lockout, rate limits and the Redis-outage behaviour

What exists (the numbers are defaults in code, held in configuration; sources `modules/auth/rate-limit/auth-limits/auth-limits.constants.ts`, `rate-limit/global-rate-limit.constants.ts`, `.env.example`):

| Control | Default |
|---|---|
| Sign-up | 30 per 10 minutes per IP |
| Login, failed attempts | 5 per 15 minutes per **account-and-IP pair**; ceiling 20 per 24 hours per account across all IPs; ceiling 60 per 10 minutes per IP |
| Forgot password | 3 per hour per email (real or not); the per-IP ceiling above |
| Admin login | 5 per 15 minutes per IP |
| Global, signed-in | 120 per minute per user |
| Global, anonymous | 600 per minute per IP |
| Global writes | 30 per minute (the sign-in routes are exempt from this class) |
| Byte-passing upload routes | 10 per 10 minutes |
| Token refresh | 240 per minute per IP; 10 per minute per refresh token |
| Guardian withdrawal routes | 5 attempts per 15 minutes per IP |

- A lockout notice email goes to the account owner at most once per 24 hours. Responses are identical for real and unknown accounts.
- **If Redis is unreachable:** the sign-in limiters fall back to per-instance in-memory counters and report to Sentry; the global limiter is in-memory and fails open; but every Redis-backed token store has **no fallback**, so sign-in, refresh, registration and password reset are unavailable until Redis returns (Decision Log #433, #439). Behind several API instances each instance counts alone, so the limits are looser by the number of instances.
- Real client IPs depend on `TRUST_PROXY_HOPS` being right behind Render (and Cloudflare once added); the check is B-267 item (b).

Try: bypassing each limit (header spoofing, IPv6 rotation, many accounts from one IP, one account from many IPs, parallel requests against the reserve-then-release logic); user enumeration through timing or response differences on login, forgot-password, registration, resend-verification and the guardian routes; abusing the lockout against a victim; behaviour under a Redis outage.

### 3.4 Admin Console

What exists:

- Separate login, tokens and cookie (3.1). Role gates (`AdminRolesGuard`): `editor` (articles, categories, media), `moderator` (moderation, platform-user management, held-account views), `superadmin` (everything, plus staff management, two-factor reset, child-safety vetting). Roles are read from the token; **child-safety vetting is read fresh from the database on every call** and gates reports and media that concern minors for any role (Decision Log #430; a non-vetted admin gets the same 404 as for a missing item).
- Routes include: `/admin/users` (list, suspend, immediate delete, `GET /admin/users/:id` with a date of birth decrypted on the server and an audit row written for every view, `POST /admin/users/:id/dob-correction`, username revocation), `/admin/staff` (create admin, role, status, two-factor reset, vetting), `/admin/moderation/*` (reports, appeals, holds, escalation), `/admin/media-review`, `/admin/contact-enquiries`, `/admin/contest/*`, `/admin/media/upload`.
- Admin actions write an audit row in the same transaction (`AdminActionLog`).
- Admin accounts are created by a superadmin or by a direct database insert; there is no self-registration (Decision Log #191).

Try: vertical and horizontal privilege escalation between admin roles and between admin and user; mass assignment on role and status fields; IDOR on report, enquiry, hold and media ids; the vetting gate (a non-vetted admin reaching a minor's report or media by id, search, list filters or counts); stale-token behaviour after a role change or deactivation; the audit trail (can an action leave no row?); CSRF-style attacks given the cookie mode (the refresh and logout routes check `Origin`; other routes use a Bearer token); the date-of-birth read and correction routes.

### 3.5 Upload routes and the public media prefix

What exists (`services/api/src/modules/post-media/README.md`, `docs/backend-w14-media-report.md`, Decision Log #419, #430, #436; build-register B-265):

- Flow: `POST /media/uploads` returns a one-time signed link into a **quarantine** prefix (bound to the declared type and exact length, valid 900 seconds, per-user limits); the browser PUTs the file to the object store; `POST /media/uploads/:id/confirm` verifies size and magic bytes, re-encodes images with all metadata removed (`sharp`), remuxes video with all metadata dropped (`ffmpeg`, no transcoding), writes the processed file to a **private** prefix (`private-media/`) and deletes the original. A background check (Amazon Rekognition; video sampled into frames) approves (the file is then copied to the **public** prefix `post-media/`), rejects (stays private, reason shown) or leaves it for a moderator. Defaults: images jpeg, png, webp up to 10 MB; one video mp4, webm or mov up to 100 MB and 120 seconds; up to 10 files per post (`post-media.config.ts`); HEIC is refused.
- Reports: `POST /media/:id/report`, 20 per account per rolling 24 hours, three reporters hide an item; the author and reviewers read pending files through short-lived (5 minute) signed links.
- A post with any non-approved media is visible to its author only, on every read path.
- Avatars and cover photos: `POST` and `DELETE /users/:id/avatar` and `/users/:id/cover`, multipart through multer (memory storage; multer is pinned to 2.5.0 by an override, with a build-failing guard test against any `fileFilter`), same pending-and-invisible rule until checked.
- Admin media library: `POST /admin/media/upload` (multipart, 50 MB cap, type taken from the reported MIME type against an allow-list, no magic-byte check, `services/api/src/modules/media/media.constants.ts`); it has unit and HTTP tests but no end-to-end spec of its own (B-267 item (e)).
- **Open launch step B-265:** the object store's public address (`S3_PUBLIC_BASE_URL`) must serve `post-media/` only, or the private files must live in a separate bucket. On Cloudflare R2 the public address serves the whole bucket unless a path rule or Worker limits it, and this has **not** been verified against a real bucket. The test should prove a request for a `private-media/` object through the public address is refused.

Try: a private or pending file reachable by URL guessing or by listing; signed-link scope (type, length, key, expiry, reuse); content-type and magic-byte confusion (polyglots, SVG, oversized or malformed video); metadata that survives re-encoding; confirming another user's upload; attaching media you do not own or that is not approved; the check pipeline (inputs that crash it, race between approve and withdraw, a rejected file that is later served); report-limit and hold-threshold abuse; object-store CORS rule for PUT; the admin upload route; path traversal in names.

### 3.6 Guardian-consent token flows

What exists (`services/api/src/modules/auth/guardian-consent`, Build Plan Section 8.3):

- The guardian has no account; **the emailed token is the credential.** Routes under `/auth/guardian-consent`: confirm, decline, resend, change-guardian-email, report-incorrect-details, withdraw/request, withdraw, status, request-summary (token in the `X-Consent-Token` header), and the card step (`verification`, `card/intent`, `card/complete`). Consent link validity 72 hours by default; the withdrawal token is single use (72 hours).
- A guardian may decline up to three times; the third decline, an unanswered request that lapses twice, or a withdrawal closes the account (30-day deletion grace). Responses on the withdrawal request are identical for every outcome; the guardian routes are rate-limited (withdrawal routes 5 per 15 minutes per IP).
- For a US guardian of a child under 13 the email link is not enough: a card step charges a small amount through a Stripe PaymentIntent, re-read from Stripe by the server (never trusted from the client), and refunded. Card data goes browser to Stripe and never reaches the API.
- A consent record is snapshotted (screen version, coarse device type) before the guardian row is deleted at account anonymisation.

Try: token guessing, reuse after use or expiry, cross-minor use, confirm-after-decline, race conditions between confirm, decline and withdraw, enumeration of minors or guardians through any route, the card step with a tampered or replayed PaymentIntent, skipping the card step, header injection through `X-Consent-Token`, email-link construction (`WEB_APP_BASE_URL` handling).

### 3.7 Age-gate bypass and the restrictions on minors

What exists:

- Date of birth is collected once at the Age Gate, is **read-only afterwards**, and the API refuses sign-up below age 5 with `400 below_minimum_age`. A minor (under 18) is restricted-pending until the guardian confirms; every social write route needs consent, with a build-failing test that pins the guard table (`services/api/src/write-route-guards.spec.ts`). Under-16 accounts have extra restrictions (no direct messages, no Banter Rooms, no creating Community Groups; Decision Log #346). An adult cannot start a direct-message conversation with a minor; the refusal is the same 404 as for a missing user, with equal database work (Decision Log #347, #350).
- Country is **derived from the request IP** with a local GeoLite2 database and is authoritative; the IP is never stored; a declared country is only a fallback (build-register B-023 to B-025, Decision Log #368). An unresolved lookup applies the stronger control.
- A daily job re-classifies accounts as they age (Decision Log #349). Date-of-birth correction is an audited admin action that re-runs the age checks.
- Known and accepted: the date of birth is self-declared, so a child can lie at sign-up (inherent to self-declaration).

Try: reaching a restricted write as a pending minor by any route (including admin-adjacent and notification routes); sending a falsified country or forcing an unresolved lookup to avoid the card step; changing the date of birth or age tier after sign-up; getting around the adult-to-minor block (timing, enumeration, group routes); the under-16 restrictions through Banter, Community Groups and messaging.

### 3.8 Minors' data: date-of-birth encryption and exposure

What exists:

- `User.dateOfBirth` is stored as ciphertext: AES-256-GCM, `v<N>:<iv>:<tag>:<ciphertext>`, key `DOB_ENCRYPTION_KEY` (32 bytes), key rotation by a script (`docs/dob-encryption-rollback.md`, Decision Log #362, #447). The TOTP secrets share the key.
- `GET /users/:id` is **self-only**; `GET /users/:id/public-profile` returns a public name, bio, approved avatar and, for a minor, the guardian contact. Public names are the username or "Soccernity member"; the real display name is not exposed to other users. Restricted-pending minors are absent from rosters, follower graphs and people search.
- Roster and search cursors page by username, not display name (build-register B-034).

Try: any route or error that returns the date of birth, the decrypted secrets, the real display name, an email, a guardian contact beyond the intended view, or the existence of a restricted account; ciphertext handling (tampering, version downgrade, error messages); pagination cursors and sort keys as an information leak.

### 3.9 Access control on other people's objects (IDOR)

Cover, at least: profiles and the public-profile view; conversations and messages (participants only); saved posts (private); notifications; follows and blocks (a block must not reveal itself, and a blocked user gets the same 404 as for a missing one); posts, comments, hidden comments, comment settings; Banter Rooms, Community Groups, clubs, Grassroots teams and fixtures (organiser-only writes); contest entries and votes; contact enquiries; media; admin objects (3.4).

### 3.10 Edge setup and headers

- **Built:** the API sends `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, HSTS in production, `Referrer-Policy: no-referrer`, no `X-Powered-By` (`services/api/src/security-headers.ts`); CORS as in 3.1.
- **PLANNED, to be tested once built:** the static-site headers and strict CSP for `apps/web` and `apps/admin` (Decision Log #450; input `docs/security-headers-csp-audit-report.md`), and the Cloudflare proxy with an origin lock (Decision Log #449). The origin lock means the Render origin must refuse traffic that does not come through the proxy; the test should try the origin directly. DNS records stay "DNS only" until the proxy is built (Decision Log #437).
- Real client IPs (`TRUST_PROXY_HOPS`) must be re-verified after the proxy is added (Decision Log #429).

### 3.11 Secrets and configuration

Boot checks on `JWT_SECRET`, `ADMIN_JWT_SECRET`, `DOB_ENCRYPTION_KEY`, `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL`; a build check that every environment variable read in code is declared in `render.yaml` (`env-completeness.spec.ts`); error and log content (no tokens, secrets, dates of birth or addresses); Sentry configuration (a no-op until a real DSN is set).

## 4. Out of scope

**TO BE AGREED with the founder and the vendor.** Candidates to confirm or strike (not decided):

- The third-party services themselves (Render, Neon, Upstash, Cloudflare, Stripe, Postmark, AWS, MaxMind, Sentry, Highlightly) - only Soccernity's use of them.
- Volumetric denial-of-service and load testing against shared infrastructure.
- Social engineering and phishing of staff or users; physical security.
- `apps/mobile` (no application code exists).
- Production systems (see Section 5).

FOUNDER TO FILL: final out-of-scope list: ______________________

## 5. Test environment and test-data rule

- **Staging only, never production.** The preconditions in Section 1 apply to staging.
- **Seeded synthetic accounts only. Never real minors' data, never real people's data.** The tester is given: a synthetic adult account, synthetic minor accounts in each state (restricted-pending, confirmed, under-16, declined), synthetic guardians with working mailboxes under our control, and synthetic admin accounts for `editor`, `moderator` and `superadmin` (one of the moderators vetted, one not). The QA suite under `e2e/` already seeds users this way and can be a starting point; it is not a security test.
- The card step runs against Stripe's **test** mode only.
- Outbound email goes to controlled mailboxes only.

FOUNDER TO FILL: how the accounts are issued, who owns them, and when they are deleted: ______________________

## 6. Rules of engagement, severity scale and report format

All of this is for the founder to fill. Nothing here is decided.

| Item | Value |
|---|---|
| Test window (dates, hours) | FOUNDER TO FILL |
| Allowed source IPs and who is told | FOUNDER TO FILL |
| Contact and escalation during the test (a person, a channel) | FOUNDER TO FILL |
| What the vendor must stop and report at once (for example access to a child's real data) | FOUNDER TO FILL |
| Allowed techniques / forbidden techniques | FOUNDER TO FILL |
| Data handling by the vendor (storage, retention, deletion of evidence) | FOUNDER TO FILL |
| Confidentiality and who may see the report | FOUNDER TO FILL |
| Severity scale (the Definition of Done item says "High or Critical", so these terms must be defined) | FOUNDER TO FILL |
| What counts as "resolved" for the Definition of Done item (retest passed, or accepted as a risk by the founder) | FOUNDER TO FILL |
| Report format (executive summary, finding template, evidence, remediation advice, CVSS or equivalent) | FOUNDER TO FILL |

**How findings are used.** Findings feed the Definition of Done item (Decision Log #448): the launch gate (B-090) cannot pass while a High or Critical finding is open. Each finding becomes a tracked item; a safeguarding-related finding (anything touching minors' data or the consent controls) is raised with the founder immediately, not at the end.

**Retest.** After fixes, the vendor retests every High and Critical finding (and any others the founder names) and reports each as fixed, partly fixed or not fixed. The retest is part of the engagement, not an optional extra. FOUNDER TO FILL: retest window and what is included: ______________________

## 7. Vendor selection criteria, vendor and budget

Left blank on purpose. No vendor and no figure have been chosen.

| Item | Value |
|---|---|
| Selection criteria (experience with child-safety platforms, accreditation, references, reporting quality, retest included, data handling) | FOUNDER TO FILL |
| Vendor | FOUNDER TO FILL |
| Budget | FOUNDER TO FILL |
| Number of tester-days and timeline | FOUNDER TO FILL |
| Contract and NDA owner | FOUNDER TO FILL |

## 8. Things the tester should be told up front (known, accepted, or open)

So they are not reported as new findings without context, or so the test can check them:

- The date of birth is self-declared (3.7).
- A code lock per account lets someone who knows a password keep the owner's code entry locked for 15 minutes at a time (3.2; Decision Log #447).
- Access tokens already issued stay valid until they expire (15 minutes by default) after a refresh gate or revocation; there is no per-request database check (Decision Log #447).
- The limiters behave as in 3.3 when Redis is down; sign-in is unavailable then (Decision Log #439).
- Rate limits other than the Redis-backed sign-in ones are in-memory per instance (3.3).
- B-265 (the public prefix) is a launch step not yet done or verified (3.5).
- The admin media upload route trusts the reported MIME type (3.5).
- The web app and the Admin Console are single-page apps with no server-side rendering.
- Cloudflare, the static-site headers and the CSP are not built yet (3.10).

## 9. Open points (for the founder)

- Scope sign-off, vendor, budget (Section 7) - OPEN (Decision Log #451).
- The severity scale and the meaning of "resolved" (Section 6) must be fixed before the test.
- Whether Cloudflare is built before the test, so that the origin lock and headers are tested (Decision Log #449 builds it at the launch gate; the order against the test is not decided).
- The incident-response and breach-notification plan (Decision Log #426, B-253) is still OPEN; it is recommended before any real minor's data is processed, and a serious finding during the test would need it.
- Whether admin and the API are both in scope was an open point of #427; this draft proposes both.
