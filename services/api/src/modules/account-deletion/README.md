# account-deletion module

Build target: Sprint 2, `sprint-2/account-deletion-sweep` — implements
Build Plan Section 9, **Decision Log #42** (and closes the "ARCHITECTURE
IMPLICATION, not yet built" paragraph inside that same entry). **Extended
by `sprint-2/account-deletion-cascade`**, implementing the founder's
resolution of **Decision Log #44** (option a, cascade) — see that
section below.

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
  any step rolls back the whole thing. As of `sprint-2/account-deletion-cascade`
  (Decision Log #44), that final `User` delete now cascades through the
  eleven tables listed in "Decision Log #44" below, including other
  users' content on this user's own `Post`s — no per-table deletion code
  is needed here, the database does it in one statement. Returns
  `{hardDeletedUserIds, blockedUserIds}` — see "Decision Log #44" below
  for what `blockedUserIds` means (now an unexpected/drift signal, not a
  routine outcome).
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

## Decision Log #44 — RESOLVED (option a, cascade), implemented in `sprint-2/account-deletion-cascade`

**What happens to a hard-deleted user's `Post`, `Comment`, `Follow`,
`Like`, `SavedPost`, `Notification`, `Report`, `Message`,
`LeaderboardEntry`, `GrassrootsTeam`, and `Result` rows?** Confirmed (see
"Investigation" above) that every one of these foreign keys was `ON
DELETE RESTRICT` — meaning, as originally shipped by PR #88, a
hard-delete attempt on any account with real activity failed outright at
the database level. This was not decided by Decision Log #42's own text
(its bullet list poses the question and leaves it open); PR #88
deliberately shipped the conservative option (c) below and flagged the
question rather than silently picking an answer.

**The founder resolved this as Decision Log #44, option (a) — cascade.**
Stated principle: deleting an account removes that user's entire digital
footprint from the platform, not a partial erasure — framed explicitly
as a safety measure, including for minors, protecting everyone's data
and identity. Applies to the eleven tables below; does **not** apply to
`Guardian`, which Decision Log #42 already resolved separately
(snapshotted into `ConsentAuditRecord`, then deleted — that mechanism is
unchanged by this PR, still `RESTRICT`, still explicit
snapshot-then-delete, never a bare cascade).

**The real mechanical consequence, stated plainly per the founder's own
framing so it is never rediscovered as a surprise:** cascading `Post`
also cascades away `Comment`/`Like`/`SavedPost` rows written by OTHER,
unrelated users on that post — e.g. if User A deletes their account,
User B's own comment on User A's post is deleted too, not just User A's
content. This is the accepted, understood consequence of the decision,
not an oversight to work around or soften. Proven directly, not just
asserted, by `account-deletion-sweep.e2e-spec.ts`'s cross-user cascade
test — see "Verification" below.

**A second-order discovery made while implementing this, not itself a
new open question:** flipping only the eleven FKs that reference `User`
directly is not sufficient to make this cascade actually complete.
`Comment.postId`, `SavedPost.postId`, and `Like.postId` were *also*
`ON DELETE RESTRICT` — against `Post`, not `User`. Once `Post.authorId`
became `CASCADE`, a `User` delete that reaches a `Post` with any
`Comment`/`SavedPost`/`Like` row on it (from any user, including the
deleting user's own) would still abort the whole transaction the moment
Postgres tried to cascade-delete that `Post` and hit those three
RESTRICT constraints one level down. This is exactly the cross-user
consequence the founder's own resolution text describes — cascading
`Post` was always meant to reach those three tables — so this PR flips
all three to `CASCADE` as well, as the literal, necessary implementation
of the one decision already made, not a separate policy question.
Confirmed empirically against real Postgres (`account-deletion-sweep.e2e-spec.ts`),
not just reasoned about.

**A known, currently-unreachable incompleteness, flagged rather than
silently left inconsistent:** `Fixture.teamAId`/`teamBId` and
`Result.fixtureId` are not `User`-referencing FKs and are out of this
PR's literal scope. `GrassrootsModule` is not wired into `app.module.ts`
(Sprint 5, commented out, no controller/service exists), so no live
endpoint can create a `GrassrootsTeam`, `Fixture`, or `Result` row
today — this chain is unreachable in practice, even though
`GrassrootsTeam.createdById` and `Result.enteredById` are now `CASCADE`.
Whoever builds Grassroots endpoints should revisit `Fixture`'s and
`Result`'s own FKs under this same cascade principle then, since a user
who created a team with existing fixtures would otherwise hit the exact
same RESTRICT wall this PR fixes for `Post`/`Comment`/`Like`.

### Options considered (kept for the historical record — PR #88's original write-up, unchanged)

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

**PR #88 shipped (c)** — plainly stated at the time, not implied: an
account with any real activity would not actually be hard-deleted by the
sweep as originally built; it would sit in `pending_deletion`, blocked,
indefinitely. **This is now superseded by `sprint-2/account-deletion-cascade`,
which ships (a).** An account with real activity (a post, a comment, a
like, a follow either direction, a saved post, a notification, a report,
a message, or a leaderboard entry) that reaches its 30-day mark is now
genuinely hard-deleted, cascading through all of that content — and,
per the mechanical consequence above, through other users' `Comment`/
`Like`/`SavedPost` rows on that user's own `Post`s too.
`AccountDeletionSweepService.sweepPendingDeletions`'s `blockedUserIds`
should stay empty in normal operation now; see that method's own
updated comment for what a non-empty result means post-cascade (schema
drift, not a routine outcome).

## Verification

See the PR description for exact, freshly re-run `tsc`/`build`/`lint`/test
counts (mocked suite and e2e suite, both before and after each branch).

**`sprint-2/account-deletion-sweep` (PR #88) — original verification,
partly superseded by the cascade change below; kept for the historical
record, not to be read as describing current behavior:**

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
  a mocked one — **this specific scenario no longer blocks, see below**),
  a blocked account not preventing an unrelated eligible one from being
  hard-deleted in the same run, and the 6-month purge firing with
  **zero** `User` rows in the database at all — the direct proof that it
  is independent of account-deletion timing, not just independent in
  theory.

**`sprint-2/account-deletion-cascade` — what changed:**

- `account-deletion-sweep.service.spec.ts` — the old "a `Post` blocks a
  hard-delete via `P2003`" mocked test is replaced with the opposite: a
  user with related content (`isMinor: false`, no special mocking needed
  since cascade is a database-level concern a mock can't exercise
  either way) now hard-deletes successfully with no `P2003` in the
  picture at all. The `P2003`-caught-and-blocked path is kept as a
  defensive-fallback test (still proven reachable and still proven not
  to crash the rest of the sweep, per this PR's own brief), but its
  test name and comments now say plainly that this is an
  unexpected/drift scenario, not a routine one.
- `test/account-deletion-sweep.e2e-spec.ts` — the old "a real `Post`
  genuinely blocking a hard-delete" test is replaced with real-Postgres
  proof that it does NOT block: hard-deleting a user with a `Post`,
  `Comment`, `Like`, and `Follow` succeeds, and all of those rows are
  confirmed gone afterward. **The single most important new test in this
  PR** — the cross-user cascade proof the founder's own resolution text
  calls out explicitly: User A posts, User B comments on and likes that
  post; hard-deleting User A confirms User B's `Comment` and `Like` rows
  are ALSO gone, not just User A's own content — proving the real blast
  radius, not just the same-user case. `Guardian`/`ConsentAuditRecord`
  coverage from PR #88 is kept and re-confirmed unchanged: a minor with
  a `Guardian` row still goes through the explicit snapshot-then-delete
  path (never a bare cascade), and `Guardian.minorUserId` is confirmed
  to still be `RESTRICT` by seeding a `Guardian` row and confirming the
  sweep's transactional ordering (delete `Guardian` before `User`) is
  still what makes the hard-delete succeed, not a cascade doing it for
  free.
