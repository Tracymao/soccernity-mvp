# R110 report: staging test-user cleanup script

## Built
- `services/api/src/scripts/delete-test-users.ts` (compiled to `dist/scripts/`, npm script `delete-test-users`), `docs/delete-test-users.md`, an e2e spec with a catalog-driven fixture seeder (`services/api/test/delete-test-users.e2e-spec.ts`, `delete-test-users.seed.ts`).
- The foreign-key graph is read from the live catalog (`pg_constraint`), so a table added later is covered or the guard test fails. Rows are tracked by `ctid`; blocked deletes retry inside savepoints; dry run uses a READ ONLY transaction; errors are reduced to table and constraint names.
- Safeguards as specified: emails only, database name only is printed, `--expect-database`, refused under `NODE_ENV=production`, `--execute` plus exact `--confirm`, `--allow-missing`, refusals for admin-linked users, guardian/minor dependencies and content other users interacted with (`--include-others-content` overrides the last), R2 and Redis listed as a to-do only, one stdout audit line with no emails or ids.
- Not run against staging or any remote database. The founder's `.env` was not read. Local Postgres only (scratch database `soccernity_test_r110`).

## Tests run
- `test/delete-test-users.e2e-spec.ts`, 12 tests, 0 failed (local Postgres): refusals, no secret printed, dry run writes nothing, missing emails, emails file, admin-linked, guardian/minor, others' content, Report kept with reporter cleared, full removal with a row in EVERY table that references User and others untouched, rollback on a forced failure, and the guard test.
- `tsc --noEmit` and eslint clean on the script. Not run: the full API suites, `nest build`, CI.

## Every table that references "User" and what the script does
Cascade (relied on, the database removes them): BanterRoomMember, CommunityGroup, CommunityGroupMember, ContestEntry, ContestFinalist, ContestRoundWinner, ContestStanding, EmailChangeRequest, GuardianNoticeWithhold, NotificationPreference, PointsLedgerEntry, PushSubscription, TwoFactorRecoveryRequest, UserBackupCode, _ClubMembership.

Delete first (RESTRICT, dependants removed recursively before the user): AccountHold, Block (blockerId, blockedId), Comment, ContactEnquiry, ContestEngagement, ContestImpression, ContestVote, ConversationHide, DataExportRequest, Follow (followerId, followeeId), GrassrootsTeam, Guardian, LeaderboardEntry, Like, MatchSubscription, Message, MessageHide, Notification, Post, PostMedia, PostMediaReport, PostView, Result, SavedPost.

Set null (kept): Report.reporterId when the report concerns someone else's content (reports about the test user's own content are deleted with it).

Refuse: a user linked to an AdminUser (no foreign key; matched by email); a guardian or minor whose related account is not listed; a user's content that non-listed users interacted with (unless `--include-others-content`).

A row that belongs to a non-listed user is kept, with the link set to NULL where the schema allows, otherwise the run refuses.

## Notes and open points
- On Render staging `NODE_ENV` is `production`, so the script must be run from a local shell with the staging address in the environment; `--expect-database` is the guard. Not tried.
- A small unit spec for argument parsing was not added; those paths are covered by the e2e refusal tests.
- Decision Log docx and register not touched.
