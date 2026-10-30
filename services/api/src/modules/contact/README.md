# contact (B-046, parts A and B)

The public **Contact Us** form: `POST /contact`, its storage, rate limits, the support notification and the
retention job. Decision Log #440 (retention, the founder's own decision) and #444 (the escalate action), and
the founder decisions of 2026-10-30. **Part B (the admin inbox: list, open, mark handled, escalate an enquiry into
a report) is the last section of this file** (`backend/w7-contact-enquiry-admin-escalate`). The columns it writes
(`status`, `handledAt`, `handledByAdminId`, `escalatedReportId`) already existed, so it needed no migration.

## The model

`ContactEnquiry` is a genuine addition beyond Section 3's entity list (flagged as a Decision Log candidate).
Migration `20261103090000_add_contact_enquiry`, additive, with CHECKs on `category`, `status` and
"`handledAt` and `handledByAdminId` are both set or both null". All three foreign keys (`userId`,
`handledByAdminId`, `escalatedReportId`) are **RESTRICT**, stated explicitly: an escalated enquiry must never
be silently un-escalated, and a `User` row is never deleted from under an enquiry.

`name` and `email` are what the sender **typed**, not a copy of the account's. `userId` is set only when the
sender was signed in (see below).

Categories (the six options of the Figma `Contact Category Dropdown`, `6130:14653`): `technical_issues`,
`editorial_complaints`, `data`, `livescores_issues`, `suggestions`, `enquiries_feedback`.

## `POST /contact`

Public. `OptionalJwtAuthGuard` (it never rejects; it fills `request.user` only when a valid bearer token came
with the request), so a signed-in sender's enquiry is linked to their account. A token whose account is not
`active` (deactivated, pending deletion, suspended, anonymised) or no longer exists is stored as a guest's. No
consent / email-verified / profile-complete guard: a restricted-pending or unverified account must still be able
to write to support (`write-route-guards.spec.ts` pins it).

Body: `name`, `email`, `category`, `subject`, `message`. Every string is **trimmed before validation**;
whitespace-only fails. **Control characters are refused**: none at all in name, email and subject; in the
message every control character except tab, line feed and carriage return. Unknown fields are a 400. Response:
`201 { "received": true }`, nothing else (no id, no echo of the text).

### Limits used (not invented)

The Contact Us frames draw **no character counter** (checked on the live frame `6113:14053`), so:

| field | max | taken from |
|---|---|---|
| message | 3000 | `MESSAGE_TEXT_MAX_LENGTH` (direct messages), the largest free-text user-message limit in the repo (founder decision 2026-10-30; it was 500, from `CreatePublicReportDto.reason`) |
| name | 200 | `ChangeGuardianEmailDto`'s name |
| email | 254 | the same DTO's email limit |
| subject | 200 | no precedent for a subject line; the name limit was reused. **Veto-able.** |

The `message` column is plain `TEXT NOT NULL` with no length CHECK (migration `20261103090000_add_contact_enquiry`),
so the limit lives only in the DTO and, for the typing cap, in `apps/web`'s own copy of the constant. The escalated
Report's `reason` stays capped at 500 (`CONTACT_ENQUIRY_REPORT_REASON_MAX_LENGTH`, the report routes' bound); the full
message stays on the linked enquiry, which the admin report view shows.

### Rate limits

1. **Per IP:** the shared `@AuthRateLimit()` (the one `POST /reports/public` uses), configurable through
   `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS`. `@SkipGlobalWriteLimit()` because the route carries its
   own limits.
2. **Per email address:** 3 per hour, in `ContactService`, through the same `AuthLimitsStore` the
   forgot-password limit uses (atomic `INCR`, key = SHA-256 of the normalised address, never a raw address;
   same in-memory fallback if Redis is down). `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_MAX` /
   `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_WINDOW_MS`. Over it: `429`, code `contact_email_rate_limited`, a plain
   message with no number. The key derives from the submitted address alone, so the answer never depends on
   whether an account exists for it.

### Notification

