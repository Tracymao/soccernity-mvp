# Soccernity — incident-response and breach-notification plan (DRAFT v0.4)

> **DRAFT FOR COUNSEL REVIEW — NOT APPROVED, NOT LEGAL ADVICE.**
> Produced under build-register row **B-253** (Decision Log **#426**, with **#438** and **#432** / **#433** / **#439** as context;
> v0.2 also reflects **#456**, **#458**, **#459**, **#477**, **#478** and **#479**;
> **v0.3 also reflects #482, #483, #484, #485, #486 and #487; v0.4 also reflects #490, #491, #492, #493 and #494**),
> as a first-pass draft by the `safeguarding-drafter` role. Per `CLAUDE.md` non-negotiable #2 it is never approved by being
> written. Nothing here is a legal conclusion, a decision of the founder, or a statement that counsel agrees to anything.
> **Every section below repeats this marking on purpose**, so a section copied out on its own still carries it.
> Platform status when written (v0.1 2026-10-31, v0.2 2026-11-09, v0.3 and v0.4 2026-11-11): **not live**. No Render, Neon, Upstash, Postmark, Sentry or R2 account exists
> yet (`docs/deployment.md`, B-267), so every "tool" below is a tool *in the code or a document*, not one that has been
> run against a live system.

**Marker used in this file.** `[PLACEHOLDER: …]` = a name, number or address the founder must fill in. `[UNVERIFIED — for counsel]`
= a legal statement I could not confirm from a primary source. `[OPEN]` = a question this draft deliberately does not answer.
**`[v0.2 CHANGED — source]`** = a passage that differs from v0.1; the source is the repo file or Decision Log entry the change
rests on. A reader can find every difference by searching for `v0.2 CHANGED`.
**`[v0.3 CHANGED — source]`** = a passage added or changed in v0.3, with the same kind of source; search for `v0.3 CHANGED`.
**`[v0.4 CHANGED — source]`** = a passage added or changed in v0.4; search for `v0.4 CHANGED`.
Everything not marked is v0.1 to v0.3 text, unchanged. Only a real legal question is marked for counsel; a question for the founder that is not a legal
blocker is marked **[FOR FOUNDER — not a counsel blocker]**.

---

## v0.4 changes (what changed since v0.3, and why)

*Draft for counsel review — not approved, not legal advice.* Refreshed 2026-11-11 against `origin/main` (`e6bcf0e`) for the founder decisions recorded as Decision
Log #490 to #494. The item list with source files is in `docs/dpia-incident-retention-restored-2026-11-11-report.md`. **New wording in this file is tagged
`[COPY PENDING LEGAL REVIEW]` where it is customer-facing; most of it is internal.** Nothing here approves, advances or closes anything; the DPIA's sign-off block
and this plan's counsel questions are unchanged except where stated.

| # | Fact | Where it changed in this file |
|---|---|---|
| 1 | Decision Log **#490**: a report is deleted, with the content it removed, **6 years** after it closes (**7 years** if it concerns a minor). This **replaces** the 12 months and 6 years of #487 in v0.3. The range is the "6–7 years" the legal draft records as counsel's approved retention for moderation cases (v0.7 resolved decision 10); this plan has not seen the advice. The settings are `REPORT_RETENTION_YEARS` and `REPORT_RETENTION_CONCERNS_MINOR_YEARS` (`REPORT_RETENTION_MONTHS` is gone). | §1 (the two reports rows), §4 (pause note), §8.2, §8.4, Q8, Q21 |
| 2 | Decision Log **#493**: when a due report is purged, a hold record that points at it **stays** with its link cleared, and a Contact Us enquiry escalated into it is **detached** and returns to its 12-month clock. A report with an active hold or an escalation is still kept, and keeps its enquiry until it is purged. | §8.4, Q24 (new) |
| 3 | Decision Log **#491**: where the reported sender or any participant of a message report is under 18, only a child-safety-vetted admin may **act** on it (record an action, record an appeal on someone's behalf, decide an appeal), as well as read its context. | §3, §4.10, Q23 |
| 4 | Decision Log **#492**: a suspended person appeals through the public Contact Us page (seventh category "Appeal a suspension"); staff record the appeal on a report suspension; the staff member who records it, and the one who took the original action, may not decide it. | §4.10, Q24 (new) |
| 5 | Decision Log **#494**: no legal-hold check on a suspension is a founder decision; the reinstatement email says nothing about points. | §4.10 |

**Larger store, one honest line.** Because reports are now kept years longer, an incident that exposes the moderation store reaches further back and holds more records
about and by children than v0.3 assumed (§8.4, Q21). Nothing was added to protect it beyond what exists (§1, the reports row).

---

## v0.3 changes (what changed since v0.2, and why)

*Draft for counsel review — not approved, not legal advice.* Refreshed 2026-11-11 against `origin/main` (`0e440bf`) for the
founder decisions of 2026-11-10 and 2026-11-11. The item list with source files is in `docs/incident-plan-v0.3-report.md`.
**New customer-facing wording in this file is tagged `[COPY PENDING LEGAL REVIEW]`.** Build-register row **B-206** (evidence
set-aside, CSAM and statutory reporting) **stays with counsel and is not touched**; this plan only points to it.

| # | Fact | Where it changed in this file |
|---|---|---|
| 1 | Decision Log **#483**, **#484**: a moderator's *Remove Content* on a post, comment or message is **soft** — the row and text stay for staff as evidence; the public copy of any media is withdrawn at once and a **private** copy is kept until the removing report closes. | §1 (two new rows), §4.10 (new), §4.9, §5 steps 1 and 3, §8.2, §8.4 (new), Q22 (new) |
| 2 | Decision Log **#485**: recording *Suspend User* on a report, or suspending from the user page, **suspends the account**, ends its sessions, revokes engagement points, tells the guardian of a minor and **emails the person** with a fixed reason line. | §1, §2, §4.1, §4.6, §4.10 (new), §7.5, §10.7 (new), Q20 (new) |
| 3 | Decision Log **#487**: a report is deleted, with the content it removed, **12 months** after it closes (**6 years** if it concerns a minor); legal holds, active admin holds, escalated reports and B-206 evidence sit outside; the action log is never touched. | §1, §8.2, §8.4 (new), §9.1, Q21 (new), Q8 |
| 4 | Decision Log **#486**: where the reported sender or any participant is under 18, only a child-safety-vetted admin sees a message report's attached context and the edited original. | §1, §3, Q23 (new) |
| 5 | Decision Log **#482**: an active **legal hold** on a message's sender or on any other participant keeps the message out of the 12-month deletion. (v0.2 said a legal hold did not stop the job; that is no longer true.) | §8.2 messages row, Q19 |
| 6 | Stale v0.2 statements corrected where the repository has moved on: `GET /admin/action-log` now exists (PR #607). | §1 closing paragraph, §4.9, §8.2 |
| 7 | Where these appear in the incident roles and the evidence-preservation steps. | §3 (a new paragraph after the role table), §5, §8.4 |

---

## v0.2 changes (what changed since v0.1, and why)

*Draft for counsel review — not approved, not legal advice.* Refreshed 2026-11-09 against `origin/main` so the plan matches
what is decided and built. Only what these five facts require was changed; the full item list with source files is in
`docs/incident-plan-v0.2-report.md`.

| # | Fact | Where it changed in this file |
|---|---|---|
| 1 | Decision Log **#456** settles **#438**: a guardian is told of every security action on a minor's account. | §0, §7.5 (new), §12 Q10 (was "open under counsel"; now settled), §7.4 |
| 2 | **#458** / **#459**: a child-safety-vetted admin can withhold guardian notices; no hold ever notifies a guardian. | §1, §7.5 (new), §12 Q5 and Q18 (new) |
| 3 | Messages are not end-to-end encrypted; a reported message and the context the reporter chose are shown to staff only, with the vetting gate for minors; 12-month retention, held with the report (**#477**, **#478**). | §1, §2, §8.2, §12 Q19 (new) |
| 4 | Email change and two-factor recovery work as the READMEs describe. | §1, §4.1, §4.3, §4.9 |
| 5 | Social sign-in was removed (**#479**). | Searched for any containment or data-held entry: **none existed in v0.1**, so nothing was deleted (see the report). |

---

## 0. How this draft was made, and what it is not

*Draft for counsel review — not approved, not legal advice.*

**Read first** (as the brief required): register rows B-253, B-263, B-267; Decision Log #426 and #438; the legal draft's
Part C row 11 and Privacy Policy §11; the DPIA draft (R10, R11, R12 and §4 rows); `docs/dob-encryption-rollback.md`;
`docs/admin-two-factor-recovery.md`; `services/api/src/validate-runtime-env.ts`; plus the schema, the token stores, the
rate-limiters, `instrument.ts` and `docs/deployment.md` to check what the platform really has.

**What the existing documents already say about this topic** (so counsel sees the starting point, not a blank page):

- Privacy Policy §11 (legal draft) says only: *"[PROPOSAL — technical standard TBD] We commit to encryption at rest, and to a
  breach notification procedure that separately notifies a minor's guardian as well as the affected user."* Part C row 11 and
  row 21 record this as open with counsel.
- DPIA R10 ("Breach impact concentrated on children") records that a breach of `User` exposes email, phone, display name and
  `isMinor` — a flag that **marks which records are children** — and asks counsel whether guardians must be told, not only users.
  DPIA §4 lists "a breach-response plan naming who notifies guardians" as a **[PROPOSAL]** with built-today = **No**.
- Decision Log #426 says the plan is "required before any real minor's data is processed" — a **recommendation, not a decision**.
- Decision Log #438 / #432 (B-263): whether a guardian is told when a minor's sign-in is locked was **open under counsel** in
  v0.1 and decided together with this plan. **[v0.2 CHANGED — Decision Log #456 settles #438; see §7.5 and §12 Q10.]**

**Method for the legal timelines (§6).** Timelines were checked with web search on 2026-10-31 and, where possible, read from the
primary text. What was and was not verified is stated per row. The ICO's own website returned server errors (HTTP 503 and
timeouts) on every attempt to read its guide pages directly, so UK statements rest on the statutory text on legislation.gov.uk
as reported by search and on search-result summaries of the ICO guide, not on a read of the ICO page itself. Nigerian
statements rest on a **read of the official NDPC GAID 2025 PDF**, which quotes Section 40 of the Act; the Act's own text could
not be opened. Counsel should treat every row as a pointer to check, not as confirmed law.

**Not covered.** The US and the EU are listed as questions only (§6.3, §6.4), as instructed. No jurisdiction's law is resolved
for a service whose reach is not yet fixed (Decision Log #4 is the scope question; the legal draft's current baseline is UK GDPR
plus Nigeria's NDPA 2023, with the US and EU as live questions).

---

## 1. What the platform holds (so severity can be tied to it)

*Draft for counsel review — not approved, not legal advice.*

Read from `services/api/prisma/schema.prisma` and the code on 2026-10-31. "At rest" below means what the **application** does;
whether Neon / Upstash / R2 also encrypt storage is a provider matter that is **not verified** (no account exists).

| Data | Where | Protection in the code | What a leak of it alone means |
|---|---|---|---|
| Date of birth | Postgres `User.dateOfBirth` | AES-256-GCM ciphertext (`v<N>:<iv>:<tag>:<ct>`) under `DOB_ENCRYPTION_KEY` (Render env var) | Ciphertext without the key is unreadable. **DB + key together = every date of birth.** |
| Authenticator-app (TOTP) secrets, users and admins | Postgres `User.totpSecretEncrypted`, `AdminUser.totpSecretEncrypted` | Same cipher, **same key** as date of birth | Same as above; with the key, an attacker can generate valid second-factor codes. Backup codes are separate argon2id hashes. |
| Email, phone, display name, username, `isMinor`, `isUnder16`, `accountStatus`, country fields, bio, preferred club | Postgres `User` | **Plain columns** (no application-level encryption) | Identifies accounts; **`isMinor` / `isUnder16` make child accounts filterable** (DPIA R10). |
| Password | Postgres `User.passwordHash`, `AdminUser.passwordHash` | argon2id | Offline guessing only; strength depends on the password. |
| Guardian name, email, relationship; consent status, declined/withdrawn/expired state; consent-screen version; device type; declared country | Postgres `Guardian`, later `ConsentAuditRecord` | Plain columns | Names an adult tied to a child's account — a third party's data, held for a child's sake. |
| Guardian consent token and withdrawal token | Postgres `Guardian.consentToken`, `withdrawalToken` | **Stored as issued** (a random UUID / token), not hashed (hashing not seen in the code) | A DB read yields **live links** that can approve or withdraw a minor's consent until they expire or are used (default 72 hours for the consent link). |
| Direct messages | Postgres `Message.contentText` (and, once a message has been edited, `Message.originalContentText`) | **Plain text** (no application-level encryption); under-16s are excluded from DMs, adults cannot start a thread with a minor. **[v0.2 CHANGED — `services/api/src/modules/messaging/README.md`: messages are NOT end-to-end encrypted; the server stores the text, and the text as first sent is kept after an edit. Deleting a message "for me" or "for everyone" hides it but does not remove the row; only the 12-month retention job does (§8.2). No user can read an original; staff see it only on a reported message (next row).]** | Private conversations, including those between minors. |
| **[v0.3 CHANGED — new row]** Content removed by a moderator (a post, a comment or a message) | Postgres `Post`, `Comment`, `Message`: `removedByModerationAt` and `removedByReportId`; the text, media rows, comments and engagement rows are **not** deleted | Plain columns. `moderation/README.md` "`actionTaken`: `content_removed` is enforced" (Decision Log #483, B-289). The removal is **soft**: every user-facing read treats the item as gone (a removed post disappears from lists, search and counts; a removed comment or message shows a "removed by Soccernity" stub), but **staff reads still return the full text**. Overturning the removing report's appeal restores it. | The content people believe is gone is **still in the database in clear text** until the report retention sweep removes it (§8.4). A database leak exposes it. |
| **[v0.3 CHANGED — new row]** Media of a removed post | Cloudflare R2 `private-media/` (kept) and `post-media/` (public copy withdrawn) | `post-media/README.md` "Media of a post removed by moderation" (Decision Log #484, B-290, B-296): the public object is deleted at removal and a **private copy is kept as evidence** until the removing report **closes** (appeal window lapsed — `REPORT_APPEAL_WINDOW_DAYS`, default 30 — or appeal upheld); then it is deleted, the `PostMedia` row and the post staying. An uploader under an active admin hold, or another unclosed report on the post, keeps it. | Images of children that were taken down but still exist privately. The B-206 evidence rule for **rejected** files is separate and **open under counsel** — not touched here. |
| **[v0.3 CHANGED — new row]** Suspension state | Postgres `User.accountStatus = 'suspended'`; `User.suspendedByReportId` (FK `Report`, `ON DELETE SET NULL`); the audit row | `account-suspension/account-suspension.service.ts`, `moderation/README.md` (B-291, Decision Log #485), `admin-users/README.md`. A suspended account cannot sign in (the generic "Invalid credentials"), its sessions and earned engagement points are revoked, a guardian of a minor is told once, and **the person is emailed** at once (§4.10). | Shows that an account was suspended and *for which report*. A leak of the audit log shows the reason category (`status=suspended; reasonCategory=<key>`). |
| **[v0.3 CHANGED — new row]** Reports and their retention | Postgres `Report` (category, free-text reason, `concernsMinor`, review, appeal and escalation trail) | Plain columns. `moderation/README.md` "Report retention" (Decision Log #487, B-294; **[v0.4 CHANGED — Decision Log #490, B-299: now 6 years, 7 years if `concernsMinor`; v0.3 said 12 months and 6]**): **deleted 6 years after it closes, 7 years if `concernsMinor`** (both configuration, `REPORT_RETENTION_YEARS` and `REPORT_RETENTION_CONCERNS_MINOR_YEARS`; the range is the one recorded as counsel-approved in the legal draft), together with the content it removed (rows and media), by a nightly job. Skipped: an active legal or bad-faith hold on the reporter, the target's account or (for a message) the sender or any other participant; an escalated report; a removed post whose media is not deletable (the B-206 hook). `AdminActionLog` is never touched. **[v0.4 CHANGED — #493, B-299]** A hold record that references the report stays with its link cleared; an escalated Contact Us enquiry is detached. | A report can contain a safeguarding disclosure. Once deleted, the report and the removed content are gone from the platform (only the Neon snapshot or a backup would hold them). **[v0.4 CHANGED]** The store now reaches back 6 to 7 years, so an exposure of it affects far more records than the 12-month figure implied; reports are plain columns with no field-level encryption, and reading a report is not logged. |
| A reported message, and the messages the reporter attached as context | Postgres `Report` (`targetType: 'message'`) and `ReportContextMessage` (`reportId`, `messageId`) | The message text is read from `Message` at the time. **[v0.2 CHANGED — `moderation/README.md` "Reporting a message" and "Context messages" (Decision Log #477, B-286): a reporter may attach up to 20 other messages of the same conversation (10 before, 10 after the reported one). Only staff see them, through `GET /admin/moderation/reports/:id` (moderator, superadmin); a report that concerns a minor is visible only to a child-safety-vetted admin, fresh-checked on every call. The view returns the reported message, its edit original and the chosen context messages, with the sender's public name only; no conversation id, no recipient, no other message.]** **[v0.3 CHANGED — `moderation/README.md` "Vetted-only context" (Decision Log #486, B-293): the gate no longer depends only on `concernsMinor`. For an admin who is **not** child-safety-vetted, the platform also reads `User.isMinor` now for the reported sender and every participant; if any is under 18 the response carries `contextHidden: true`, an **empty** context list and a **null** edit original (it fails closed if a participant has no row). A message report between two children is therefore no longer fully visible to an unvetted moderator. The context messages themselves are not touched by a removal and fall to the 12-month message deletion once no report holds them.]** | Exposes the chosen slice of a private conversation to whoever holds a moderator or superadmin session (and, for a minor's report, a vetted one). |
| "Withhold guardian notices" flag and its reason | Postgres `GuardianNoticeWithhold` (one row per minor's account while ON) | Plain text; the reason is staff-written. **[v0.2 CHANGED — `admin-users/README.md` "Guardian notices" and `guardian-security-notice/README.md` (Decision Log #458): set, cleared and reviewed only by a child-safety-vetted admin (fresh-read, any role); the three changes are logged in `AdminActionLog`; no endpoint a minor, guardian or non-vetted admin can call returns the flag or its reason.]** | The reason may describe a concern about a guardian or household; proposed: treat a leak as S1 (it is a safeguarding record). |
| Email-change requests | Postgres `EmailChangeRequest` (`newEmail` lower-cased, `tokenHash` SHA-256, expiry, `usedAt`) | Link token stored **hashed**, single use, 48 hours. **[v0.2 CHANGED — `email-change/README.md` (Decision Log #476).]** | A pending new address; the token itself is not recoverable from the row. |
| Two-factor recovery requests | Postgres `TwoFactorRecoveryRequest` (state, `executeAt`, link and cancel tokens) | Tokens stored **hashed** (SHA-256); one active request per account. **[v0.2 CHANGED — `two-factor/README.md` "Recovery" (Decision Log #455, #456, #480).]** | Shows that an account is mid-recovery; rows for ended requests are deleted 30 days after they end, unused links 30 days after expiry. |
| Posts, comments, Bants posts, reports, Contact Us enquiries (name, email, message) | Postgres | Plain columns | Content; reports and enquiries may contain safeguarding disclosures. |
| Photos and videos | Cloudflare R2: `private-media/` (waiting, held, rejected) and `post-media/` (approved) | Private prefix is private **only if** the public address serves `post-media/` alone — **not verified against a real bucket (B-265)** | Images of children; rejected files are kept private and never deleted (B-206, open under counsel). |
| Refresh tokens, password-reset tokens | Redis | Stored as SHA-256 hashes | Not directly replayable from a Redis dump. Email-verification tokens: hashing **not confirmed**. |
| Two-factor enrolment in progress | Redis, 10 minutes | Encrypted with the same key | Short-lived. |
| Rate-limit counters | Redis (and per-instance memory) | Email and IP are **hashed** in the keys | No raw email or IP. |
| IP addresses | **Not stored** (read in memory for country derivation and rate-limit keys, then dropped) | n/a | Nothing to leak, except what a provider's own logs hold (not verified). |
| Card data | **Never reaches the server** (Stripe Elements → Stripe); only a PaymentIntent reference id is stored | n/a | No card numbers. |
| Admin audit trail | Postgres `AdminActionLog` | Plain | Evidence, and itself sensitive: it records that an admin looked at a date of birth. **[v0.3 CHANGED — it also records suspensions (with the reason category), content removals and holds; the report retention sweep never deletes it (#487).]** |

Facts a responder needs, all read from the repo: **[v0.3 CHANGED — v0.2 said there is no endpoint to read `AdminActionLog`; `GET
/admin/action-log` now exists (PR #607, `admin-action-log/README.md`, Decision Log #464): a superadmin reads every row, any other
admin only their own, and an admin who is not child-safety-vetted never sees rows about a minor or a guardian-notice action, so
an engineering or moderator responder cannot assume they see the whole trail; a full export is still a database query.]** **no bulk-email or broadcast tool exists** (email
goes out per event through `RegistrationEmailService` templates); Sentry is **inactive** until a real `SENTRY_DSN` is set, and
today only two code paths report to it (the global and auth rate limiters failing open).

---

## 2. What counts as an incident

*Draft for counsel review — not approved, not legal advice.*

**Incident** = any event that puts the confidentiality, integrity or availability of Soccernity data or systems at risk, or that
harms or could harm a child through the platform. **Personal data breach** (the legal term, UK GDPR Art. 4(12) and the NDPA
equivalent — `[UNVERIFIED — for counsel]` that the two definitions match) = an incident that leads to accidental or unlawful
destruction, loss, alteration, unauthorised disclosure of, or access to, personal data. Every personal data breach is an
incident; not every incident is a breach (an outage, a content-moderation emergency).

**Proposed severity classes.** These are proposals for the founder and counsel to adjust; the classes decide *speed and who is
woken*, not whether a legal duty exists (that is a separate assessment, §5 step 4).

| Class | Meaning | Examples tied to this platform |
|---|---|---|
| **S1 — Critical** | Confirmed or credible exposure of data that identifies children, or loss of control of a secret that protects it; or a child is in immediate danger. | A Postgres dump or backup leaves our control; **`DOB_ENCRYPTION_KEY` leaks** (alone it exposes nothing, but with any DB copy it exposes every date of birth and every two-factor secret); `JWT_SECRET` or `ADMIN_JWT_SECRET` leaks (tokens can be forged — admin forgery would reach the moderation queue and the date-of-birth read); an attacker holds a **superadmin** session **[v0.2 CHANGED — such a session can open a reported message, its edit original and its attached context messages, and can read or clear the withhold-guardian-notices flag only if that admin is also child-safety-vetted; see §1]**; the private media prefix is publicly readable and holds images of children; guardian consent or withdrawal links exposed in bulk; messages exposed. |
| **S2 — High** | Exposure or misuse limited to a small set of accounts, or a control failed in a way that *could* have exposed S1 data. | One admin account compromised; a suspended/closed account still reachable; an admin looked at a date of birth without a reason (audit anomaly); Redis exposed (refresh tokens are hashed, but enrolment secrets and verification tokens may be at risk); a processor tells us of its own breach; a rate limiter fails open during an attack; **[v0.3 CHANGED — `moderation/README.md`, Decision Log #483, #485]** a moderator or superadmin session misused to **remove content or suspend accounts** (a mass or targeted suspension, or removals of evidence) — these actions are reversible only through an appeal or a manual reinstatement, and each sends the person an email. |
| **S3 — Moderate** | Contained, low-sensitivity, or no personal data exposed; availability loss. | A single user's account taken over by a guessed password; a misdirected email (one guardian link sent to the wrong address); an outage of Neon / Redis / Render that blocks sign-in (Redis outage blocks sign-in, refresh, reset and verification — Decision Log #439 — and is *not* a breach). |
| **S4 — Low / near miss** | No exposure; logged for learning. | A failed attack stopped by a limiter; a dependency advisory with no reachable path; a misconfiguration caught before deploy (the production boot checks refusing a placeholder secret are the model). |

**Child-safety incidents that are not data breaches** (a concern about a child's welfare disclosed through a report, a contact
enquiry or a message) are **outside this plan** and belong in the safeguarding / moderation process (Build Plan Section 8.4,
the escalation trail on `Report`). They are listed so a responder who finds one mid-incident knows to hand it over, not to fold it
into the breach clock. `[OPEN]` — counsel: is a separate safeguarding-incident plan needed (§12, Q14)?

**Reporting channels into the plan (what exists today):** the Sentry alerts on the `rate_limiter` tag (inactive until the DSN is
real; launch-gate check B-267 (c)); a processor's own breach notice; a user, guardian or researcher writing to
`support@soccernity.com`; a moderator or admin noticing an anomaly; a failed boot with a refusal message in the Render log.
There is no security.txt or monitored vulnerability-disclosure address today `[OPEN — founder]`.

---

## 3. Who decides and who is told

*Draft for counsel review — not approved, not legal advice.*

Roles are **proposals**. The platform has one founder and no named staff in the repository; the roles below may all be one
person at launch, which is itself a risk (§12, Q12).

| Role | Proposed duty | Named person |
|---|---|---|
| **Incident lead** | Declares the incident, owns the timeline and the log, decides S-class and containment. | `[PLACEHOLDER: founder name, phone, backup contact]` |
| **Data-protection contact** (a DPO if one is appointed; otherwise this role) | Decides, with counsel, whether the breach is notifiable and to whom; signs the regulator filings. | `[PLACEHOLDER]` — `[OPEN]` whether a DPO is required (Q13) |
| **Safeguarding lead** | Decides how and when guardians and young people are told; owns the wording for minors; receives any child-welfare disclosure found during the incident. | `[PLACEHOLDER]` |
| **Engineering responder** | Runs containment (§4); preserves evidence (§8). | `[PLACEHOLDER]` |
| **Legal counsel** | Advises on notification duties and wording; privileged channel for the assessment. | `[PLACEHOLDER: firm, named solicitor, 24h number]` |
| **Communications** | Sends approved notices only; no free-form statements. | `[PLACEHOLDER]` (may be the incident lead) |

**[v0.3 CHANGED — Decision Log #483 to #487; `moderation/README.md`, `admin-users/README.md`]** Where removal, suspension and the
retention clock appear among these roles (proposals for the founder and counsel):

- **Moderation actions are staff actions on the platform, not tools of the engineering responder.** *Remove Content*, *Suspend
  User*, a legal hold and a bad-faith hold are all recorded by a **moderator or superadmin** admin (`PATCH
  /admin/moderation/reports/:id`, `PATCH /admin/users/:id`, the hold routes). The engineering responder has no right to them unless
  they also hold one of those admin roles. The **incident lead** therefore decides *whether* to use one, and the **safeguarding
  lead** (who should be a child-safety-vetted admin) is the person who records it — see §4.10 for the side effects each one has.
- **The vetting gate shapes who can do the work.** A report with `concernsMinor`, and a message report whose reported sender or
  any participant is under 18 (#486), shows its full content (including attached context and the edited original) **only to a
  child-safety-vetted admin**. If the safeguarding lead is not vetted they cannot assess a minor's message report, and must hand
  the assessment to a vetted admin. `[OPEN — Q23]` **[v0.4 CHANGED — #491, B-297]** The same rule now covers *acting* on such a report (recording an action, recording an appeal on someone's behalf, deciding an appeal): a non-vetted admin cannot do any of them on a message report where the reported sender or any participant is under 18, and the other admins still see the bare message with "Context hidden: this involves a child". It does **not** yet cover post, comment or user reports about a child outside the `child_safety_concern` category, the user-page suspension, or the hold routes (DPIA v0.6 R33(f) update). **[FOR FOUNDER — not a counsel blocker]**
- **Evidence preservation belongs to the incident lead** and starts *before* any removal or suspension (§5 step 3, §8.4): the
  retention sweeps (§8.4) run nightly and no pause switch is known.

**Who must be told, in outline** (detail in §6 and §7): the regulator(s); affected users; the guardians of affected minors;
processors whose systems are involved; insurers / law enforcement `[OPEN — Q11]`.

**Decision rule proposal:** the incident lead may *contain* alone and at once; *notify externally* only after the data-protection
contact has recorded the assessment (§5 step 4) — but if that cannot be done inside the clock, the lead files an initial
notification with what is known (§6 allows phased reports — UK; Nigeria `[UNVERIFIED]`) rather than letting the clock run out.

---

## 4. Containment tools the platform really has today

*Draft for counsel review — not approved, not legal advice.* Read from the code and docs; **none has been run against a live
system.** Where a tool does not exist, §4.9 says so.

### 4.1 End one user's sessions
- `TokenService.revokeAllSessionsForUser(userId)` — deletes the user's refresh tokens from Redis. It runs on: password change,
  password reset, deactivate, delete, an **admin suspend or delete** of the account (`PATCH /admin/users/:id`, moderator or
  superadmin), and `POST /auth/logout` with `allSessions`. **[v0.2 CHANGED — `email-change/README.md`, `two-factor/README.md`: a
  confirmed email change (`POST /auth/email-change/confirm`) and a completed two-factor recovery (guardian approval, or the
  hourly sweep after the 24-hour adult wait) also end every session of the account.]**
- **[v0.3 CHANGED — Decision Log #485]** Suspending an account — from the user page or by recording *Suspend User* on a report —
  runs the same code (`AccountSuspensionService`): the status write, then session revocation, **revocation of earned engagement
  points (not restored on reinstatement)**, one guardian notice for a minor (unless the withhold flag is on) and an email to the
  person. §4.10 sets out what that means when a suspension is used as containment.
- **Limit:** an already-issued access token stays valid until it expires (15 minutes by default). Ending a session is therefore
  "within about 15 minutes", not instant. There is no per-request database check for ordinary users.

### 4.2 End one admin's sessions
- `AdminTokenService.revokeAllSessionsForAdmin`. Runs on: admin password change, **deactivating the admin**
  (`PATCH /admin/staff/:id/status`, superadmin; refused for the last active superadmin), and the two-factor peer reset.
- With `ADMIN_2FA_ENFORCED = "true"`, an admin without two-factor is refused at their next **refresh** and all their sessions end
  (PR #565). Access tokens already issued last up to their lifetime (15 minutes default; `ADMIN_JWT_*_TTL_*` env vars).

### 4.3 Reset an admin's two-factor
- `POST /admin/staff/:id/two-factor/reset` (superadmin, never your own; ends the target's sessions; audit row
  `admin_user.two_factor_reset` in the same transaction; 409 if nothing to reset).
- **Last superadmin:** the database recovery in `docs/admin-two-factor-recovery.md` (Neon SQL editor; the SQL block is
  test-proven but never run on a real Neon database). It does **not** end Redis sessions — its Step 3 does that by hand
  (`SMEMBERS admin:refresh:admin:<id>`, then `DEL`).
- Users: they turn two-factor off with their password; there is no admin reset for a *user's* two-factor except clearing the
  three `totp*` columns and the `UserBackupCode` rows by hand (`docs/dob-encryption-rollback.md`).
  **[v0.2 CHANGED — `two-factor/README.md` "Recovery" (Decision Log #455, #456, #480): a user who lost both the device and the
  backup codes now has a self-service route, `POST /auth/two-factor/recovery/request` (email and password; one answer for
  every outcome). An adult gets a link at their own email, a 24-hour wait and a "this wasn't me" cancel link; the hourly sweep
  then removes two-factor and ends all sessions. A minor's request goes to the confirmed guardian's email (72-hour link; the
  guardian approves or says "I didn't expect this"), except that a minor whose guardian notices are withheld takes the adult
  path to their own email (#480). Anyone who has the account's password and its mailbox can therefore remove its second
  factor after the wait; a responder who suspects that must look for a `TwoFactorRecoveryRequest` row in state `pending` or
  `waiting` (§4.9 notes there is no staff tool to cancel one).]**

### 4.4 Rotate the signing secrets (kill every session at once)
- Changing `JWT_SECRET` invalidates every **user** access token and changing `ADMIN_JWT_SECRET` every **admin** access token on the
  next deploy (they sign the tokens; verified from `validate-runtime-env.ts` and the token services — the two must differ, and
  the app refuses to boot otherwise). Refresh tokens are **opaque and held in Redis**, so they are *not* affected by a JWT secret
  change; to end all refresh sessions the responder must delete the `auth:refresh:*` / `admin:refresh:*` keys in Upstash.
  `[UNVERIFIED]` — there is no written runbook or tested script for a global sign-out; this is inferred from the code.
- Effect on users: everyone is signed out; guardians' links are unaffected (separate tokens).

### 4.5 Rotate `DOB_ENCRYPTION_KEY`
- Procedure and re-encrypt script: `docs/dob-encryption-rollback.md` ("Rotating the key"). Two live keys during rotation
  (`DOB_ENCRYPTION_KEY`, `DOB_ENCRYPTION_KEY_VERSION`, `DOB_ENCRYPTION_KEY_PREVIOUS`); a dry run, a real run and a verification
  pass; rotates dates of birth **and** both two-factor secret columns together; no automatic undo.
- **Honest limits:** never run against a real Render or Neon account (B-267 (k) asks for a rehearsal); a rotation does **not**
  help if an attacker already copied both the database and the old key (they hold the data in the clear); it helps only against
  *future* copies and against a key that leaked *without* a database copy. If the key leaked and a DB copy may exist, treat as
  S1 and notify (§6) — rotation is containment, not a cure.
- The boot check (B-252) refuses to start in production on an invalid key set; it cannot tell a wrong key from a right one.

### 4.6 Throttles and alerts
- Global limiter (user 120/min, anonymous 600/min per IP, writes 30/min, uploads 10/10 min), sign-in limits (5 failed attempts
  per 15 minutes per account-and-IP pair; 20 per 24 hours per account; per-IP ceiling), admin login 5 per 15 minutes per IP,
  guardian-withdrawal 5 per 15 minutes. All numbers are environment variables in `render.yaml` and can be tightened by redeploy.
- **Fail-open with Sentry report** when Redis is down (`rate_limiter=global` / `rate_limiter=auth`). **No alert reaches anyone
  until `SENTRY_DSN` is real and an alert rule exists (B-267 (c)).** The admin login is *not* fail-closed (Decision Log #433).
- Accounts: a moderator can suspend (`suspended` — not reversible by the user) or delete a user (`PATCH /admin/users/:id`);
  a held account is handled by `AccountHold`. **[v0.3 CHANGED — suspension by this route now requires a reason category (400
  without one) and emails the person; see §4.10.]**

### 4.7 Switch off a feature
- Uploads: with no object store configured, upload routes answer 503 and nothing else breaks; video uploads answer 503 when
  ffmpeg is absent. Removing the `S3_*` / `REKOGNITION_*` values and redeploying is the existing off switch for media.
- Email: an unusable `WEB_APP_BASE_URL` stops verification, guardian-consent and withdrawal emails from being sent at all.
- There is **no maintenance mode, no read-only mode and no per-feature kill switch** in the code. Taking the API down means
  suspending the Render service `[PLACEHOLDER: who holds the Render login]`.

### 4.8 Processor contact routes (to be filled on account creation)
Contact routes below are **placeholders** — no account exists, so nothing here was tested, and the vendors' current security /
breach contacts were not looked up. Record the account owner, the support tier and the security-contact route when each account is
opened.

| Processor | Holds | Contact route |
|---|---|---|
| Render (API host, Frankfurt) | Runtime, env vars (all secrets), logs | `[PLACEHOLDER: dashboard support / security contact; plan]` |
| Neon (Postgres, EU) | The whole database, backups, branches | `[PLACEHOLDER: support route; point-in-time restore window]` |
| Upstash (Redis, EU, free plan) | Refresh tokens (hashed), reset / verification tokens, counters | `[PLACEHOLDER]` — free plan has no SLA (Decision Log #439) |
| Postmark (email) | Recipient addresses and message bodies in transit / activity logs | `[PLACEHOLDER]` |
| Sentry | Error events (today: none) | `[PLACEHOLDER]` — DSN not real; scrubbing of request bodies is a DPIA R11 proposal, not done |
| Cloudflare R2 (media; also edge if added, Decision Log #424) | Images and videos of children | `[PLACEHOLDER]` |
| Amazon Web Services (Rekognition image check) | Frames / images sent for classification | `[PLACEHOLDER]` — opt-out of AI-services data use is a founder launch step |
| Stripe (card verification) | Card data and the PaymentIntent for under-13 US guardians | `[PLACEHOLDER]` |
| MaxMind (GeoLite2 download only) | No user data (local database) | n/a |
| GitHub | Source code, CI; the repository is public (Decision Log #441 (e)) | `[PLACEHOLDER]` — a secret ever committed is treated as exposed and must be rotated |

### 4.9 What the platform does NOT have (gaps a responder must know on day one)
- No tool to **notify all guardians**, all users or a subset (no bulk-send; guardian emails exist only as per-event templates).
- **[v0.3 CHANGED — v0.2 said: "No read endpoint for the audit log". `GET /admin/action-log` exists (PR #607); it is scoped by role and by
  child-safety vetting (§1), so it is not a way to export the whole trail.]** Still no **log of who read what** beyond
  `user.dob_viewed` and the admin actions listed in `admin-action-log.constants.ts`. Request logs are whatever Render keeps
  `[UNVERIFIED]`.
- No **per-user data-access log**, so "which accounts' data did the attacker read" may be unanswerable from our own records.
- No **global sign-out command**, no **maintenance mode**, no **IP block list**.
- No **secret-scanning in production** beyond GitHub's repository settings (founder-reported as on; Decision Log #441 (d)).
- No **status page** or user-facing incident channel.
- **[v0.2 CHANGED — `email-change/README.md`, `two-factor/README.md`]** No staff tool to **cancel a user's pending email change or
  two-factor recovery request**. A user can cancel a recovery with the cancel link; a responder otherwise has only the
  database (update the `TwoFactorRecoveryRequest` state, delete the `EmailChangeRequest` row) — `[UNVERIFIED]` inferred from the
  modules having no admin route, never tried.
- **[v0.3 CHANGED — `moderation/README.md`, `admin-users/README.md`, `account-hold/README.md`]** No **pause switch for the retention
  sweeps** (§8.4): the message job (04:00) and the report job (04:15) run every night; the only lever found is a very large
  `MESSAGE_RETENTION_MONTHS` / `REPORT_RETENTION_YEARS` and `REPORT_RETENTION_CONCERNS_MINOR_YEARS` **[v0.4 CHANGED — #490]** and a redeploy, which has not been tried (`[UNVERIFIED]`). A **legal
  hold** is the built way to keep a report, its removed content and a held account's messages, but it needs an existing report
  and a real account to attach to.
- **[v0.3 CHANGED]** No **bulk or quiet suspension**: every suspension emails the person and tells a minor's guardian (§4.10). No
  staff tool to **restore** removed content other than overturning the removing report's appeal, and no **staff-recorded
  appeal** yet (B-292 is decided, not built — `CLAUDE.md`), so a responder who removed or suspended in error has only a manual
  reinstatement (accounts) or the appeal route (content). Content removal can only be recorded **on a report**: a responder
  without an existing report must have one filed first (`[UNVERIFIED]` — an admin cannot submit a report from the admin
  console; inferred from the routes).
- **Sentry, Postmark, Upstash alerting, Render, Neon: none live.** This plan cannot be exercised until they are.

### 4.10 Content removal and suspension: what each does when used as containment **[v0.3 CHANGED — new section]**

*Draft for counsel review — not approved, not legal advice.* Sources: `moderation/README.md` (B-289, B-291, B-294),
`post-media/README.md` (B-290, B-296), `account-suspension/account-suspension.service.ts`, `admin-users/README.md`, Decision Log
#483, #484, #485. These are existing moderation actions; this plan does not add or change them, it lists what a responder
triggers by using one.

| Action | Who can record it | What it does at once | What it also triggers (side effects a responder must expect) | How to undo |
|---|---|---|---|---|
| **Remove Content** (post, comment, message) on a report | Moderator or superadmin; a vetted admin for a `concernsMinor` report | Marks that **one** item removed (soft): it vanishes from user-facing reads; the **public** copy of a post's media is withdrawn and a **private** copy kept | The guardian of a minor author is told the *kind* of action (`content_removed`) unless the withhold flag is on; the reporter is told the outcome; the author sees a stub. Counts drop (`commentCount`). **The text and the private media stay**, so this does **not** erase anything from the database. | Overturn the report's appeal (restores both content and media). |
| **Suspend User** on a report, or `status: suspended` on the user page | Moderator or superadmin (user page: reason category required) | Sets `accountStatus = 'suspended'`; the person cannot sign in; **all sessions end; earned engagement points are revoked** | **An email to the person's address on file** with a fixed reason line chosen from the report category (the generic line "breaching our community rules" for `child_safety_concern`, `other` or none), never free text, the reporter or a duration, and how to appeal; a guardian notice for a minor (unless withheld); points are not restored on reinstatement. | Overturn the suspending report's appeal (automatic, only if *that* report caused it), or a manual reinstatement from the user page (also emails the person). |
| **Legal hold** / **bad-faith hold** | Moderator or superadmin, on a report | Keeps the report, the removed content, and (legal hold) the held person's messages out of the nightly deletions (§8.4) | **No one is notified**, including no guardian (#459). | Lift the hold (reason required). |

**Using suspension to contain an account takeover — cautions for the incident lead (proposals).**
- The suspension email goes to the address on file. If the attacker changed the email (`POST /auth/email-change/confirm`) it goes
  to the attacker, and the victim is not told. `[UNVERIFIED]` — inferred from the sender reading `User.email`; not tested.
- The email's fixed reason line says the account was suspended for "breaching our community rules" (generic line); for the victim
  of a takeover this is the wrong message, and no quiet or custom variant exists. `[OPEN — Q20]`
- A suspension revokes earned engagement points and does not restore them; a victim loses leaderboard points.
- For a **minor**, a guardian notice goes out too (unless the withhold flag is on) — alongside any breach notice (§7.5).
- Prefer, in this order: end the sessions without suspending (§4.1) and reset the credential; suspend only when the account is
  itself the source of harm.

**Using content removal as containment.** It hides the item from users; it does not make the data safe (it stays in clear text
in Postgres) and it can **start the retention clock** on the report (§8.4). If the item is evidence of the incident, record it
and preserve it (§8) before recording the removal.

---


**[v0.4 CHANGED — #492, #494; B-292, B-298]** **Appeals of a suspension.** *Draft for counsel review — not approved, not legal advice.* A suspended person cannot sign in, so
cannot use the in-app appeal. They write through the public Contact Us page (seventh category, "Appeal a suspension"; the API accepts it, the web page and the admin inbox
do not offer it yet), and a moderator or superadmin records the appeal on a report suspension (only for a `user_suspended` action, only inside the 30-day window, a reason
required). **The staff member who records the appeal, and the one who took the original action, may not decide it**, so a third admin is needed; for a message report
involving a child, all of them must be child-safety-vetted. The recorded appeal pauses the report's retention clock. Two things for a responder to expect: the Contact Us
enquiry may hold a child's account email and is readable by any moderator or superadmin (the inbox has no vetting gate; **[FOR FOUNDER — not a counsel blocker]**), and the
suspension email still goes to the address on file, which an attacker may have changed (Q20; recorded, not decided). A suspension is applied even if an admin hold exists
on the account (founder decision, #494; no counsel position). The reinstatement email says nothing about points.

## 5. The response process

*Draft for counsel review — not approved, not legal advice.* Steps are in order; steps 1–3 run in the first hour. **The legal
clock (§6) starts when we become "aware" — see §6.1 for the open question of what that means.** Record the exact time of
awareness in step 1.

1. **Detect and record.** Open the incident log (§9.1). Write down: who found it, how, the exact date and time (UTC and London)
   of awareness, and the first facts. Do not delete anything. **[v0.3 CHANGED — if the incident touches a report, a removed item or
   a suspended account, also write down the report ids and whether each is open, closed or appealed: its closing date decides
   when the retention sweeps (§8.4) may delete it.]**
2. **Triage.** Incident lead assigns a class (§2) and wakes the roles in §3 (S1: all roles at once; S2: lead, safeguarding lead,
   engineer, counsel; S3/S4: lead and engineer).
3. **Contain.** Use §4 in this order, stopping when the exposure stops: end the affected sessions; deactivate the affected admin;
   rotate the exposed secret; tighten the limiter; turn the feature off. **Preserve evidence first** (§8) wherever a
   containment step would destroy it (a restart clears logs; a Neon restore replaces data). **[v0.3 CHANGED — a nightly sweep
   can also delete messages and closed reports with the content they removed; a content removal or suspension is itself a
   state change with emails attached (§4.10). Take the Neon snapshot first and place a legal hold where one is needed to keep a
   report and its content (§8.4).]**
4. **Assess.** Data-protection contact with counsel records, in writing: what data, whose, how many, including how many are
   **minors** and **under-16**; what the cause was; whether the data was protected (the encrypted date of birth is a mitigating
   fact **only if the key was not also exposed**); likelihood and severity of harm; whether notification to a regulator is
   required; whether to individuals and guardians (§7). **If the facts are incomplete at hour 48, prepare the initial notice
   anyway** (§6.1: phased reporting).
5. **Notify** per §6 and §7, using the templates in §10, only after step 4 is recorded or the clock forces an initial notice.
6. **Eradicate and recover.** Fix the cause; rotate every secret the attacker could have seen (not only the one found);
   redeploy; confirm via the checks in the relevant document (`docs/dob-encryption-rollback.md`,
   `docs/admin-two-factor-recovery.md`); watch for return.
7. **Review** (§9.2) within 14 days `[PROPOSAL — counsel and founder to set the period]`.

Keep an **internal record of every breach** whether or not it is reported (the UK requires one — Art. 33(5)
`[UNVERIFIED — not read in full]`; Nigeria `[UNVERIFIED]`).

---

## 6. Notification timelines and sources

*Draft for counsel review — not approved, not legal advice.* Checked 2026-10-31. **A timeline is only as good as its source;
each row states what was and was not read.**

### 6.1 United Kingdom — Information Commissioner (UK GDPR Arts. 33 and 34, Data Protection Act 2018)

| Item | Statement | Source and what was verified |
|---|---|---|
| **To the regulator — clock** | "Without undue delay and, where feasible, not later than **72 hours** after having become aware of it." | UK GDPR Art. 33(1): <https://www.legislation.gov.uk/eur/2016/679/article/33>. **Verified by search-result summary of the statute text; the full page was not read by me.** The ICO's guide <https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/> states the same (per search summary); **the ICO page itself could not be opened (HTTP 503 / timeout, six attempts).** |
| **Trigger** | Notification is **not** required if the breach is "unlikely to result in a risk to the rights and freedoms of natural persons". | Art. 33(1), same source and caveat. |
| **Late filing** | If later than 72 hours, it "shall be accompanied by reasons for the delay". | Art. 33(1), same. |
| **Phased reporting** | Information may be provided "in phases without undue further delay" when it cannot all be given at once. | Art. 33(4), per search summary. |
| **Minimum contents** | Nature of the breach, including (where possible) categories and approximate numbers of data subjects and records; name and contact details of the data-protection contact; likely consequences; measures taken or proposed. | Art. 33(3), per search summary. `[UNVERIFIED — exact wording and any ICO form fields; for counsel]` |
| **Processor → controller** | A processor notifies the controller "without undue delay" after becoming aware. | Art. 33(2), per search summary. |
| **Internal record** | Controller documents every breach, its effects and the remedial action. | Art. 33(5). `[UNVERIFIED — not seen in the search results; this is from general knowledge and is the one row to check first]`. |
| **To individuals — trigger and timing** | Where the breach "is likely to result in a **high risk** to the rights and freedoms of natural persons", communicate it to the data subject "**without undue delay**". | UK GDPR Art. 34(1): <https://www.legislation.gov.uk/eur/2016/679/article/34>. Per search summary of the statute. |
| **To individuals — contents** | "In clear and plain language" the nature of the breach, plus at least the contact point, likely consequences and measures (the Art. 33(3)(b)–(d) items). | Art. 34(2), per search summary. |
| **Exceptions to telling individuals** | (a) the data was protected, e.g. encrypted so as to be unintelligible; (b) later measures mean the high risk is no longer likely; (c) disproportionate effort, in which case a public communication. The regulator may require notification or decide an exception applies. | Art. 34(3)–(4), per search summary. **Note for counsel:** exception (a) is why *which key was exposed* (§4.5) decides whether a leaked database copy is "unintelligible". |
| **How to report** | ICO online reporting form; ICO helpline for urgent matters. | `[UNVERIFIED — ICO page unreadable; the current form address and any out-of-hours number to be confirmed by counsel]` |
| **Regulator's name** | The search result shows the current statute text naming "the Commission" where older text names "the Commissioner" (following the Data (Use and Access) Act 2025). | `[UNVERIFIED — for counsel]`: confirm the regulator's current legal name, whether the ICO is still the filing route, and any change to the breach rules from that Act. The Act is reported to have changed the **PECR** (electronic communications) window from 24 to 72 hours; that is not the UK GDPR rule above and applies to communications providers (<https://www.legislation.gov.uk/ukpga/2025/18/part/5/chapter/2/enacted>). |

**What "aware" means** is not stated in the statute text I saw. The ICO guide (per search summaries) explains that a controller is
"aware" when it has a reasonable degree of certainty that a security incident has compromised personal data; **I could not read
that wording, so it is unverified** `[UNVERIFIED — for counsel]`. This matters: the proposed rule in §5 is to *log the time of
first credible report* and let counsel decide when the clock started.

### 6.2 Nigeria — Nigeria Data Protection Commission (NDPA 2023, s. 40; GAID 2025)

| Item | Statement | Source and what was verified |
|---|---|---|
| **To the Commission — clock** | A controller "shall, within **72 hours** of becoming aware of a breach which is likely to result in a risk to the rights and freedoms of individuals, notify the Commission of the breach and, where feasible, describe the nature of the personal data breach including the categories and approximate numbers of data subjects and personal data records concerned." | **Read in the official NDPC document**: Nigeria Data Protection Act General Application and Implementation Directive (GAID) 2025 (reference NDPC/NDP ACT-GAID/01/2025, dated 19 December 2024 in the text, hosted at <https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf>), Article 33(1), which **quotes NDPA s. 40(2)**. Confirmed again in the controller-duties list (items "p" and "q"). **The Act's own text was not opened**; the GAID's quotation is the evidence. |
| **When a breach is "high risk"** | GAID Art. 33(2): where, given the nature of the breach, the data and "the probability of accessing other personal data of the data subject", the person "may become a victim of fraud, identity theft or exposure of sensitive personal data". | GAID Art. 33(2), read. |
| **To individuals — timing** | GAID Art. 33(3): a controller "shall notify affected data subjects **immediately** after becoming aware of the breach in order to ensure that data subjects are not unlawfully targeted as a result of the breach". The controller-duties list says: notify a data subject immediately after becoming aware of a personal data breach "that may pose high risk to his or her privacy". | GAID Art. 33(3) and the duties list, read. **The two formulations differ in threshold** (Art. 33(3) reads as all affected data subjects; the duties list says high risk) — `[OPEN for counsel]`. |
| **Duty of care to authorities** | Notwithstanding the 72 hours, a controller or processor should give **immediate** information to all relevant authorities, including the Commission, "if such immediate information may help in containing imminent data breaches on a national scale" or where containment may be needed "at national, sectoral or at an individual level or where it may affect members of the general public". | GAID Art. 33(4), read. |
| **Contents of the notice to the Commission** | At least: (a) circumstances of the loss or unauthorised access / disclosure; (b) date or period; (c) the personal information involved; (d) an assessment of the risk of harm; (e) an estimate of individuals at real risk of significant harm; (f) steps taken to reduce harm; (g) steps taken to notify individuals; (h) name and contact details of a person who can answer the Commission's questions. | GAID Art. 33(5), read. |
| **Processor → controller** | A third-party summary says a processor must act on becoming aware, and that the 72-hour rule is for controllers. | `[UNVERIFIED — third-party summaries (Mondaq, Afriwise) only; s. 40(1) not read]`. |
| **How to report** | The NDPC runs an online "Report a Breach" portal. | <https://services.ndpc.gov.ng/breach/> — the page opened but showed a heading only; **no form, timeline or required fields were visible**. `[UNVERIFIED — for counsel]` |
| **Children** | The GAID requires consent for processing a child's data and lists "Child Online Protection" and a "Breach of Child's Privacy" item; **no children-specific breach-notification rule was found** in the text searched. | GAID, read in part. `[UNVERIFIED]` — counsel to check. |
| **Regulator publicity** | A summary says the Commission may make a public communication where it considers a controller's notice to individuals inadequate (s. 40(5)). | `[UNVERIFIED — KPMG review summary; Act not read]`. |

**Note:** the 72-hour clock exists in **both** regimes, but the *threshold* differs in wording ("risk" for the regulator in both;
"high risk" for individuals in the UK, "immediately" in Nigeria's Art. 33(3)). A breach affecting both UK and Nigerian users could
require two filings on the same clock, with different content lists. `[OPEN]` — Q1, Q2.

### 6.3 United States — questions for counsel (not resolved here)

The platform's reach in the US is through under-13 card verification (Stripe, US guardians) and any US user. **Do not treat any
statement here as an answer.**

- **Q-US1.** Which state data-breach notification laws apply to a service with US users, and do any apply to a **date of birth
  + email + name** combination? (State laws differ on what counts as "personal information", the trigger, the deadline, whether
  a regulator or Attorney General is told, and whether a child's data is treated differently.)
- **Q-US2.** Is Soccernity a "website or online service directed to children" or does it have "actual knowledge" of under-13 US
  users for **COPPA** (the card-charge verification exists because of this question — Decision Log #4 stays open)? If so,
  does COPPA itself impose any breach-related obligation, and does the FTC expect a notice?
- **Q-US3.** Does any federal sector law apply (none identified)? Does the FTC's **Health Breach Notification Rule** or the
  **FTC Act** unfair-practices theory matter for a data incident, and is a notice to the FTC expected?
- **Q-US4.** What is the position on **card data**: only a Stripe reference is held. Confirm there is no PCI-DSS incident duty
  beyond Stripe's own (Soccernity's PCI-DSS SAQ A status is itself a launch follow-up for the founder).

### 6.4 European Union — questions for counsel (not resolved here)

The legal draft says there is **no EU representative** and EU users are "incidental" (DPIA R15, Decision Log #4). **Do not treat
any statement here as an answer.**

- **Q-EU1.** If EU users are targeted or monitored, **EU GDPR Art. 27** (representative) and Art. 33 apply in parallel. Which
  EU supervisory authority is the one to notify when there is **no EU establishment** (no one-stop-shop)? Possibly each
  authority where affected users live — counsel to confirm.
- **Q-EU2.** The platform hosts in the **EU (Frankfurt)** with EU-region processors (Decision Log #391). Does hosting alone
  create any EU notification duty for UK/Nigerian users' data? Do the processors' own EU obligations (a processor's duty to tell
  the controller "without undue delay") change what we learn and when?
- **Q-EU3.** Are the 72-hour and "high-risk-to-individuals" tests the same in the EU as in UK GDPR for a **child's** data, and
  is there any rule on **age-of-digital-consent** that changes whom we tell (child vs. holder of parental responsibility)?
- **Q-EU4.** Do EU member states add anything (for example, additional notice to a parent) that would matter if an EU child is
  affected?

---

## 7. Telling guardians, and telling young people

*Draft for counsel review — not approved, not legal advice.* **Everything in this section is a proposal for counsel.** The law
does not (so far as verified) say *who* is told when the data subject is a child — see Q5.

### 7.1 Principles proposed
- **A guardian is told as well as the young person**, because the Privacy Policy draft §11 already promises it ("separately
  notifies a minor's guardian as well as the affected user"), and DPIA R10 asks counsel to confirm the duty. If counsel decides
  this promise should be narrowed or dropped, that edit belongs to the legal-copy track, not this plan.
- **Whom the platform can reach:** the *minor's own email* (the account email, possibly a child's own address or a
  guardian's) and the *guardian's email* on the `Guardian` row. A minor in `restricted_pending` has a guardian row with an email
  but has not necessarily been approved. An account that turned 18 keeps a `Guardian` row (consent history) but the guardian is
  no longer the right person — `isMinor` must be read **at the time of the incident**, not from an old flag (the age sweep runs
  daily, so the flag can lag by about 24 hours).
- **[v0.2 CHANGED — Decision Log #456, #458, #459]** Guardians are already told about many things on a minor's account (§7.5).
  A breach notice must be read in that light, and a minor whose account has the withhold flag has been deliberately **not** told
  those things; see §7.5 and Q18 before any guardian notice for that account.
- **Never include in the message:** passwords, links that sign someone in, the child's date of birth, anything that would let a
  recipient act on the account. Use fixed, plain wording (§10). Do not link to a page that asks for a password.
- **Do not use the message to ask the child for anything.** Direct them to the guardian or to `support@soccernity.com`.
- **Plain language, short, age-appropriate.** For under-13s `[OPEN — Q6]` whether the child is told directly at all.

### 7.2 Proposed timing
| Audience | Proposed timing | Why / trigger | Source |
|---|---|---|---|
| Guardian of an affected minor | **Same day as, and not later than, the notice to the minor**, and without waiting for the regulator's filing to finish; at the latest the same moment the individual notice goes out. | The duty to tell individuals is "without undue delay" (UK) / "immediately" (Nigeria); the guardian is the person who can protect a child. | §6.1, §6.2 (individual timing, verified in part). Guardian as a separate recipient: **not stated in the sources read** — `[OPEN — Q5]`. |
| Affected young person (16–17) | Same time as an adult user, in plain language. | UK: individual notice for high risk; Nigeria: immediately. | §6. |
| Affected young person (under 16) | `[OPEN — Q6]` Guardian first or together; the under-16 tier has no DMs, no Bants, restricted Groups. | Tier defined in Decision Log #346. | n/a |
| Affected adult | As soon as the high-risk decision is recorded (UK) / immediately on awareness (Nigeria). | §6. | §6. |
| Public communication | Only if individuals cannot be reached individually (UK Art. 34(3)(c) exception) or the regulator requires it (Nigeria s. 40(5), unverified). | | §6. |

### 7.3 Channel and limits (what the platform can actually do)
- **Email only today.** No bulk tool exists (§4.9): a notice to many guardians means a **new send path**, built under the
  incident, or a manual export of `Guardian.email` run by a person with database access (itself a privileged read to be logged,
  §8). `[OPEN — Q9]`: should a standby "send this fixed notice to this list" tool be built *before* launch (this draft
  recommends yes, as a founder decision, and does not decide it).
- **In-app notice** can be added through the existing `Notification` mechanism only for users who sign in; it cannot reach a
  guardian who has no account.
- **Wrong or stale guardian address:** `Guardian.email` is self-declared and may be wrong; an email to it may reach a stranger.
  The notice must therefore carry **no detail beyond what a stranger may know** (the platform name, that an incident
  happened, a contact route).
- **Sending itself is processing:** Postmark sees the recipient list. `[OPEN]` DPIA treatment.

### 7.4 Special case — a minor's sign-in is locked (Decision Log #438)
Not an incident class here. **[v0.2 CHANGED — Decision Log #456 settles #438: the guardian of a minor is emailed when a sign-in
lock trips, at most once per account per 24 hours; see §7.5 and §12 Q10.]**

### 7.5 What guardians are already told, and when they are deliberately not **[v0.2 CHANGED — new section]**

*Draft for counsel review — not approved, not legal advice.* Source: `guardian-security-notice/README.md`,
`two-factor/README.md`, `email-change/README.md`, Decision Log #456 (founder, 2026-11-01), #458 and #459.

**Decided and built (the platform, not this plan).** When the account holder is a **minor** and a **confirmed** guardian email
is on file, the guardian gets a short email for each security or safety action: two-factor turned on or off, backup codes
regenerated, password changed or reset, **email address changed**, a **sign-in lock** (at most once per account per 24 hours),
and the existing guardian-email-replaced notice; for an actual two-factor recovery the guardian's own link email is the one
message. Separately, for **platform safety actions** (content removed, warning, suspension or its reversal, account removal,
username removed or restored, room deactivated, media or profile picture not approved, appeal upheld or overturned) the
guardian is told the **kind** of action and when — never the reason, the rule, a report, or who reported. Two rules are fixed:
a minor's **own** reports, blocks and mutes **never** notify a guardian (a child reporting may be reporting someone in their own
household), and **no hold ever notifies a guardian** — not a legal hold, a bad-faith hold, lifting one, or the report-derived
account hold (#459).

**What this means for who is told in an incident (proposals for counsel; none is a legal conclusion):**
- A breach notice (§7.1–§7.3) is a **separate, manual message**. The code that sends the notices above does not send it and does
  not gate it.
- If an attacker acted on a minor's account (changed the password or email, turned two-factor off), the guardian of a minor
  **without** the withhold flag may already have received one of the notices above. The responder can check
  `Guardian.consentStatus` for the account, and should not assume the guardian first learns of it from us (the platform keeps
  no record of notices sent, so whether one went out is `[UNVERIFIED]` and must be asked of Postmark).
- **Withheld accounts.** A child-safety-vetted admin can switch "withhold guardian notices" on for one minor's account, with a
  written reason (#458). While it is on, **every** notice above is skipped silently (an internal log line only), and
  guardian-assisted two-factor recovery is replaced by the adult path to the minor's own email (#480). Notices skipped are
  **not** sent when the flag is cleared. The consent request, withdrawal, expiry and turned-18 emails, and the
  guardian-email-replaced notice, are **not** affected by the flag.
- **`[OPEN — Q18]`** Does the flag also stop a **breach** notice to that guardian? The flag's purpose (a safeguarding concern
  about the guardian or household) argues for asking the vetted admin who set it, and the reason is staff-only, so the
  safeguarding lead cannot see it unless vetted. The code does not answer this; this draft does not either.
- **[v0.3 CHANGED — Decision Log #485]** A **suspension** of a minor's account (including one used as containment, §4.10) also
  sends the guardian a safety-action notice, and sends the **minor** an email with the fixed reason line. A breach notice and
  these platform notices can therefore arrive together or in either order; the safeguarding lead should check what was already
  sent (the platform keeps no record, so ask Postmark) and word the breach notice so that it does not contradict the
  suspension email.
- **Proposal, for counsel to adjust:** before sending any guardian notice for an affected minor, the safeguarding lead (a
  child-safety-vetted admin) checks whether `GuardianNoticeWithhold` exists for the account and decides the route (guardian,
  minor only, or counsel first) in writing in the incident log.

---

## 8. Evidence handling

*Draft for counsel review — not approved, not legal advice.*

### 8.1 Principles
- **Preserve before you fix**, wherever a fix would overwrite evidence (a restart clears the process; a restore overwrites the
  database; a secret rotation removes the thing that was exposed).
- **Least privilege and a written record of every privileged read.** Reading production data to investigate is itself access to
  children's data. Use the minimum, log who, when, why. The platform's own pattern: every admin DOB read writes `user.dob_viewed`
  and fails closed if the audit write fails; mirror that discipline for responders.
- **Counsel-led where possible.** Route the assessment through counsel so privilege can be considered `[UNVERIFIED — for
  counsel: privilege rules differ by jurisdiction]`.
- **Do not alter** the original: take copies, hash them, work on the copy.

### 8.2 What to capture, and where it lives (all to be confirmed against real accounts)
| Evidence | Source | How to preserve |
|---|---|---|
| The incident log (§9.1) | A document kept off the platform (not in the repo, not in the app) | Append-only; timestamps in UTC and London. |
| Application logs | Render log stream | Download before any redeploy; retention is the plan's setting `[UNVERIFIED]`. |
| Database state | Neon | Take a **branch / snapshot** at once (Neon branches and point-in-time restore exist per `docs/deployment.md` and the rotation procedure's step 0); do not restore over production. |
| Admin audit trail | `AdminActionLog` | SQL export (no read endpoint); includes `user.dob_viewed`, `admin_user.two_factor_reset`, hold, revoke and report actions. |
| Redis state | Upstash | Note key names only (`auth:refresh:*`, `admin:refresh:*`, `auth-limit:*`); values are hashes or counters. Do **not** dump values into a ticket. |
| Messages **[v0.2 CHANGED — `messaging/README.md` "Retention" (Decision Log #478)]** | Postgres `Message`, `ReportContextMessage` | A daily job (04:00) **deletes every direct message 12 months after it was sent**, minors and adults alike, with its edit original; it skips a message that a `Report` points at or a `ReportContextMessage` row attaches. It runs inside an incident like any other night. **Take the Neon snapshot first** (a message past 12 months may be gone by the next morning); there is no pause switch in the code (`[UNVERIFIED]` — a very large `MESSAGE_RETENTION_MONTHS` is the only lever and has not been tried). **[v0.3 CHANGED — v0.2 said a legal hold on an account does not stop the job; that was superseded by Decision Log #482 (`messaging/README.md` "Held accounts"): an active `legal_hold` on the message's sender or on any other participant of the conversation now keeps the message. A `bad_faith` hold and the report-derived holds do not. See Q19.]** |
| **[v0.3 CHANGED — new row]** Reports and content removed by a report | Postgres `Report`, `Post`, `Comment`, `Message` (soft-removed), `ReportContextMessage` | A nightly job (04:15) deletes a report **6 years after it closes (7 years if it concerns a minor)** **[v0.4 CHANGED — #490]** (v0.3: 12 months and 6) with the content it removed (rows and stored media) — see §8.4. **Take the Neon snapshot first, and note the closing date of every report that matters.** Context messages stay and fall to the message job. |
| **[v0.3 CHANGED — new row]** Media of a removed post | R2 `private-media/` | The private copy is kept until the removing report closes, then deleted (`deletedByModerationAt`); a deferred-deletion record retries a failed delete. List the object keys before closure if the media is evidence. B-206 (evidence set-aside) is **not decided here**. |
| **[v0.3 CHANGED — new row]** Suspension and removal decisions | `AdminActionLog` (scoped read via `GET /admin/action-log`; full export by SQL); `User.accountStatus`, `User.suspendedByReportId` | Export the rows for the incident window by SQL; the retention sweeps never delete them. `suspendedByReportId` becomes `NULL` if the suspending report is deleted — record it earlier. |
| Email-change and recovery requests **[v0.2 CHANGED]** | Postgres `EmailChangeRequest`, `TwoFactorRecoveryRequest` | Note the rows and states for the affected accounts before cancelling or deleting anything. Ended recovery rows are removed 30 days after they end. |
| Media | R2 `private-media/` and `post-media/` | Object list and access logs if enabled `[UNVERIFIED]`. |
| Repository history | GitHub | Commit hashes; a secret ever committed is treated as exposed. |
| Sentry events | Sentry | Inactive until the DSN is real. |
| Email activity | Postmark | Message activity, bounces. |
| Screenshots / chat | Responders | Name files with date and time; do not store children's data in chat tools. |

### 8.3 Handling rules
- **Chain of custody:** who took each copy, when, from where, hash. Keep in the incident log.
- **Storage:** an encrypted location with named access; **never** an email attachment or a shared drive link.
- **Retention:** `[OPEN — Q8]` how long incident records and copies are kept, and how that squares with the retention schedule in
  the legal draft (PP §9). The incident log itself will contain personal data.
- **Law enforcement requests:** route to counsel; do not hand over data on a phone call. A report to the police `[OPEN — Q11]`
  is separate from a regulator filing.
- **Rejected media and CSAM:** rejected files are kept private and **never deleted** (B-206); the handling of material that may
  be illegal is **undecided and open under counsel**. A responder who finds possible CSAM must not copy, forward or view it
  further and goes to counsel at once.

### 8.4 Old evidence and the retention clocks **[v0.3 CHANGED — new section]**

*Draft for counsel review — not approved, not legal advice.* Sources: `messaging/README.md` "Retention" and "Held accounts",
`moderation/README.md` "Report retention", `post-media/README.md`, Decision Log #478, #482, #484, #487. Nothing here is a legal
conclusion; the figures are configuration and several are unverified for the jurisdictions concerned.

**What is deleted by itself, and when.**

| What | When | Anchor | Kept when |
|---|---|---|---|
| A direct message (and its edit original) | 12 months after it was sent, nightly at 04:00 | send time | Referenced by a report; attached as context to a report; an active **legal hold** on its sender or another participant |
| A report, and the content it removed (rows and stored media, in one transaction) | `REPORT_RETENTION_YEARS` (default **6**) after the report **closes** **[v0.4 CHANGED — #490]** (v0.3: 12 months), nightly at 04:15, at most 100 per run; **7 years** (`REPORT_RETENTION_CONCERNS_MINOR_YEARS`) if `concernsMinor` (v0.3: 6) | the report's closing time (dismissed: its review; actioned with no appeal: review plus the appeal window, default 30 days; appeal upheld: that decision). An **open** report, or one with an appeal pending, is never due | An active legal or bad-faith hold on the reporter, on the target's account or (message) on the sender or another participant; an **escalated** report (until counsel answers B-206); a removed post whose media is not deletable; another unclosed report on the same item. **Blocked** (kept and counted): the removed post is a Contest entry; a removed message is attached as context to a different report. **[v0.4 CHANGED — #493, B-299]** A hold record that references a due report no longer blocks it (the hold stays, its report link is cleared), and an escalated Contact Us enquiry no longer blocks it (it is detached and returns to its 12-month clock) |
| A removed post's private media | When the removing report closes | as above | Uploader under an active admin hold, or another report on the post still open |
| `AdminActionLog`, earned points | Never by these jobs | n/a | n/a |

**What this means when an incident needs old evidence (proposals for the founder and counsel).**
- An incident discovered **after** the window cannot rely on the platform to show which messages or reports were involved; only a
  database snapshot or a backup taken earlier would. The Neon snapshot in §5 step 3 is therefore the first evidence step, not an
  optional one (Neon's own retention window is `[PLACEHOLDER: point-in-time restore window]`).
- **A legal hold is the built way to stop these deletions for the people and reports it covers**; it needs an existing report
  and a real account, and **no one is notified** when it is placed. Placing one is a moderator or superadmin action (§4.10), so
  the incident lead asks the safeguarding lead to place it, and records why in the incident log.
- **An escalated report is kept** until counsel answers the evidence question (B-206). This plan **does not decide** B-206 and does
  not change how rejected media or possible illegal material is handled (§8.3 is unchanged).
- Because the retention clocks are configuration, a **very large value and a redeploy** is the only known way to pause them
  (`[UNVERIFIED]`, never tried). Use it only on counsel's advice: it keeps children's data longer than the legal draft's schedule.
- The **incident log and the breach register** have their own retention (§8.3, Q8); they are not governed by these jobs.
- **[v0.4 CHANGED — #490, #493, B-299]** **A longer window both ways.** Reports are kept 6 years after closure (7 if they concern a minor), so evidence of an older incident is more likely to
  still be on the platform than v0.3 said, and so is more data to protect: a breach of the moderation store reaches further back (Q21). Reports are plain columns with no
  field-level encryption and reads are not logged, so an incident lead should not assume the platform can say who looked at a report.
- **[v0.4 CHANGED — #493]** **A held report keeps its enquiry.** While an active hold or an escalation keeps a report, the Contact Us enquiry escalated into it stays too (the 12-month
  enquiry job never deletes an escalated enquiry); it returns to the 12-month clock only after the report is purged. A legal hold has no end date. The enquiry may hold a name, an
  email and a message (and, for a suspension appeal, a child's account email). `[OPEN — Q24]`
- **[v0.4 CHANGED — #493]** **A purge leaves the hold record.** A hold that pointed at a purged report stays, with its report link cleared; it is audit evidence and the sweep never deletes it.

---

## 9. Records and post-incident review

*Draft for counsel review — not approved, not legal advice.*

### 9.1 The incident log (one per incident)
Fields: id; date and time of first report; **date and time of awareness** (the legal clock); who reported; class; systems and
data involved; whether minors / under-16s are among those affected (and how many); containment steps with times; decisions
(who, when, why, on whose advice); notifications sent (to whom, what, when, copy); open actions; closed-on date. **[v0.3 CHANGED — also record the id and closing date of every report involved, any content removal or suspension made during
the incident (who, when, which report), and any legal hold placed (§4.10, §8.4).]** Also keep a
**breach register** across incidents including the ones judged not notifiable and the reason (UK Art. 33(5) — `[UNVERIFIED]`).

### 9.2 Review within `[PROPOSAL: 14]` days
- What happened, in plain language, without blame.
- Timeline against the clock (§6): were the 72 hours met; if not, why.
- Did containment work; what did we not have (§4.9) that we needed. **[v0.3 CHANGED — were any removals or suspensions used; did
  each send the right email and notice; were they reversed; did a retention sweep delete anything the incident needed?]**
- Which secrets, accounts and data were exposed; what has been rotated or reset.
- Was the notification to guardians and young people clear; any replies or complaints.
- Which documents change: this plan, `docs/dob-encryption-rollback.md`, `docs/admin-two-factor-recovery.md`, the DPIA (R10–R12),
  the legal draft Part C rows 11 and 21.
- **Does the DPIA need re-signing?** (DPIA R12 treats it as a standing control.)
- Training / rehearsal: one tabletop per quarter `[PROPOSAL]` and one full rehearsal on staging before launch (aligns with
  B-267 (k)).

### 9.3 Sign-off
The review is signed by the incident lead and the data-protection contact `[PLACEHOLDER]` and filed with counsel. **This
section is a proposal; the DPIA's own sign-off block is deliberately empty and this file does not fill it.**

---

## 10. Contact templates

*Draft for counsel review — not approved, not legal advice.* Wording is **functional placeholder text for counsel to rewrite**;
none is approved; none is tagged for the manifest because none is in the product. Square brackets are placeholders. No template
contains a link that signs anyone in, a password, a date of birth, or a code.

### 10.1 Regulator — initial notification (UK; adapt for Nigeria)
```
To: [PLACEHOLDER: regulator reporting route]
Subject: Personal data breach notification — [Soccernity / legal entity name] — initial report

This is an initial notification under [UK GDPR Art. 33 / NDPA s. 40], made [within / after] 72 hours of becoming aware.
Reason for any delay: [PLACEHOLDER].

1. Organisation: [legal entity, registration number, address — PLACEHOLDER: not yet registered]
2. Contact for the regulator: [name, role, phone, email]
3. What happened: [PLACEHOLDER — circumstances]
4. Date and time of the breach, and of our becoming aware: [UTC and London times]
5. Data involved (categories): [PLACEHOLDER — e.g. email addresses, display names, ... ] 
6. Approximate number of people and records: [number; of whom children: number; under 16: number]
7. Likely consequences and our assessment of risk to individuals: [PLACEHOLDER]
8. Measures taken or proposed to contain and reduce harm: [PLACEHOLDER]
9. Whether and when individuals and guardians are being told: [PLACEHOLDER]
10. Information not yet available, and when we will update you: [PLACEHOLDER]
```
(Nigeria: the GAID Art. 33(5) list — circumstances; date/period; information involved; risk assessment; number at real
risk of significant harm; steps to reduce harm; steps to notify individuals; a named contact — maps onto items 3–10.)

### 10.2 Guardian (email)
```
Subject: An important message about [child's first name]'s Soccernity account

Hello [guardian first name],

We are writing because [child's first name] has a Soccernity account and you are listed as their guardian.

We have found that [PLACEHOLDER: one plain sentence — e.g. "someone who should not have had access was able to see some account details"] on [date].

What this may include: [PLACEHOLDER: categories in plain words — never the details themselves].
What we have done: [PLACEHOLDER].
What you may want to do: [PLACEHOLDER — e.g. be careful with unexpected messages that mention Soccernity; we will never ask for a password by email].

We are very sorry. If you have questions, reply to this email or write to [PLACEHOLDER contact]. [Name], [role], Soccernity
```
Note: carries no link to sign in and nothing a stranger could use if it reached the wrong address (§7.3).

### 10.3 Affected young person (16–17; adapt for younger — Q6)
```
Subject: Something we need to tell you about your Soccernity account

Hi [first name],

We found a problem that may have affected your Soccernity account on [date]. In simple terms: [PLACEHOLDER].

What was affected: [PLACEHOLDER].
What we've done: [PLACEHOLDER].
What you can do: choose a new password for any account that used the same one, and tell a parent or guardian.

If you want to talk to us, write to [PLACEHOLDER]. We're sorry this happened.
```

### 10.4 Affected adult user
Same as 10.3 in adult wording; add the regulator contact and the user's rights if counsel requires them.

### 10.5 Processor — incident notice to us / from us
```
To: [processor security contact]
Subject: Security incident affecting [service / account id] — request for information and action

We are the customer of record for [account]. At [time, timezone] we became aware of [PLACEHOLDER — one line].
Please: (1) preserve logs for [period]; (2) tell us whether [resource] was accessed from [PLACEHOLDER]; (3) rotate or revoke
[credential]; (4) confirm in writing what you hold that relates to our users. Our contact: [name, phone, email].
```
(A processor telling us: the processor's own obligation to tell its controller promptly is UK Art. 33(2) — `[UNVERIFIED]` for
the processor's contract terms; DPA/Art. 28 terms are a counsel item.)

### 10.6 Internal alert (to the roles in §3)
```
INCIDENT [id] — class [S1–S4] — declared [time]. Lead: [name]. Facts: [3 lines]. Do not discuss outside this channel.
Next check-in: [time]. Evidence: preserve before changing anything (see §8).
```

### 10.7 Account suspended as a precaution during an incident — note to the account holder **[v0.3 CHANGED — new template]**

*Draft for counsel review — not approved, not legal advice.* Proposed because the platform's automatic suspension email gives a
fixed reason line ("breaching our community rules", §4.10) that is wrong for someone whose account was taken over. **Not in the
product**; no variant of the automatic email exists. Sent by hand from `support@soccernity.com` to an address the responder has
confirmed is the owner's, **not** necessarily the address on file.
```
Subject: Your Soccernity account has been paused
[COPY PENDING LEGAL REVIEW]

Hi [first name],

We have paused your Soccernity account while we look into a security problem. This is not because of anything you did wrong.
[COPY PENDING LEGAL REVIEW]

If you got an email from us saying your account was suspended for breaking our community rules, please ignore that reason: it
was sent automatically and does not apply here. [COPY PENDING LEGAL REVIEW]

We will write again when your account is back, or you can reach us at [PLACEHOLDER contact]. We will never ask for your password.
[COPY PENDING LEGAL REVIEW]
```
For a minor, the guardian's version follows §10.2 and is checked against the withhold flag first (§7.5). Whether this note is
needed, and what may be promised about points, `[OPEN — Q20]`.

---

## 11. Preconditions that sit outside this plan

*Draft for counsel review — not approved, not legal advice.* The plan can be *read* today but cannot be *run* until these exist.
They are listed so the founder and counsel see what the plan depends on; each is a separate register item.

- Real accounts and contacts for each processor (§4.8) and a written owner for each login.
- A real `SENTRY_DSN` and alert rules on `rate_limiter` (B-267 (c)); an on-call route that rings a human.
- `TRUST_PROXY_HOPS` verified so IP-based limits and country derivation see real client IPs (B-267 (b)).
- Upstash plan decision (Decision Log #439): a Redis outage stops sign-in, refresh, reset and verification, and is not a breach.
- The R2 public-address rule that keeps `private-media/` private, proven by a refused request (B-265).
- `ADMIN_2FA_ENFORCED = "true"` in production (B-267 (j)); a rehearsal of the DOB key rotation on staging (B-267 (k)).
- Production wiring itself is deferred to the launch gate (B-090).

---

## 12. Open questions for counsel

*Draft for counsel review — not approved, not legal advice.* **Nothing in this list is decided. Options are set out with their
trade-offs; the draft deliberately does not pick one.**

| # | Question |
|---|---|
| **Q1** | Which regimes apply on day one (UK GDPR, NDPA 2023, a US state or federal regime, EU GDPR)? Decision Log #4 is open. |
| **Q2** | When two regimes apply to one breach, is a single filing with merged contents acceptable, or two separate filings on separate clocks? |
| **Q3** | What exactly makes Soccernity "aware" for the 72-hour clock in each regime? The wording could not be read from the ICO page. Does a credible but unconfirmed report start it? |
| **Q4** | Is a **leaked database copy without the encryption key** a notifiable breach, and would the Art. 34(3)(a) "unintelligible" exception apply to the date of birth (encrypted) but not to email, name, `isMinor` and messages (not encrypted)? What if the key may also have leaked? |
| **Q5** | **Must a guardian be told** when a minor's data is breached, as a separate recipient (DPIA R10; PP §11 already promises it)? Who is the right person when the guardian's address is wrong, or when the child has turned 18 since consent? **[v0.2 CHANGED — still open. #456 tells guardians of security actions, not of breaches; see §7.5.]** |
| **Q6** | For under-13s and under-16s: is the child told directly, only the guardian, or both? Content and reading-age standard for a notice to a child? |
| **Q7** | Does the **absence of any breach-notification text** in the live legal copy (PP §11 says only "[PROPOSAL — technical standard TBD]") create a representation risk before launch? |
| **Q8** | Retention of incident records, evidence copies and the breach register, versus the retention table in the legal draft. **[v0.3 CHANGED — also versus the report retention periods in §8.4 (6 years; 7 years for a minor **[v0.4 CHANGED — #490]**; v0.3 said 12 months and 6), which run independently of any incident.]** |
| **Q9** | Should a standby, tested "send this fixed notice to this list" tool for guardians and users be built before launch? (Today none exists; §4.9.) Who authorises its use? |
| **Q10** | **[v0.2 CHANGED — SETTLED, no longer open under counsel for this question.]** Decision Log **#438 / B-263**: is a guardian told when a minor's sign-in is locked? **Settled by Decision Log #456 (founder, 2026-11-01): yes** — the guardian is emailed when a minor's sign-in lock trips, at most once per account per 24 hours (built, `LoginLockoutNotifier`; `guardian-security-notice/README.md`). See §7.5. This draft records the decision and takes no view on it; wording is plain copy tagged `[COPY PENDING LEGAL REVIEW]` in the platform's manifest, and no counsel position is recorded here. |
| **Q11** | Who else is told: police, insurers, the platform's processors' own regulators? Obligations to report suspected child-safety crimes? |
| **Q12** | Is one-person incident leadership acceptable at launch, or must a second named responder exist? Does counsel require a **data-protection officer** (UK GDPR Art. 37; NDPA's DPO duty for controllers of major importance, GAID Art. 11) — thresholds not verified here. |
| **Q13** | Nigeria: does the NDPA require Soccernity to register as a controller "of major importance"? That decides some reporting duties (GAID Arts. 8–9). Not assessed. |
| **Q14** | Is a **separate safeguarding-incident plan** (a child at risk, not a data breach) needed, and who owns the hand-off? |
| **Q15** | What may we say publicly, and when, if individuals cannot be reached? Who may speak for the company? |
| **Q16** | Privilege: how to route the assessment so that it is privileged in each jurisdiction? |
| **Q17** | Processor contracts: do the Art. 28 (UK/EU) and NDPA data-processing terms with Render, Neon, Upstash, Postmark, Sentry, R2 and AWS give us the notice speed this plan assumes (a processor must tell the controller "without undue delay")? Cross-border transfer assessments (DPIA R11). |

### Q10 — settled in v0.2, v0.1 options kept for the record **[v0.2 CHANGED]**

*Draft for counsel review — not approved, not legal advice.* v0.1 set out five options (A do nothing; B every lockout; C only
when the account-wide ceiling of 20 failed attempts in 24 hours trips; D a batched or other channel; E under-13 or under-16
accounts only) and picked none. The founder has since decided (Decision Log #456) that the guardian of a minor is told of
every security action on the account, **including a sign-in lock, at most once per account per 24 hours** — the broadest of
those options, throttled. Withheld accounts (#458) are excluded by the platform, not by this plan (§7.5). Questions this
decision leaves for counsel — not reopened here — are the privacy-notice and DPIA treatment of the guardian's email for this
purpose, and whether a stranger who can trigger a lock by guessing a password can in effect cause an email to a guardian
(the throttle bounds it to one per day per account).

### New questions added in v0.2 **[v0.2 CHANGED]**

| # | Question |
|---|---|
| **Q18** | Does the "withhold guardian notices" flag (#458) also stop a **breach** notice to that guardian? Who decides, given the reason is visible only to child-safety-vetted admins? (§7.5) |
| **Q19** | **[v0.3 CHANGED — a legal hold now exempts: Decision Log #482 keeps a message when an active legal hold exists on its sender or on any other participant; a bad-faith hold and report-derived holds still do not.]** Direct messages are deleted after 12 months (#478) with their edit originals, except where a report points at them. If an incident is discovered after the retention window, or while a hold is in force, may the platform be unable to show which messages were exposed — and does counsel want the job paused while an incident or hold is open? Messages are not end-to-end encrypted, so a database leak exposes the text of every message still within 12 months. |

### New questions added in v0.3 **[v0.3 CHANGED]**

| # | Question |
|---|---|
| **Q20** | A suspension (user page or report) always emails the person at the address on file with a fixed reason line, and revokes earned points without restoring them (#485). When a suspension is used to contain an account takeover: may a different or no email be sent; may the address on file, which an attacker may have changed, be used; and is the §10.7 hand-sent note acceptable? Should points be restored when a suspension was precautionary? (§4.10) |
| **Q21** | **[v0.4 CHANGED — #490]** Reports are deleted 6 years after closure and 7 years for a minor (v0.3: 12 months and 6; the range is the one recorded as counsel-approved in the legal draft v0.7, not re-confirmed here). If an incident is discovered after a report has been deleted, the report and the content it removed are gone from the platform. Do those periods suit a safeguarding record that may be needed for a later inquiry, or for a statutory report; and does counsel want a legal hold placed automatically on any report linked to an open incident? (§8.4) |
| **Q22** | Removed content is **soft-removed**: it stays in clear text in Postgres, and the private copy of a removed post's media stays until the report closes (#483, #484). Is that an acceptable position for a platform whose users and guardians are told the content has been taken down; is the Privacy Policy draft's retention text consistent with it; and how does it relate to the open B-206 question about rejected media and evidence? **This plan does not decide B-206.** (§1, §8.4) |
| **Q23** | A message report whose reported sender or any participant is under 18 hides the attached context and the edit original from every admin who is not child-safety-vetted (#486). In a breach affecting messages, the people who must assess exposure may not be vetted. Who is allowed to read those messages for the purpose of the assessment, and is a vetted admin required on the incident team? (§3) |
| **Q24** | **[v0.4 CHANGED — new; #493, #492, #494]** (a) A report that is held or escalated keeps the Contact Us enquiry escalated into it, with its name, email and message, until the report is purged; a legal hold has no end date. Is that acceptable, and who decides when a hold ends? (b) A suspension-appeal enquiry may hold a child's account email and sits in an inbox readable by any moderator or superadmin; does counsel want it limited to child-safety-vetted staff when the sender is a minor? **[FOR FOUNDER — not a counsel blocker]** for the design; counsel for whether the exposure is acceptable. (c) The suspension email goes to the address on file (recorded, not decided): if the incident was an account takeover, the attacker may receive it. (§4.10, §8.4) |

---

## 13. Sources and what was not verified

*Draft for counsel review — not approved, not legal advice.*

**Repository sources read:** `docs/build-register.md` (B-253, B-263, B-267, Sections 51/53/55/61); Decision Log #426 and #438 in
`docs/Soccernity_MVP_Build_Plan_v1.7.docx`; `docs/legal-copy-draft-tos-privacy-policy.md` (Part C row 11 / 21; PP §11);
`docs/sprint-1-dpia-outline-draft.md` (R10–R12 and §4 rows); `docs/dob-encryption-rollback.md`;
`docs/admin-two-factor-recovery.md`; `docs/deployment.md`; `services/api/src/validate-runtime-env.ts`;
`services/api/src/instrument.ts`; `services/api/prisma/schema.prisma`; the token stores and revocation call sites;
`services/api/src/modules/admin-action-log`.

**Repository sources added in v0.2:** `services/api/src/modules/guardian-security-notice/README.md` and its constants;
`services/api/src/modules/two-factor/README.md` ("Recovery", "Recovery and the withhold flag");
`services/api/src/modules/email-change/README.md`; `services/api/src/modules/messaging/README.md` ("Reporting a message",
"Retention", "Edit, delete for me, delete for everyone"); `services/api/src/modules/moderation/README.md` ("Reporting a
message in a chat", "Context messages"); `services/api/src/modules/admin-users/README.md` ("Guardian notices"); Decision Log
entries #455–#459 and #476–#480 as recorded in `CLAUDE.md`. Not re-read in v0.2: the docx itself.

**Repository sources added in v0.3 (all read on `origin/main` `0e440bf`, 2026-11-11):** `services/api/src/modules/moderation/README.md`
("`actionTaken`: `content_removed` is enforced", "Recording `user_suspended` suspends the account", "Report retention", "Vetted-only
context"); `services/api/src/modules/post-media/README.md` ("Media of a post removed by moderation", B-296);
`services/api/src/modules/account-suspension/account-suspension.service.ts`; `services/api/src/modules/admin-users/README.md`
("Suspension needs a reason category"); `services/api/src/modules/messaging/README.md` ("Retention", "Held accounts");
`services/api/src/modules/admin-action-log/README.md` (the read route); Decision Log entries #482 to #487 as recorded in
`CLAUDE.md` and `docs/docs-suspension-retention-decisions-2026-11-11-report.md`. Not re-read in v0.3: the docx itself. **Not
verified in v0.3:** the legal basis of the 6-year figure; any behaviour against a live system; whether the suspension email
reaches an attacker-changed address (inferred from code, not run); the absence of an admin route to file a report (inferred from the
routes).

**External sources:**
- UK GDPR Art. 33 — <https://www.legislation.gov.uk/eur/2016/679/article/33> (via search summary; not read in full)
- UK GDPR Art. 34 — <https://www.legislation.gov.uk/eur/2016/679/article/34> (via search summary; not read in full)
- ICO, Personal data breaches: a guide — <https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/> (**could not be opened**: HTTP 503 and timeouts on every attempt)
- ICO, "72 hours — how to respond" — <https://ico.org.uk/for-organisations/sme-web-hub/72-hours-how-to-respond-to-a-personal-data-breach> (**could not be opened**)
- Data (Use and Access) Act 2025, Part 5 Ch. 2 — <https://www.legislation.gov.uk/ukpga/2025/18/part/5/chapter/2/enacted> (search-result mention only: PECR window 24 → 72 hours)
- NDPC, GAID 2025 (reference NDPC/NDP ACT-GAID/01/2025) — <https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf> (**read**, Arts. 33, controller-duties list; quotes NDPA s. 40(2))
- NDPC breach portal — <https://services.ndpc.gov.ng/breach/> (opened; heading only)
- Third-party NDPA summaries (used only to point at items to verify): Mondaq, Afriwise, KPMG review of the NDPA.

**Not verified, for counsel (consolidated):** the meaning of "aware" in each regime; the ICO's current filing route and whether
it is still the regulator's name; the ICO's list of report fields; the internal-record duty (Art. 33(5)) and the processor duty
(Art. 33(2)) in the primary text; NDPA s. 40 text itself (including s. 40(1) processor duty and s. 40(5) public communication);
the conflict between the GAID's "all affected" and "high risk" wording for notifying individuals; any children-specific
breach rule in Nigeria; the NDPC portal's form and any out-of-hours route; whether the Nigerian regime treats the platform as a
controller of major importance; everything for the US and EU.

---

*End of draft v0.4. DRAFT FOR COUNSEL REVIEW — NOT APPROVED, NOT LEGAL ADVICE. The DPIA sign-off block, the legal draft, the
Log Book, the register and the Build Plan were not edited by this draft.*
