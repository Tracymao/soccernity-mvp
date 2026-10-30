# contact (B-046, part A)

The public **Contact Us** form: `POST /contact`, its storage, rate limits, the support notification and the
retention job. Decision Log #440 (retention, the founder's own decision) and #444 (the escalate action), and
the founder decisions of 2026-10-30. **Part B is not built here:** the admin inbox (list, mark handled,
escalate an enquiry into a report). The columns it will write (`status`, `handledAt`, `handledByAdminId`,
`escalatedReportId`) already exist so part B needs no second migration.

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
| message | 500 | `CreatePublicReportDto.reason` (the public route this one is modelled on) |
| name | 200 | `ChangeGuardianEmailDto`'s name |
| email | 254 | the same DTO's email limit |
| subject | 200 | no precedent for a subject line; the name limit was reused. **Veto-able.** |

500 characters is short for a free-form message; it is the only existing precedent, and raising it is a
one-constant change (`CONTACT_MESSAGE_MAX_LENGTH`).

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
acknowledgement goes to the enquirer. The link is `ADMIN_APP_BASE_URL` + `/contact-enquiries` (a **proposed**
path, part B owns it); when `ADMIN_APP_BASE_URL` is unusable the email is still sent without a link. A send
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

- Part B: the admin inbox, "mark handled", and the escalate action (needs a design; no Figma frames exist).
- The `/contact-enquiries` admin path is a proposal.
- The privacy-policy wording is a separate drafting PR (Part C row 42).
- No `apps/web` page is wired to this endpoint yet.