On each stored enquiry ONE email goes to `SUPPORT_INBOX_EMAIL` (default `support@soccernity.com`): the
**category label and a link to the admin inbox, never the name, email, subject or message**. No
acknowledgement goes to the enquirer. The link is `ADMIN_APP_BASE_URL` + `/moderation/contact-enquiries` (the
`apps/admin` route; it was first built as `/contact-enquiries`, a path no admin route matches, fixed in
`backend/w7-contact-followups`); when `ADMIN_APP_BASE_URL` is unusable the email is still sent without a link. A send
failure never fails the submission (fire-and-forget, one warning with no personal data). Nothing in this
module ever logs the message body.

## Retention

`ContactEnquiryRetentionService`, daily at 03:45 (after the 03:00 deletion sweep and the 03:30 purge): deletes
enquiries whose `lastMessageAt` is **strictly older** than `CONTACT_ENQUIRY_RETENTION_MONTHS` (default 12,
Decision Log #440, calendar months through `setUTCMonth`), oldest first, at most 200 per run, counts only in the
log. **Never deletes an escalated enquiry** (`escalatedReportId` set, #444): the test is in the SELECT and
repeated in the DELETE. Today an enquiry has one message, so `lastMessageAt` equals `createdAt`; a future reply
feature bumps it.

## Account deletion

- `AccountDeletionSweepService.anonymizeUser` deletes the user's enquiries **with no `escalatedReportId`**, in
  its transaction. It is deliberately not in `deleteBehaviouralRows`: a report-held account is minimised, not
  erased, and keeps what a case may need.
- `ContactEnquiry.user` is classified as **content** in `anonymized-row-purge.references.ts`: what is left after
  anonymisation is escalated by design and **blocks the purge** of that account row, like a report. Once the
  escalated enquiry itself is gone (its record's retention ended) the row can be purged.

## Configuration

All four are documented in `.env.example` with code defaults equal to the decided values.

| variable | default |
|---|---|
| `SUPPORT_INBOX_EMAIL` | `support@soccernity.com` |
| `CONTACT_ENQUIRY_RETENTION_MONTHS` | `12` |
| `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_MAX` | `3` |
| `CONTACT_ENQUIRY_EMAIL_RATE_LIMIT_WINDOW_MS` | `3600000` |

**Not yet in `render.yaml`** (this PR's brief forbade editing it). `src/env-completeness.spec.ts` normally
fails the build for a variable that is read in code but missing from `render.yaml`, so these four are listed in
a narrow, commented exemption there (`CONTACT_NOT_YET_IN_RENDER`). Follow-up: add them to both services of
`render.yaml` and delete the exemption.

## Not built / follow-ups

- The support email links to the inbox list (`/moderation/contact-enquiries`), not to the one enquiry; the email
  carries no enquiry id by design (it must not carry personal data).
- A deep link like `/moderation/contact-enquiries` only works once the admin host rewrites unknown paths to
  `index.html`. `render.yaml` defines no admin static site yet (B-179, launch gate), so that rewrite is still to be
  configured when the site is created.
- The privacy-policy wording is a separate drafting PR (Part C row 42).
- No `apps/web` page is wired to this endpoint yet.

## Part B: the admin inbox (`backend/w7-contact-enquiry-admin-escalate`)

Decision Log #444 (escalate) and #445 (build defaults), founder decisions 2026-10-30. No `apps/admin` screens yet
(the frames are `docs/figma-admin-contact-enquiries-report.md`). All four routes sit on
`ContactEnquiryAdminController`: `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` (401 with no
token or a User token, 403 for an editor).

| Route | Does |
|---|---|
| `GET /admin/contact-enquiries?status=&category=&cursor=&limit=` | newest first, keyset cursor, default 20 / max 50; `status` is `new` or `handled`, `category` one of the six; anything else is a 400. Items: `id, name, email, category, subject, status, createdAt, lastMessageAt, handledAt, handledByAdminId, submitter ('signed_in' or 'guest'), hasEscalation`. **No message text in the list.** |
| `GET /admin/contact-enquiries/:id` | the list fields plus `message`, `userId`, `escalatedReportId`. 404 if unknown. |
| `PATCH /admin/contact-enquiries/:id/handled` `{ handled }` | `true` = `status` handled, `handledAt` now, `handledByAdminId` the admin; `false` = reopen, all three cleared together (the CHECK needs that). **Idempotent**: setting the state it is already in writes and audits nothing. |
| `POST /admin/contact-enquiries/:id/escalate` `{ severity, concernsMinor, reason }` | `201 { enquiry, report }`. See below. |

Audit (`AdminActionLog`, targetType `contact_enquiry`): `contact_enquiry.handled`, `.reopened` (only when the
status really changes, in the same transaction) and `.escalated` (in the same transaction as the Report; notes =
report id, severity, minor flag and the admin's reason, never the enquirer's text).

### Escalate

One transaction. `severity` (low / medium / high / critical) and `concernsMinor` are the admin's own judgment and
required; `reason` is 10 to 500 characters (the existing hold-reason DTO pattern, trimmed; spaces only is a coded
400 `escalation_reason_invalid`) and goes to the audit row, not to the Report.

It creates a **`Report`** with `targetType: 'enquiry'`, `targetId` = the enquiry id, `reporterId: null`,
`reporterContactName` / `reporterContactEmail` copied from the enquiry, `status: 'open'`, the admin's `severity`
and `concernsMinor`, and `reason` = "Contact enquiry (<category label>) - <subject>: <message>" capped at 500
characters with an ellipsis (the full message stays on the enquiry). It sets `escalatedReportId` with a guarded
`updateMany` (`escalatedReportId IS NULL`), so two simultaneous escalations produce one Report (one 201, one 409
`contact_enquiry_already_escalated`) and the loser's Report is rolled back. A second escalation of the same
enquiry is the same 409.

**It does not touch `Report.escalatedAt` / `escalatedByAdminId` / `escalationNotes` / `escalatedToAuthority`:**
those mean escalation to a child-safety lead or an authority, a different act.

Order of refusals (the moderation module's): reason 400, enquiry 404, then, **only when `concernsMinor` is true**,
the child-safety-vetting gate (coded 403 `child_safety_vetting_required`, any role), then the 409.

`'enquiry'` can be created ONLY here: it is deliberately not in `REPORT_TARGET_TYPES`, so `POST /reports` and
`POST /reports/public` answer 400 for it.

### The report in the moderation queue

* `GET /admin/moderation/reports` items and `GET /admin/moderation/reports/:id` carry `source: 'contact_enquiry'`
  for such a report (the key is absent on every other report). The detail also carries `contactEnquiry` (id, name,
  email, category, subject, message, status, createdAt, userId).
* It has **no reported user**: `resolveReportedUserId` returns null for it, so closing it (dismiss or any action)
  creates no `Notification` row. The existing concerns-a-minor gate applies to it like any report (hidden from a
  non-vetted admin's queue, 403 on direct access).
* **It can never create a hold.** `findInvolvedReports` matches on `reporterId`, a `user` target or a post / comment
  author, none of which an enquiry report has, so no report-based hold arises (open, appeal window or post
  closure). `HoldService` refuses both admin place routes for it with a coded 409 `hold_not_applicable`. Proven
  in `test/contact-enquiry-admin.e2e-spec.ts` even for a signed-in enquirer who is a `pending_deletion` account
  sharing the contact email.
* An escalated enquiry is never deleted by the 12-month job and blocks the purge of its submitter's row (part A).

### Flagged, not decided

* **The existing outcome email (#143) reaches `reporterContactEmail`.** Closing an enquiry report with an action
  other than "dismissed" sends the public-reporter outcome email to the address the enquirer typed, which #445
  notes may not be theirs. Not changed here.
* A non-vetted admin still sees an enquiry that was escalated with `concernsMinor: true` in this inbox (the
  gate is on the Report, not on the enquiry). Whether it should be hidden is the open question the Figma pass
  also records.
* The actions that make sense on an enquiry report (only "dismissed" is drawn) are not restricted server-side.
