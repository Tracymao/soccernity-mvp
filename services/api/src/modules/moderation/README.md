# moderation module

Build target: **Sprint 5** — Section 4.8 (Admin Service) + Section 8.4
(Moderation & appeals workflow) of the MVP Build Plan. Built by
`sprint-5/admin-moderation-queue-backend` (backend-api, 2026-09-15),
Sprint 5's real blocker per the task brief that dispatched this work.

Backs `apps/admin/src/pages/moderation/ModerationQueuePage.tsx` and
`AppealReviewPage.tsx` — both real, Figma-derived UI shipped as
self-documented STUBS ("no moderation-queue backend exists," Decision Log
#135/#189). This PR builds that backend; converting those two screens
from stubs to real data is a separate `figma-to-code` follow-up, **not**
done here (out of scope per the task brief — "don't touch apps/admin's
stub pages").

`Report` (Section 3) gained reviewer/action/appeal-trail columns —
migration `20260915003318_add_report_moderation_fields`. `AdminUser`
gained two mechanical reverse-relation array fields for the same reason
`User` has gained several across this codebase's history — no new
business data of their own. **A real, hand-run `prisma migrate dev`
confirmed this migration applies cleanly**, both against the live dev
database and (via the e2e layer's own `global-setup.ts`) against
`soccernity_test` — this sandbox reached `binaries.prisma.sh` fine, so
this is not a "flagged, unverified" migration.

`User` / `Guardian` safeguarding fields are untouched — only `Report` and
`AdminUser` change (confirmed by schema diff).

**schema/report-severity-escalation-admin-vetting-application
(backend-api, 2026-09-27)** is the application half of a later schema PR
(`schema/report-severity-escalation-admin-vetting`) that had added
`Report.severity`/`escalatedAt`/`escalatedByAdminId`/`escalationNotes`/
`escalatedToAuthority` and `AdminUser.childSafetyVetted`/`vettedAt`/
`vettedByAdminId` — again flagged "no application code... yet." This PR
is that application code: `severity` on submission, the child-safety-
vetting gate on the admin routes, and the new `.../escalate` route. **Zero
new schema/migration** — every field was already there. See "`severity`
on submission" and "The child-safety-vetting gate" sections below.

---

## Endpoints

| Method & path | Guards | Purpose |
|---|---|---|
| `POST /reports` | `JwtAuthGuard` | Report a post, comment, or user. Accepts an optional `severity`. **Genuine spec-gap addition** — see below. |
| `POST /reports/public` | none (`@AuthRateLimit()` only) | A non-authenticated party reports content that depicts them or their child. Accepts an optional `severity`. **Genuine spec-gap addition, feat/public-report-submission** — see below. |
| `POST /reports/:id/appeal` | `JwtAuthGuard` | The reported user appeals an actioned report. **Genuine spec-gap addition** — see below. |
| `GET /admin/moderation/reports` | `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` + the child-safety-vetting gate | The moderation queue, keyset-paginated, optional `?status=` filter. Section 4.8's literal line. |
| `PATCH /admin/moderation/reports/:id` | `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` + the child-safety-vetting gate | Action a report: content removal, warning, suspension, or dismissed. Section 4.8's literal line. |
| `PATCH /admin/moderation/reports/:id/appeal` | `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` + the child-safety-vetting gate | The second-reviewer decision — upheld or overturned. **Genuine spec-gap addition** — see below. |
| `PATCH /admin/moderation/reports/:id/escalate` | `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` + the child-safety-vetting gate | Records that a vetted admin has escalated the report (internally and/or to an external authority). **Genuine spec-gap addition, schema/report-severity-escalation-admin-vetting-application** — see below. |

All four admin routes are the first role-gated admin surface in this
codebase — see "The role-gating guard" below. Three of them are ALSO the
first surface gated on `AdminUser.childSafetyVetted` — see "The
child-safety-vetting gate" below. Setting that flag on another admin is a
SEPARATE endpoint, `PATCH /admin/users/:id/child-safety-vetting`
(superadmin-only) — see `modules/admin-staff-vetting/README.md`.

---

## `POST /reports/public` (feat/public-report-submission)

`schema/report-severity-escalation-admin-vetting` made `Report.reporterId`/
`.reporter` optional and added `reporterContactEmail`/`reporterContactName`/
`concernsMinor`, explicitly flagged as "schema groundwork only... no
application code wiring such a route." This is that route.

- **A separate controller (`PublicReportsController`), not a third method
  on `ReportsController`** — `ReportsController` applies `JwtAuthGuard` at
  the class level, and this route serves a caller who has no Soccernity
  account for the purposes of this one report (a parent, a school, a
  member of the public) — same "the credential is per-route, not a
  session" reasoning `GuardianConsentController` already established for
  its own unguarded, token-credentialed routes.
- **`@AuthRateLimit()` (the shared, env-driven `'auth'` throttler) is the
  only anti-abuse control** — there is no CAPTCHA infrastructure anywhere
  in this repo, and none is invented here. Same reuse pattern
  `admin.module.ts` already documents for importing `AuthRateLimitModule`
  a second/third time.
- **`CreatePublicReportDto` requires `reporterContactEmail`** (unlike the
  schema column, which stays nullable for a hypothetical future
  genuinely-anonymous route) — this endpoint's whole point is to let
  Soccernity follow up and to send the acknowledgment email below, so a
  submission with no way to reach the reporter back would defeat it.
  `reporterContactName` is deliberately not collected by this route.
- **On success, `ModerationService.createPublicReport` fires a plain
  acknowledgment email** to `reporterContactEmail`, reusing
  `RegistrationEmailService` (this codebase's one existing
  "queue a transactional email" abstraction — see
  `age-reclassification-sweep.service.ts` for the same "outside
  auth/registration, still reuse this service directly rather than
  build a second one" pattern) via a new `'public-report-acknowledgement'`
  template. The copy makes **no promise about outcome or timeline**
  beyond "a moderator will review this" — Report's own severity/
  escalation trail (from `schema/report-severity-escalation-admin-vetting`)
  means the real handling time is genuinely unknown at submission time.
  Fire-and-forget with a logged warning on failure, the same
  "must never block on / fail because of email delivery" discipline
  `RegistrationService` already applies to its own sends — a failed send
  must not fail report submission, and this caller has no session to
  retry against anyway.
- **Reuses the existing `Report` table and moderation queue** — no
  parallel model. A publicly-submitted report shows up in
  `GET /admin/moderation/reports` and can be actioned exactly like any
  other, with `reporterId: null` and `reporterContactEmail` set instead.
  `actionReport()`'s own notification step already treats a `null`
  `reporterId` as "no `User` row to notify" (see that method's own
  comment) — no change needed there.
- **New Decision Log candidate, not yet transcribed into the Build Plan
  docx**: whether `POST /reports/public` (and its exact shape — no guard,
  required contact email, no `reporterContactName`) should be formally
  written into Section 4, the same open question
  `sprint-5/admin-moderation-queue-backend`'s own README section already
  raised for `POST /reports`/`POST /reports/:id/appeal`.

---

## Two Decision Log candidates: the spec-gap endpoints (flagged, built anyway)

Section 4's API Contract Sketch never defines a report-**submission**
route, and never defines an appeal-**review** route either — only the two
admin-side lines quoted in the table above (`GET`/`PATCH
/admin/moderation/reports`) exist in Section 4.8 literally. Both gaps are
real, not an oversight on this PR's part:

1. **`POST /reports`** — Section 2's Community feature list names
   "report/block" as in-scope, and Section 8.4's own workflow text ("a
   report is submitted... creating a `Report` record") assumes a
   submission path exists. Without it, nothing could ever create a
   `Report` row at all, making the rest of Section 4.8/8.4 unreachable.
   Built because the alternative — leaving the entire moderation-queue
   feature unreachable — is a bigger gap than one undefined route.
2. **`POST /reports/:id/appeal`** — same shape of gap. Section 8.4's own
   text describes "the reported user may appeal... a second
   admin/moderator reviews it" without ever defining either the
   submission or the review route. `PATCH
   /admin/moderation/reports/:id/appeal` (the review side) is *also* not
   a literal Section 4.8 line — it was built alongside the submission
   route since the workflow makes no sense with only one half.

Neither is treated as self-evidently correct — flagging both here per
the task brief's own explicit instruction, for a founder/Decision Log
call on whether the exact shape (route names, guard choices) should be
formally written into Section 4.

## A third Decision Log candidate: the `Report` schema addition

`reviewedByAdminId` / `reviewedByAdmin` / `reviewedAt` / `actionTaken` /
`appealStatus` / `appealReason` / `appealedAt` /
`appealReviewedByAdminId` / `appealReviewedByAdmin` / `appealReviewedAt`
are a genuine addition beyond Section 3's original six-field `Report`
list (`id`, `reporterId`, `targetType`, `targetId`, `reason`, `status`,
`createdAt`), flagged per `CLAUDE.md`'s "the data model is a fixed spec"
rule rather than added silently. Without these, there is no way to record
who reviewed a report, what action was taken, or the appeal trail Section
8.4's own workflow text assumes exists — see the schema's own comment on
`Report` for the full reasoning.

---

## The role-gating guard (`AdminRolesGuard` / `@AdminRoles(...)`)

The first role-gated admin route in this codebase. Every admin route
built before this PR checked only `AdminJwtAuthGuard` (a valid
admin-console token exists at all) — nothing distinguished `editor` |
`moderator` | `superadmin`. `AdminUser`'s own schema comment already
describes two different jobs ("authors Articles; actions Reports"), and
the task brief was explicit: **an editor should not have queue access.**

Built as reusable infrastructure, not a one-off inline check:
`admin/guards/admin-roles.decorator.ts` (`@AdminRoles(...roles)`,
`SetMetadata`-backed) + `admin/guards/admin-roles.guard.ts`
(`AdminRolesGuard`, a `Reflector`-based `CanActivate`). Both live in
`modules/admin/guards/` (not `modules/moderation/`) since this is
generic admin infra, not moderation-specific — any future admin route
needing role-gating (e.g. a superadmin-only admin-management endpoint,
Decision Log #191's still-open self-service-registration question) can
reuse it directly. `AdminRolesGuard` is now provided **and exported**
from `AdminAuthFoundationModule` alongside `AdminJwtAuthGuard`, so any
module that already imports that foundation module for admin auth gets
role-gating available for free — no new DI wiring needed (it depends
only on the globally-available `Reflector`).

**Trust model, a deliberate judgment call, documented in the guard's own
header comment**: `AdminRolesGuard` reads `request.admin.role` — the
`role` claim already baked into the verified access-token payload — and
does **not** re-read `AdminUser` from Postgres per request. This mirrors
the exact trust boundary `AdminJwtAuthGuard`'s own header comment already
draws for `sub`: a short-lived access token's claims are trusted for the
life of that token. Section 5.7's fresh-read-from-Postgres discipline
(re-check `isMinor`/`consentStatus` on every safety-sensitive User
action) is about safety-sensitive **User** state, not admin role
assignment — nothing in Section 5.7/8.3/8.4 extends that discipline to
admin roles, so a role change taking effect only on the admin's next
login (not retroactively mid-session) was judged an acceptable trade-off
for this PR. Flagged as a judgment call, not silently assumed to be
"obviously fine."

---

## `severity` on submission (schema/report-severity-escalation-admin-vetting-application)

`Report.severity` (`low | medium | high | critical`, schema default
`'medium'`) was laid down as schema groundwork with "no application code
reads or writes this yet." Both `POST /reports` and `POST /reports/public`
now accept an optional `severity` field; an omitted value is matched
explicitly at the service layer to `DEFAULT_REPORT_SEVERITY` ('medium',
`moderation.constants.ts`) rather than left to Prisma's own DB-level
default, so the documented API behaviour doesn't depend on a Prisma
undefined-vs-omitted nuance.

Deliberately **optional on both routes, not required** — a reporter
(authenticated or not) rarely has the context to assess severity
reliably; that's precisely what the moderation queue a vetted/unvetted
admin reviews exists to determine. This is a different judgment call from
`concernsMinor` on the public route, which **is** required there: a
non-authenticated reporter flagging content that depicts them or their
child is exactly the caller who can state *that* reliably.

---

## The child-safety-vetting gate (`ModerationService.assertChildSafetyVetted`)

`AdminUser.childSafetyVetted`/`vettedAt`/`vettedByAdminId` were laid down
as schema groundwork with "no application code reads or writes any of
these three fields yet — no vetting endpoint, no gate on Report review
keyed to this flag." This PR is that gate (the vetting endpoint itself —
`PATCH /admin/users/:id/child-safety-vetting` — lives in a separate
module, `modules/admin-staff-vetting/`).

**Fresh-read from Postgres on every call, never trusted from the JWT —
the same Section 5.7 discipline `GuardianConsentGuard` already applies
for the User side.** `AdminAccessTokenPayload` structurally carries only
`{ sub, role, aud }` (`admin-token.types.ts`) — no safety-sensitive state.
`childSafetyVetted` is exactly that kind of state, so
`ModerationService.isChildSafetyVetted`/`assertChildSafetyVetted` always
read `AdminUser.childSafetyVetted` fresh, per request, rather than
caching or trusting anything from a prior request or the token itself.
This is a **deliberate divergence from `AdminRolesGuard`'s own trust
model** (which reads `role` off the already-verified token and does NOT
re-read Postgres — see that guard's own header comment) — role
assignment and child-safety vetting are treated differently on purpose:
Section 5.7's fresh-read discipline is about safety-sensitive state, and
a report concerning a minor being reviewable only by someone whose
real-world vetting status is current is squarely that, in a way an
admin's role label is not.

**Applies REGARDLESS of role — a non-vetted superadmin is blocked exactly
the same as a non-vetted moderator.** Vetting is an orthogonal axis to
role, not a stronger role. Proven directly, not just asserted: both the
mocked and e2e suites include a case where an **unvetted superadmin**
still gets a `concernsMinor` report filtered out of the list / 403'd on
direct access.

**Two enforcement shapes, covering both ways an admin can reach a
report:**
1. **`GET /admin/moderation/reports` — filtering.** A non-vetted admin
   never sees a `Report` row where `concernsMinor` is `true` at all; it
   is excluded from the query (`conditions.push({ concernsMinor: false
   })`) rather than returned and then redacted, so no partial/masked row
   shape is ever needed. A `?status=` filter still ANDs alongside it
   normally.
2. **`PATCH /admin/moderation/reports/:id` and
   `.../:id/appeal` — "403 on direct access."** Existence (404) is always
   settled first (`assertReportExists`), matching this codebase's
   established "404 before 403" convention (see
   `FeedService.deleteComment`/`GrassrootsService`'s own precedent). Then,
   if — and only if — `report.concernsMinor` is `true`, the caller's own
   vetting status is checked; a non-vetted admin is rejected with a `403`
   carrying a distinct, machine-readable `code`
   (`CHILD_SAFETY_VETTING_REQUIRED_CODE`, same pattern
   `GUARDIAN_CONSENT_PENDING_CODE` already established), **before** any
   further business-state check (`actionReport`'s `status !== 'open'` 409,
   `decideAppeal`'s Decision Log #138 same-admin check) — so an
   unauthorized admin never learns the report's own state either. A
   report where `concernsMinor` is `false` (the common case) never
   triggers an `AdminUser` lookup at all — proven directly in the mocked
   suite.

**`PATCH /admin/moderation/reports/:id/escalate` is gated differently —
it ALWAYS requires vetting, regardless of the target report's own
`concernsMinor` value.** A report may need escalating *precisely because*
it wasn't flagged as concerning a minor at submission time but turns out,
on review, to be one — gating escalate on the (possibly wrong)
`concernsMinor` flag would defeat the point. Sets
`escalatedAt`/`escalatedByAdminId`/`escalationNotes`/`escalatedToAuthority`
(`Report`'s own schema comment on the escalation trail) — this endpoint
**records** that a human has escalated something outside (or within)
Soccernity; it does not itself contact anyone. Deliberately independent
of `Report.status`/`reviewedByAdminId`/`appealReviewedByAdminId` —
escalating is not the same act as actioning or appeal-reviewing, and may
be called on a report in any status (open, reviewed, or actioned).
**Deliberately re-callable, not one-shot**: `escalatedToAuthority` is
admin-supplied on every call (never defaulted), so a vetted admin can
escalate internally first (`escalatedToAuthority: false`) and, once they
have actually contacted an external authority, call the same endpoint
again to flip it `true` — each call overwrites the trail to reflect the
MOST RECENT escalation action, the same "no append-only audit trail
across multiple cycles" disclosed limitation this module's README already
states for the review/appeal trail (see that section below).

---

## Guard reasoning for the two user-facing routes

**`POST /reports` and `POST /reports/:id/appeal` are `JwtAuthGuard`
ONLY — deliberately NOT `GuardianConsentGuard`-gated.** This is a real
divergence from Decision Log #21's broad "posting"-class reading (which
gates `POST /posts`, banter-room posting, community-group creation,
etc.) — a restricted-pending minor must still be able to report abuse
directed at them, and symmetrically must still be able to appeal a
decision made against them. Gating either route the way posting/
messaging are gated would make that impossible — the opposite of what
the safeguarding flow exists for. This mirrors the same reasoning
`GuardianConsentController`'s own status endpoint already established:
a restricted-pending user must be able to reach certain routes *about
their own restriction* even while restricted.

---

## Who is "the reported user"? (dynamic resolution, no denormalized column)

`Report.targetId` is a bare string, not a real FK — by construction, it
has to point at three different tables (`Post`, `Comment`, `User`)
depending on `targetType`, which a single Prisma relation field can't
express. There is **no** `reportedUserId` column on `Report` — a
deliberate choice, not an oversight, per the task brief's own framing:
"you'll need to resolve 'who is the reported user' dynamically... share
that resolution logic."

`ModerationService.resolveReportedUserId(targetType, targetId)` is that
one shared private method, used by BOTH:
- `appealReport`'s eligibility check (only the reported user may
  appeal), and
- `actionReport`/`decideAppeal`'s notification steps (Section 8.4: both
  parties are notified of the outcome).

Resolution:
- `targetType: 'user'` → `targetId` IS the reported user, if they still
  exist.
- `targetType: 'post'` → the post's own `authorId`, if the post still
  exists.
- `targetType: 'comment'` → the comment's own `authorId`, if the comment
  still exists.

Returns `null` if the target has since been deleted (the reported
post/comment was removed, or — Decision Log #44's cascade — the reported
user's own account was hard-deleted). Every caller treats `null` as
"cannot determine the reported user," never as an error surfaced back to
a report's own reporter/admin actions — a stale report can still be
listed, dismissed, or actioned even if its target is long gone; it just
can't be appealed by anyone (nobody can prove they're the reported
party) and won't generate a second-party notification.

---

## The one-appeal-per-action-cycle design, and the overturn/re-action interaction

A report can be actioned, appealed, and (if overturned) re-actioned and
re-appealed — this required a real design decision, not just "extend the
schema and wire the two obvious endpoints":

- **`actionReport` only runs on an `'open'` report** — a 409 otherwise.
  The *only* path back to `'open'` after a first action is an
  **overturned** appeal (see below), which is precisely what re-opens the
  door to a fresh action + a fresh appeal window.
- **`appealReport` requires `status === 'actioned'`** (not `'reviewed'` —
  a dismissed report took no action against anyone, so there's nothing
  to appeal) **and requires `appealStatus` to still be `null`** — one
  appeal per actioning-cycle, whether that appeal is later upheld or
  overturned.
- **On `overturned`**: `status` reverts to `'open'`, `reviewedByAdminId`/
  `reviewedAt`/`actionTaken` are cleared back to `null` — "reverse the
  report back to a non-actioned state," per the task brief. `appealStatus`
  itself is **deliberately left as `'overturned'`** (not reset to `null`)
  as the historical record of that appeal round.
- **`actionReport`, when it re-actions a report that has a previous
  overturned appeal on it, clears the stale appeal fields
  (`appealStatus`/`appealReason`/`appealedAt`/
  `appealReviewedByAdminId`/`appealReviewedAt`) back to `null`** as part
  of the same update. This is the fix for a real bug this design would
  otherwise have: without it, `appealReport`'s own "already appealed"
  guard reads `report.appealStatus` off the same row, and a stale
  `'overturned'` value from the *previous* cycle would incorrectly block
  a legitimate *new* appeal on the *new* action. Proven directly by the
  e2e suite's own re-action → re-appeal scenario (see Testing below), not
  just reasoned about.

**Disclosed limitation, not silently absorbed**: this means a `Report`
row holds only the most recent action + appeal cycle — there is no
append-only audit trail across *multiple* action/appeal cycles on the
same report (e.g. "actioned, overturned, actioned again, upheld this
time" loses the detail of the first cycle the moment the second one
starts). A real production moderation system would likely want a
dedicated append-only `ModerationActionLog`/`AppealLog` entity for that —
following the same pattern `ConsentAuditRecord` already established for
consent history surviving a `User` row's own deletion. Flagged as a
future Decision Log candidate, not built here — genuinely out of this
PR's scope (the task brief scoped this to extending `Report` directly,
not building a new audit-ledger entity), and multi-cycle re-actioning is
itself an edge case beyond what the task brief's own example flow
describes.

---

## `actionTaken` is a recorded decision, not an enforced one (disclosed limitation)

`PATCH /admin/moderation/reports/:id` records one of `content_removed` |
`warning_issued` | `user_suspended` | `dismissed` — but recording it does
**not** itself enforce it. Confirmed by reading the schema directly
before building anything: there is no soft-delete/hidden flag on `Post`
or `Comment` anywhere in this codebase, and no admin-triggered
"suspend this user" endpoint on `User` (only the existing *self-service*
`deactivate-account`/`reactivate-account`/`delete-account` flow,
Decision Log #221, which an admin cannot call on someone else's behalf).
So `content_removed` does not hide the post; `user_suspended` does not
touch `User.accountStatus`. This PR builds the review/record-keeping/
notification workflow Section 4.8/8.4 describe, not the separate
content-moderation *enforcement* mechanisms that would need their own
schema/endpoint work (a `Post.isRemoved` flag + read-side filtering the
way `ACTIVE_AUTHOR_POST_FILTER` already filters deactivated authors; an
admin-triggered suspend path on `User.accountStatus`). Flagged, not
silently treated as "the action value alone is enough."

---

## Notification wiring

Both `actionReport` and `decideAppeal` write their `Report` update AND
the relevant `Notification` row(s) inside one interactive `$transaction`,
reusing the exact `tx.notification.create()`-inside-a-transaction pattern
`contest.service.ts`'s `contest_win` trigger established for
admin-triggered notifications.

**One shared `Notification.type` value, `'moderation_decision'`** — a
comment-only addition to the schema's `Notification.type` comment (the
column is a plain `String`, same as every other type value; no
migration needed), covering both events:
- `actionReport` → notifies **both** the reporter and the reported user
  (Section 8.4: "both parties are notified of the outcome"). Guarded
  against double-notifying the same person on a self-report (reporter ===
  reported user).
- `decideAppeal` → notifies **only** the reported user (the appellant) of
  the appeal outcome — not the reporter a second time, per the task
  brief's own instruction ("notify the reported user of the appeal
  outcome").

No self-notification guard is needed for the **admin's own** identity in
either method — a completely separate `AdminUser` auth domain (Decision
Log #189-193), mirroring `contest.service.ts`'s own `contest_win`
reasoning exactly (there is no identity overlap between the admin actor
and the `User` recipients).

**Disclosed limitation, not built here**: `notifications.service.ts`'s
read-side resolution (`GET /notifications`, Decision Log #290/#291) does
not yet know how to resolve `'moderation_decision'`'s `payloadRefId`
(the `Report` id) into structured display data — the same
category of gap that file's own header comment already discloses for
`like`/`comment` (resolves WHAT, not WHO). A future notifications-service
pass would need to fetch the `Report` and determine, from the caller's
own id vs. `reporterId`/the resolved reported-user id, whether this is
"your report was actioned" or "you were actioned" or "your appeal was
decided" — genuinely out of this PR's scope (this PR never touches
`modules/notifications/`).

---

## Testing

**Mocked suite** (`src/modules/moderation/*.spec.ts`,
`src/modules/admin/guards/admin-roles.guard.spec.ts`) covers ordinary
logic per `test/README.md`'s own "mocked unit tests stay the fast,
primary layer" principle: every guard/state/permission branch
(`createReport`'s three target-existence checks, `appealReport`'s
status/appealStatus/identity checks, `actionReport`'s `'open'`-only
guard and the dismissed-vs-actioned status mapping, `decideAppeal`'s
pending-appeal-only guard and Decision Log #138's same-admin rejection,
the overturn field-reset shape, self-notification guarding, keyset
pagination, and `AdminRolesGuard`'s own role-allow/deny behavior),
plus both controllers' HTTP-layer/DTO-validation behavior.

**A real e2e spec** (`test/moderation.e2e-spec.ts`) was added — this hits
two of `test/README.md`'s own e2e triggers:
- **A genuinely new Prisma relation**: `Report.reviewedByAdminId` /
  `.appealReviewedByAdminId`, both real FKs to `AdminUser` (`ON DELETE
  SET NULL`, matching `Post.clubPageId`/`.banterRoomId`'s own established
  optional-FK convention in this schema) — never exercised against real
  Postgres before this PR.
- **Transaction reasoning**: `actionReport`/`decideAppeal` write the
  `Report` update and the `Notification` row(s) in one transaction —
  proven by querying the real `Notification` table directly, not
  trusting the HTTP response.

The e2e file drives the full real flow the task brief specified end to
end against real Postgres: report → moderator A actions it
(`content_removed`) → the reporter (not the reported user) is rejected
when trying to appeal → the reported user appeals → moderator A (Decision
Log #138) is rejected from reviewing their own action's appeal →
moderator B overturns it → the report is genuinely back in the open
queue with `reviewedByAdminId`/`actionTaken` cleared and `appealStatus`
preserved as history → it is actioned again → a fresh appeal on the new
action succeeds (proving the stale-appeal-field-clearing fix). Also
covers: role-gating against real seeded `editor`/`moderator` `AdminUser`
rows; the real 404 for a well-formed but non-existent report target
(confirmed via a `Report.count()` of `0`); the real 409 for a duplicate
appeal attempt on the same action; the 403 for appealing an
open/dismissed report; direct `targetType: 'user'` reports and
appeal-eligibility for them; and `?status=` filtering/pagination against
real seeded rows.

**Verification, all re-measured directly (stash/pop before-and-after,
not estimated)**: mocked suite **60 suites / 854 tests, 0 failures → 64
suites / 905 tests, 0 failures** (4 new suites, 51 new tests — 27 in
`moderation.service.spec.ts`, 7 in `reports.controller.http.spec.ts`, 11
in `admin-moderation.controller.http.spec.ts`, 6 in
`admin-roles.guard.spec.ts`). Full e2e suite (real Postgres/Redis via
docker-compose, `npm run test:e2e`) **16 suites / 154 tests, 0 failures →
17 suites / 161 tests, 0 failures** (1 new suite —
`test/moderation.e2e-spec.ts` — 7 new tests; every pre-existing e2e suite
still passes unchanged, confirmed by running the whole suite together,
not just the new file in isolation). Migration
`20260915003318_add_report_moderation_fields` was genuinely
`prisma migrate dev`-run against the real local dev database (this
sandbox reached `binaries.prisma.sh` fine) and separately, independently,
genuinely applied by the e2e layer's own `global-setup.ts`
(`prisma migrate deploy` against `soccernity_test`) before any e2e test
ran — not a flagged, unconfirmed migration. `npx tsc --noEmit`,
`npm run lint`, and `nest build` are all clean.

---

## Testing (schema/report-severity-escalation-admin-vetting-application — severity, the child-safety-vetting gate, escalate)

**Mocked suite** — `moderation.service.spec.ts` gained: severity
default/explicit-override cases for both `createReport`/`createPublicReport`;
a dedicated `listReports` sub-block proving the vetted/non-vetted/no-row
filtering behavior (including "an admin with no `AdminUser` row at all —
a since-removed account behind a still-valid token — is treated as
non-vetted", the same defensive posture `GuardianConsentGuard` already
takes for its own analogous case); `actionReport`/`decideAppeal`
sub-blocks proving the 403-before-other-checks ordering, that a
`concernsMinor: false` report never even queries `AdminUser`, and that a
vetted admin succeeds; and a new `escalateReport` describe block (404,
403 for non-vetted, both `escalatedToAuthority` values, and
status-independence). `admin-moderation.controller.http.spec.ts` gained
an editor-403 case and DTO-validation/role-gating coverage for the new
`.../escalate` route, and its existing `listReports` call-shape
assertion was updated for the new `adminId` parameter.

**A new module, `admin-staff-vetting`, was added with its own full
mocked + e2e coverage** — see `modules/admin-staff-vetting/README.md`
for its own Testing section; not duplicated here.

**`test/moderation.e2e-spec.ts` gained**: a severity default/explicit-value
case against real Postgres; a `child-safety-vetting gate` describe block
proving, against real seeded `AdminUser` rows (including a `concernsMinor:
true` `Report` seeded directly via Prisma — see that block's own header
comment for why `POST /reports/public` itself is deliberately NOT used
here, the same shared-`'auth'`-throttler-avoidance precedent
`feed-reactions.e2e-spec.ts`'s own `createUser()` helper already
established) that an unvetted moderator AND an unvetted superadmin are
both blocked (list-filtered and 403'd on direct access) while a vetted
moderator/superadmin is not; and an `escalate` describe block proving the
403/200 split, that the trail persists in real Postgres, that it is
genuinely re-callable, and that it works regardless of report status.

**A new e2e file, `test/admin-staff-vetting.e2e-spec.ts`, was added** —
hits `test/README.md`'s third e2e trigger: `AdminUser.vettedByAdminId` is
a genuinely NEW self-relation FK (`AdminUser` → `AdminUser`) that no
application code had ever written to before this PR. Proves the real
`AdminRolesGuard('superadmin')` genuinely rejects a **moderator**, not
just an editor (the only negative case most other role-gated e2e tests in
this codebase prove) — vetting decisions being superadmin-only, not
moderator-eligible like every other role-gated route in this module, is
the one place this PR's role-gating diverges from
`AdminModerationController`'s own `('moderator', 'superadmin')` pattern.
Its final test threads the two modules together end to end: a real
`concernsMinor` report, blocked for an unvetted moderator both in the
list and on direct action, becomes visible/actionable by that **same**
moderator (same access token, no re-login) the moment a superadmin calls
`PATCH /admin/users/:id/child-safety-vetting` — proving the gate reads
fresh from Postgres on the very next request, not cached in the token.

**Verification, all re-measured directly (computed from the exact diff
of test cases added, cross-checked against two full, real runs of the
complete suite before opening this PR — not estimated)**: mocked suite
**102 suites / 1367 tests, 0 failures → 104 suites / 1403 tests, 0
failures** (2 new suites — both in `admin-staff-vetting/` — 36 new tests:
18 in `moderation.service.spec.ts`, 6 in
`admin-moderation.controller.http.spec.ts`, 4 in
`admin-staff-vetting.service.spec.ts`, 8 in
`admin-staff-vetting.controller.http.spec.ts`). Full e2e suite (real
Postgres/Redis via docker-compose, `npm run test:e2e`) **26 suites / 250
tests, 0 failures → 27 suites / 263 tests, 0 failures** (1 new suite —
`test/admin-staff-vetting.e2e-spec.ts`, 6 new tests — plus 7 new tests
added to the existing `test/moderation.e2e-spec.ts`; every pre-existing
e2e suite re-run and still green alongside both, not just the new/changed
files in isolation). **Zero `schema.prisma` diff, zero new migration** —
every field this PR reads/writes on `Report`/`AdminUser` already existed
from `schema/report-severity-escalation-admin-vetting`. `npx tsc --noEmit`,
`npm run lint`, and `nest build` are all clean.

---

## Files

```
moderation.module.ts                — wires both foundation modules + both controllers
moderation.service.ts                — ModerationService, all business logic
moderation.constants.ts              — REPORT_TARGET_TYPES, REPORT_ACTIONS, APPEAL_DECISIONS, REPORT_SEVERITIES,
                                        DEFAULT_REPORT_SEVERITY, CHILD_SAFETY_VETTING_REQUIRED_CODE, page sizes
cursor.util.ts                       — this module's own (createdAt, id) keyset cursor
reports.controller.ts                — user-facing: POST /reports, POST /reports/:id/appeal
public-reports.controller.ts         — public: POST /reports/public
admin-moderation.controller.ts       — admin-facing: GET/PATCH /admin/moderation/reports*, PATCH .../escalate
dto/create-report.dto.ts
dto/create-public-report.dto.ts
dto/appeal-report.dto.ts
dto/action-report.dto.ts
dto/appeal-decision.dto.ts
dto/escalate-report.dto.ts
dto/list-reports-query.dto.ts
../admin/guards/admin-roles.decorator.ts — @AdminRoles(...), new shared admin infra
../admin/guards/admin-roles.guard.ts     — AdminRolesGuard, new shared admin infra
../admin-staff-vetting/                  — PATCH /admin/users/:id/child-safety-vetting (own module, own README)
```
