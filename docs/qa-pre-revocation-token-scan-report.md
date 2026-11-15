# Scan for tests that use a pre-revocation access token (B-305)

Branch `qa/pre-revocation-token-scan`, cut from `origin/main` `335b989`. Test-side only: no application code, no change to the
B-305 rule, no change to any assertion about product behaviour. **This is NOT a whole-suite run** (see "Not run").

## Handshake

- `git fetch origin`; `origin/main` is `335b989`.
- Open PRs: one, #794 (Figma note reword, no test files). No open PR touches `services/api/test/`.
- Test environment: my own scratch Postgres database `soccernity_test_prerev` (127.0.0.1:5432) and Redis DB 13, set on the
  command line (they win over `.env.test`). `prisma generate` was run. `node_modules` is junctioned to the shared checkout.
- Command: `npx jest --config test/jest-e2e.config.js --runInBand --testTimeout=900000 --forceExit <file>` (the long timeout is
  needed because `resetDatabase()` is slow on this machine).

## The problem, in one paragraph

`revokeAllSessionsForUser/Admin` write a Redis marker holding the revocation time in whole seconds. The guards refuse a token
whose `iat` is strictly less than the marker; `iat == marker` is accepted (the documented one-second edge, Decision Log #500).
So a test that gets a token, triggers a revocation, then uses that token passes when every step lands in one wall-clock second
and fails with 401 when the clock ticks over. A test that EXPECTS 401 on the old token has the mirror problem.

## Method and what counts as at risk

Writers of the marker (read from source): account suspension, admin-auth (refresh gate, logout all sessions, change password),
admin-staff-roles, admin-users, `auth.service` (change password, deactivate, pending deletion, logout all sessions),
password-reset, email-change confirm, two-factor recovery completion. I grepped all 60 e2e specs for those actions, then read
each hit. **At risk = the same test uses an access token issued before the revocation (or, for 401 expectations, relies on the
old token being refused) after the revocation.** Using a refresh token is not at risk: refresh-token revocation is immediate
and not time-dependent. Unit specs mock the guards or control `Date.now`, so none is exposed.

## Candidate table

| File | Test / area | Verdict |
|---|---|---|
| `moderation.e2e-spec.ts` | "reporting a user directly ... only that user may appeal an action against them" | **AT RISK, fixed.** Suspends the reported user via `user_suspended`, then appeals with their pre-suspension token. |
| `two-factor.e2e-spec.ts` | "access tokens already issued stay valid until they expire ... after the refresh was refused" | **AT RISK, fixed.** The refresh gate revokes all sessions, then the old access token is expected to give 200. |
| `b291-suspension-on-report.e2e-spec.ts` | appeal tests | Safe: already fixed by PR #777 (staff-recorded appeal, no suspended-person token). The remaining tests use fresh admin tokens or refresh tokens. |
| `session-revocation.e2e-spec.ts` | all 11 | Safe: written for B-305, every post-revocation step uses `nextSecond()` or a deliberately pre-marker token. |
| `b292-staff-recorded-appeal.e2e-spec.ts` | record / decide / overturn | Safe: staff tokens are never revoked; the 403s are role / vetting rules, not the marker. |
| `account-deactivation.e2e-spec.ts` | deactivate, reactivate, delete | Safe: after deactivation it checks the REFRESH token (401) and `/auth/login`, both not time-dependent. |
| `account-lifecycle.e2e-spec.ts` | deactivate / delete / change-password round trips | Safe: same pattern, plus fresh logins after each action. |
| `admin-users.e2e-spec.ts` | suspend / delete a user | Safe: asserts the REFRESH token is dead (line 165); other 401s are missing-token or wrong-domain cases. |
| `admin-auth-isolation.e2e-spec.ts` | user vs admin tokens | Safe: no revocation happens before the token use. |
| `cookie-session.e2e-spec.ts` | refresh / logout | Safe: logout revokes the refresh family; no access token reused after. |
| `email-change.e2e-spec.ts` | confirm link ends sessions | Safe: checks the refresh token (line 218), not the access token. |
| `guardian-security-notices`, `guardian-safety-notices`, `guardian-notice-withhold` | change-password / suspend notices | Safe: the revoking call is the last use of the subject's token; later calls use admin or fresh tokens. |
| `transactional-emails.e2e-spec.ts` | change / reset password, deletion | Safe: B-310 returns a fresh pair on change-password, which the test uses; reset has no later use. |
| `two-factor-recovery.e2e-spec.ts` | recovery completion | Safe: completion is the final step of each test. |
| `username-rules-revoke.e2e-spec.ts`, `username-review.e2e-spec.ts` | username revoke | Safe: a username revoke does NOT revoke sessions (the user token is meant to keep working, line 214 onward). |
| `account-deletion-sweep`, `account-hold`, `anonymized-row-purge`, `age-reclassification`, `report-retention` | anonymise / purge | Safe: they assert database state; no access token is used after the sweep. |
| `profile-block`, `push`, `rejected-media-deletion`, `read-receipts`, `profile-visibility`, `data-export` | contain the grep words incidentally | Safe: no revocation precedes a token use. |
| `room-with-purged-creator.e2e-spec.ts` | creator anonymised, old session | **Owned by R81, not touched.** It intentionally relies on the old session being dead (its own report notes this); listed only. |
| banter / other moderation specs R81 changes | | **Owned by R81, not touched.** No open PR changes them today. `moderation.e2e-spec.ts` is edited here because no open PR touches it; if R81 changes it later, my hunk (below) can be dropped or rebased. |

The remaining e2e files (contest, feed, media, leaderboard, search and so on) matched only on incidental words and never
revoke a session.

## What was fixed and how

1. **`moderation.e2e-spec.ts`**: after the suspension, the test now waits past the whole second and mints a fresh token with
   `app.get(TokenService).issueTokenPair(...)`, then appeals with it. Same request, same `201` expectation (the pattern of
   `session-revocation.e2e-spec.ts`'s `nextSecond()`).
2. **`two-factor.e2e-spec.ts`**: there is no fresh token that could serve here, because the test's whole point is that the OLD
   token still works after the refresh gate revoked everything, so waiting and re-issuing would change what is tested. Instead
   `Date.now` is pinned (`jest.spyOn(Date, 'now')`) to mid-second for the issue, refusal and use. Both the JWT `iat` and the
   marker read `Date.now`, so `iat == marker` deterministically. Restored in `finally`. Assertions unchanged.

No shared helper: only two tests needed a fix and they need different fixes.

## Results

All runs: scratch database `soccernity_test_prerev`, Redis DB 13.

| Check | Result |
|---|---|
| Fixed two-factor test alone | pass |
| `moderation.e2e-spec.ts`, full file, run 1 / 2 / 3 | 15 passed of 15, 15 of 15, 15 of 15 |
| `two-factor.e2e-spec.ts`, full file, run 1 / 2 / 3 | 35 passed of 35, 35 of 35, 35 of 35 |

**Proof that the fixes address the failure:** I made temporary copies of the original and fixed tests with a 1.1 s delay
injected right after the revocation step (deleted afterwards, not in the diff):

| Version, with a 1.1 s delay | Result |
|---|---|
| original moderation test | FAILS: `expected 201 "Created", got 401 "Unauthorized"` |
| fixed moderation test | passes |
| original two-factor test | FAILS: `expected 200 "OK", got 401 "Unauthorized"` |
| fixed two-factor test | passes |

## Observation, not fixed

The two-factor test is named "access tokens already issued stay valid until they expire (no per-request check)". Since B-305
(Decision Log #500) that is no longer true in general: a revoked session's access token is refused from the next second. The
test still passes only because the clock is pinned, and what it now actually pins is the one-second edge. The name and the
comment (`admin-auth.service.ts` also says "access tokens ... stay valid") are stale. I left the name and assertion alone
(brief: no change to a test's intent or expectation); the product owner may want it renamed to say it is the same-second edge.

## Not run

This is **not a whole-suite run**. Not run: the full API Jest e2e suite, every other e2e file (including the "safe" ones above,
which were judged by reading), the mocked unit suite, Playwright, `apps/web`, `apps/admin`, CI (cannot be read from here). The
"safe" verdicts rest on reading the code, not on repeated runs; only the two edited files were run three times.
