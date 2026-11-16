# Stale "no per-request check" wording after B-305 (Decision Log #500)

Branch `backend/stale-revocation-wording`, cut from `origin/main` `59016bc`. Comment and test-name change only: no behaviour change, no assertion change, no new test, no schema, no register or docx edit.

## 1. Question

After B-305 added a per-request revocation check, two pieces of text may be wrong:

- the comment above `assertEnrolledWhenEnforced` in `services/api/src/modules/admin/admin-auth.service.ts`: "Access tokens already issued stay valid until they expire (15 minutes by default); there is deliberately no per-request database check."
- the test name in `services/api/test/two-factor.e2e-spec.ts` (~line 739): "access tokens already issued stay valid until they expire (no per-request check): an unenrolled admin access token still works after the refresh was refused".

## 2. Handshake

- `git fetch origin`: `origin/main` = `59016bc`.
- Open PRs: #799 (Figma pass R), #800 (B-206 backend), #801 (api-docker-ffmpeg). None touches either file.
- Scratch resources used: Postgres database `soccernity_test_revwording`, Redis DB 9 (127.0.0.1).

## 3. What I read

- `admin-auth.service.ts` `assertEnrolledWhenEnforced`: with enforcement on and no `totpEnabledAt`, it calls `adminTokenService.revokeAllSessionsForAdmin(adminId)` and throws the coded 401.
- `admin-token.service.ts`: `revokeAllSessionsForAdmin` deletes the admin's refresh tokens AND calls `markSessionsRevoked(adminId, wholeSecondsNow(), ttl)`. `verifyActiveAccessToken` (what `AdminJwtAuthGuard` calls on every request) reads the marker and throws the same 401 as an invalid token when `isIssuedBeforeRevocation(iat, marker)`. If Redis cannot be read it accepts, logs and reports to Sentry (fail open).
- `admin-refresh-token.store.ts`: marker key `admin:revoked-at:admin:<adminId>`, whole seconds, TTL = access-token lifetime + 60 s.
- `services/api/src/modules/admin/README.md` (B-305 section) already lists the refresh gate among the covered callers.

## 4. Verdict: the general wording is STALE

The refresh gate revokes through the very method B-305 extended, so a token issued before that revocation is refused on its next request. "Stay valid until they expire" and "no per-request database check" are both untrue now (the check is a per-request Redis read, not a database read, and it exists).

What is still true: a token issued in the SAME whole second as the revocation (`iat == marker`) is accepted. That is the documented one-second edge of #500.

## 5. Results of running the test

1. The one test, unchanged: `test/two-factor.e2e-spec.ts -t "access tokens already issued"` -> **1 passed, 34 skipped**. It passes only because PR #796 pins `Date.now` (mid-second) from before the token is issued until the last request, so `iat` and the marker share a second.
2. Proof the general claim is false (temporary variant, NOT committed, reverted with `git checkout`): same test with the clock pin removed, a 1.1 s wait after issuing the token, and the final status call expecting 401 instead of 200 -> **passed**. A token issued one second before the revocation is refused with 401.
3. After the wording edit, the renamed test (assertion unchanged) -> **1 passed, 34 skipped**.
4. `tsc --noEmit` (services/api): exit 0. eslint on `src/modules/admin/admin-auth.service.ts`: clean. eslint on the spec reports only `no-undef` for jest globals (`describe`, `it`, `expect`), as for every e2e file (`npm run lint` is `eslint src`; `test/` is not linted), no other rule.

Not run: the whole API suite, other e2e files, Playwright, `apps/*`, CI.

## 6. Exact wording change

Comment above `assertEnrolledWhenEnforced`:

- Old: "Access tokens already issued stay valid until they expire (15 minutes by default); there is deliberately no per-request database check."
- New: "Access tokens already issued: since B-305 (Decision Log #500) revokeAllSessionsForAdmin also writes a per-admin "sessions revoked at" marker (whole seconds) and AdminJwtAuthGuard refuses, on every request, any token whose `iat` is an earlier second. So a token issued before this revocation is refused (same 401 as an invalid token). The one exception is the documented one-second edge: a token issued in the SAME whole second as the revocation is still accepted (iat == marker). The guard also fails open (accepts, logs, reports to Sentry) if Redis cannot be read."

Test name:

- Old: `access tokens already issued stay valid until they expire (no per-request check): an unenrolled admin access token still works after the refresh was refused`
- New: `an access token issued in the SAME second as the refused refresh still works (B-305 one-second edge; an earlier-second token is refused)`

Comment inside the test (old "Nothing else about the test changes." replaced): it now says the general "stay valid until they expire" is not true any more, that the test pins only the one-second edge via the pinned clock, and that the assertion is unchanged.

## 7. Finding for the founder

The test and the guard are consistent with #500, but the test no longer demonstrates what its old name claimed. Today an admin whose refresh is refused by the enrolment gate is signed out of ALL requests immediately, except for a token minted in the same second. That is what #500 intends for revocation, so I treat this as intended, not a regression. I did not change behaviour. If you instead wanted the enrolment gate to let in-flight access tokens finish (the old 2026-10-31 decision text said "access tokens already issued ... accepted"), that would now need an explicit exception, because B-305 removed it. Decision Log #447 (a) and the B-086 follow-ups bullet in CLAUDE.md still carry the old sentence as history; I did not edit them.

## 8. Same stale claim found elsewhere, NOT edited (outside the two named places)

A grep of `services/api` for "per-request check" / "stay valid until they expire" found two more copies, both in `services/api/src/modules/two-factor/README.md`:

- line 54: "*Accepted:* access tokens already issued stay valid until they expire (15 minutes by default ...). There is deliberately no per-request database check ... Proven by an e2e test."
- line 182: "Refresh is gated; access tokens already issued run out within 15 minutes ... No per-request check, by decision."

Both describe the pre-B-305 behaviour and are now wrong for the same reason (the "Proven by an e2e test" refers to the test whose name this PR corrects). They need the same reword in a follow-up; I left them because the task named only the service comment and the test name. Nothing else in `services/api` repeats the phrase.
