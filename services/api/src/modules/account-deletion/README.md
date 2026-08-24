# account-deletion module

Build target: Sprint 2, `sprint-2/account-deletion-sweep` — implements
Build Plan Section 9, **Decision Log #42** (and closes the "ARCHITECTURE
IMPLICATION, not yet built" paragraph inside that same entry).

## What Decision Log #42 actually decided (read from the docx directly,
not from any summary)

1. A `"pending_deletion"` account (`POST /auth/delete-account`, PR #78)
   gets a **30-day grace period** before anything permanent happens.
2. At the end of that window, the `User` row is **hard-deleted** — a
   real `DELETE`, not an anonymize/scramble.
3. Guardian/consent records are the one deliberate exception: they
   **survive the `User` row's hard-delete**, retained separately for
   **6 months** after the 30-day grace period expires (so ~7 months
   total from the original `delete-account` request), for legal-defense
   purposes (proof that guardian consent was validly obtained). Basis:
   the ICO does not set a fixed statutory retention period for consent
   data under UK GDPR — only that data be kept no longer than necessary
   for its original purpose. 6 months is the founder's own applied
   reading of that principle, not a number sourced from counsel.
4. Nigeria (NDPA) cross-check: fully resolved, no jurisdictional split
   needed. `POST /auth/delete-account` is the single unified withdrawal
   mechanism for both UK and Nigeria (see Decision Log #43, closed as
   "not needed" — no separate guardian-initiated withdrawal endpoint).
5. Left explicitly unbuilt by #42 itself: "no code exists yet for the
   30-day sweep job, the hard-delete, or the decoupled consent-audit
   table that needs to survive independently of `User` and purge itself
   on the 6-month timer." **That is this module.**

`#42`'s own "ARCHITECTURE IMPLICATION" paragraph sketched one field
("populated at consent-confirmation time") that this module does **not**
follow literally — see "One deliberate deviation from #42's own
architecture sketch" below for why, and why the entry's own retention
math only works the way this module implements it.

## Investigation, done before writing any code

**1. Does `User` have a timestamp for when `pending_deletion` started?**
No — confirmed directly by reading `prisma/schema.prisma` before this PR.
`accountStatus` records the current state, not when it started. Without
one, a 30-day sweep has no clock to measure against. Added
`User.pendingDeletionAt DateTime?`, written by `AuthService.deleteAccount`
at the same moment `accountStatus` flips to `"pending_deletion"`
(`auth.service.ts`) — migration `20260823234607_add_account_deletion_sweep`.
A genuine schema addition beyond Section 3's literal field list, flagged
here per CLAUDE.md's "the data model is a fixed spec" rule, same as
`accountStatus` itself was.

**2. `Guardian`'s actual `ON DELETE` behavior — confirmed, not assumed.**
Read directly from the real migration SQL
(`prisma/migrations/20260815233230_init/migration.sql`):

```sql
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_minorUserId_fkey"
  FOREIGN KEY ("minorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

`#42`'s own architecture paragraph guessed hard-deleting `User` "would
cascade-orphan or cascade-delete `Guardian` too" — **neither is what
actually happens.** `RESTRICT` means Postgres rejects the `User` delete
outright with a foreign-key-violation error the moment a `Guardian` row
still references it. There is no silent cascade and no orphaning to
defend against; there is a hard failure to route around correctly.

**3. Every other foreign key referencing `User` — also checked, not
assumed to be fine by extension.** Grepped every `ON DELETE` clause
across every migration file. Result: `Post.authorId`, `Comment.authorId`,
`Follow.followerId`/`followeeId`, `Like.userId`, `SavedPost.userId`,
`Notification.userId`, `Report.reporterId`, `Message.senderId`,
`LeaderboardEntry.userId`, `GrassrootsTeam.createdById`, and
`Result.enteredById` are **all** `ON DELETE RESTRICT` against `User`.
Only the implicit `_ClubMembership` many-to-many join table is
`ON DELETE CASCADE`. This is the real, separate gap Decision Log #42
itself never addressed (its own bullet list asks "what happens to rows
that reference it" and leaves it open) — see "Decision Log #44
candidate" below; this PR does not resolve it, per its own brief's
explicit instruction not to.

## Architecture

### `User.pendingDeletionAt` (new field)

See investigation point 1. Set once, at `deleteAccount()` time; never
cleared (there is no reactivation path from `"pending_deletion"` —
`reactivateAccount()` explicitly refuses one, unchanged by this PR).

### `ConsentAuditRecord` (new, deliberately decoupled model)

```prisma
model ConsentAuditRecord {
  id                 String    @id @default(uuid())
  minorUserId        String    // plain string, NOT a foreign key
  consentStatus      String    // snapshot of Guardian.consentStatus
  consentConfirmedAt DateTime? // snapshot of Guardian.consentTimestamp
  consentMethod      String    @default("guardian-consent-link")
  createdAt          DateTime  @default(now())

  @@index([createdAt])
}
```

`minorUserId` is a plain `String`, not a `@relation` — this is the whole
point of the table. It must survive independently of the `User` row it
describes, and it is only ever written at the exact moment that row is
about to be hard-deleted; a real foreign key would make "survives the
`User` row's hard-delete" structurally impossible (the same `RESTRICT`
problem `Guardian` itself has today would just move one table over).

**Deliberately not full `Guardian` PII** — no `name`, no `email`, no
`relationship`. Decision Log #42 asks for "what's needed to prove
consent occurred" for a future legal-defense claim, not a mirror of the
`Guardian` row. `consentStatus` + `consentConfirmedAt` is that minimum:
enough to show whether (and when) a guardian confirmed consent for this
specific `minorUserId` before the account was deleted. Proven
structurally, not just by omission, in
`account-deletion-sweep.e2e-spec.ts`: the snapshot test asserts the
record's own key set is exactly
`{id, minorUserId, consentStatus, consentConfirmedAt, consentMethod, createdAt}`
and that the real guardian's name/email never appear anywhere in it.

### One deliberate deviation from #42's own architecture sketch

Decision Log #42's own text describes the sketched table as "populated
**at consent-confirmation time**." This module populates it **at
hard-delete time** instead — a deliberate reading, not an oversight, for
two reasons:

1. **The entry's own retention math only works this way.** #42 states the
   consent record is retained "for 6 months after the 30-day grace period
   expires (so ~7 months total from the original delete-account
   request)." If the 6-month clock started at the (possibly years-earlier)
   original consent-confirmation time instead, that arithmetic wouldn't
   hold at all — a guardian could confirm consent long before any deletion
   is ever requested, making "~7 months total from the delete request" a
   meaningless claim.
2. **Populating at consent-confirmation time would create an audit record
   for every minor who is never deleted**, immediately starting a 6-month
   countdown on an account that might be active for years — the opposite
   of what a legal-defense retention record is for.

`ConsentAuditRecord.createdAt` is therefore the hard-delete moment, and
`consentConfirmedAt` (sourced from `Guardian.consentTimestamp`) is what
actually preserves the original confirmation time, separately.

### `AccountDeletionSweepService`

Two independently callable methods (each takes an optional `now: Date`
parameter specifically so tests can prove the boundaries deterministically,
without mocking global time):

- **`sweepPendingDeletions(now?)`** — finds every `accountStatus =
  'pending_deletion'` row with `pendingDeletionAt <= now - 30 days`. For
  each: if `isMinor` and a `Guardian` row exists, snapshots it into
  `ConsentAuditRecord` and deletes the `Guardian` row, then deletes the
  `User` row — all inside one interactive `$transaction`, so a failure at
  any step rolls back the whole thing (a blocked account is never left
  with its `Guardian` row or audit trail already gone while the `User`
  row survives). Returns `{hardDeletedUserIds, blockedUserIds}` — see
  "Decision Log #44 candidate" for what `blockedUserIds` means.
- **`purgeExpiredConsentAuditRecords(now?)`** — deletes every
  `ConsentAuditRecord` with `createdAt <= now - 6 calendar months`.
  Entirely independent of `sweepPendingDeletions` and of any `User`
  row's existence or state — proven directly in
  `account-deletion-sweep.e2e-spec.ts` by a test that seeds an expired
  record with **zero** `User` rows in the database at all.
- **`runDailySweep()`** — the `@Cron(CronExpression.EVERY_DAY_AT_3AM)`
  entry point, calling both of the above and logging a summary.

**Scheduled, not a manually-triggered endpoint** — per this PR's brief.
No controller exists in this module at all. A destructive, irreversible
sweep over every account on the platform has no legitimate reason to be
reachable on demand by any caller, including an admin one. `@nestjs/
schedule` (`^6.1.3`, confirmed compatible with this codebase's NestJS 11
via its own published `peerDependencies`) is a genuinely new dependency
this PR adds — nothing in this codebase used `@Cron`/`ScheduleModule`
before. `ScheduleModule.forRoot()` is registered once, globally, in
`app.module.ts` (any future `@Cron`/`@Interval`/`@Timeout` job would need
it too — it doesn't belong to this module specifically).

## Decision Log #44 candidate — flagged, not resolved here

**What happens to a hard-deleted user's `Post`, `Comment`, `Follow`,
`Like`, `SavedPost`, `Notification`, `Report`, `Message`,
`LeaderboardEntry`, `GrassrootsTeam`, and `Result` rows?** Confirmed (see
"Investigation" above) that every one of these foreign keys is `ON DELETE
RESTRICT` today — meaning, as implemented, **a hard-delete attempt on any
account with real activity fails outright at the database level.** This
was not decided by Decision Log #42's own text (its bullet list poses the
question and leaves it open) and is **not resolved by this PR**, per this
task's own explicit instruction to flag it rather than silently pick an
answer.

### Options

**(a) Cascade-delete all related content alongside the `User` row.**
Simplest to implement (change every relevant FK to `ON DELETE CASCADE`).
Con: the blast radius is much larger than "this one user's own data" — a
`Comment` on someone else's `Post` is that other person's content
context too; deleting a `Post` this way would also cascade away
`Comment`/`Like`/`SavedPost` rows written by *other, unrelated* users,
which is a much bigger and more surprising erasure than the deleting
user themselves would reasonably expect "delete my account" to cause.

**(b) Orphan the content, reassigned to a placeholder "deleted user"
sentinel account.** Common pattern (a permanent, real `User` row like
"[deleted]" that every FK gets reassigned to before the real row is
removed). Con: real, non-trivial migration work — most of the affected
columns (`authorId`, `userId`, etc.) are non-nullable `String`, not
`String?`, so `ON DELETE SET NULL` isn't available without also making
every one of them nullable; a sentinel-reassignment approach needs an
explicit `UPDATE ... SET authorId = <sentinel-id>` step per table before
the real delete, and a decision on whether that sentinel is a schema
constant, a seeded row, or something else.

**(c) Leave the RESTRICT behavior in place; a User with any related
content simply cannot be hard-deleted until a separate decision is made
for that content.** What this PR actually ships, as the most
conservative default it could ship without inventing a cascade or
anonymization policy: `sweepPendingDeletions` catches the real `P2003`
foreign-key-violation error, leaves the account in `pending_deletion`
untouched (no data lost, no partial state), reports it in
`blockedUserIds`, logs a warning pointing at this README section, and
moves on to the next account rather than crashing the whole sweep run.
The account is re-attempted on every future sweep run for free, with no
extra bookkeeping needed, until (a) or (b) — or some other option — is
actually decided and implemented.

**This PR ships (c)** — plainly stated, not implied: an account with any
real activity (a post, a comment, a like, a follow either direction, a
saved post, a notification, a report, a message, a leaderboard entry, or
grassroots-team/result involvement) that reaches its 30-day mark today
will **not** actually be hard-deleted by this sweep. It will sit in
`pending_deletion`, blocked, indefinitely, until a real product/legal
decision is made on (a), (b), or another option, and implemented as a
follow-up. This is a real, current limitation of what ships in this PR —
not a hypothetical edge case; realistically, most genuine users who ever
posted, liked, or followed anyone will hit it. Only an account with
literally zero platform activity (a real, non-trivial case in its own
right — e.g. someone who deletes their account shortly after signing up
without ever using it) is actually hard-deleted by this sweep as shipped.

## Verification

See the PR description for exact, freshly re-run `tsc`/`build`/`lint`/test
counts (mocked suite and e2e suite, both before and after this branch).

- `account-deletion-sweep.service.spec.ts` (mocked `PrismaService`) —
  the 30-day cutoff query shape, the minor-with-confirmed-Guardian
  snapshot-then-delete ordering, the minor-with-pending-Guardian
  `consentConfirmedAt: null` case, the minor-with-no-Guardian-row case,
  the `P2003`-caught-and-blocked path (including that one blocked
  account doesn't stop the rest of the sweep), a non-`P2003` error
  rethrown rather than swallowed, and the 6-month purge cutoff math.
- `test/account-deletion-sweep.e2e-spec.ts` (real Postgres) — the actual
  30-day boundary (a 29-day-old request untouched, a 31-day-old one
  hard-deleted, both side by side in one sweep run), active/deactivated
  accounts left alone regardless of age, the real `Guardian` `RESTRICT`
  constraint genuinely exercised (confirmed/pending consent snapshot
  survives a real `User`+`Guardian` hard-delete, structurally proven to
  carry no more PII than the model's own columns allow), a real `Post`
  genuinely blocking a hard-delete via a real `P2003` from Postgres (not
  a mocked one), a blocked account not preventing an unrelated eligible
  one from being hard-deleted in the same run, and the 6-month purge
  firing with **zero** `User` rows in the database at all — the direct
  proof that it is independent of account-deletion timing, not just
  independent in theory.
