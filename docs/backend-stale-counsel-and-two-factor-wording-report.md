# Stale counsel and two-factor wording (comments and config only)

Branch `backend/stale-counsel-and-two-factor-wording`, cut from `origin/main` `8255229`. No behaviour change, no env value, key or default change, no schema, no test assertion change, no register or docx edit.

## Handshake
`git fetch origin`: `origin/main` = `8255229`. Open PRs: none (`gh pr list --state open` empty), so none touches these files.
Scratch resources: none needed. The specs run (`env-completeness`, `media-uploads`) use no Postgres and no Redis.

## What I read
`docs/backend-stale-revocation-wording-report.md` (R90, PR #802) and `services/api/src/session-revocation/session-revocation.ts`: `revokeAllSessionsForAdmin` writes a whole-second marker, `AdminJwtAuthGuard` refuses any token with `iat` earlier than it, `iat == marker` is accepted (one-second edge), Redis unreadable means accept, log, Sentry. So the README's two statements are untrue for this path.

## Changes (old -> new)

1. `services/api/src/modules/two-factor/README.md`, "The refresh gate" (was line 54)
   - Old: "*Accepted:* **access tokens already issued stay valid until they expire (15 minutes by default, `ADMIN_JWT_ACCESS_TTL_SECONDS`).** There is deliberately no per-request database check, so an unenrolled admin's last access token runs out within that time, not at once. Proven by an e2e test."
   - New: says (B-305, Decision Log #500) this path **cuts the admin off at once**: `revokeAllSessionsForAdmin` writes a per-admin "sessions revoked at" marker, `AdminJwtAuthGuard` refuses any token issued in an earlier second with the invalid-token 401; the one exception is a token issued in the same whole second; Redis unreadable fails open; the e2e test pins the clock to show the edge and points to R90's report.
2. Same README, "Not built / open" (was line 182)
   - Old: "Refresh is gated; access tokens already issued run out within 15 minutes ... No per-request check, by decision."
   - New: "Refresh is gated, and the gate cuts the admin off at once ... since B-305 (Decision Log #500) ... refused on its next request, apart from the one-second edge. This replaces the earlier ... decision."
3. `.env.example` (~line 148) and `render.yaml` (both API services, ~lines 170 and 530)
   - Old: "...the founder sets it to "true" by hand at the launch gate, only after counsel answers B-206." / "...ONLY after counsel's written answer on B-206 (docs/deployment.md, B-267 item (l))."
   - New: the switch is the off switch for uploads; the launch condition is in the launch-gate runbook (step 8.7) and Decision Log #524; counsel's question list is not a condition. Runbook wording is pointed to, not quoted. No key or value touched; the YAML still parses (6 services).
4. Found by the repo search, also fixed (same stale claim, in code or the module README):
   - `services/api/src/media-uploads/media-uploads.switch.ts` header comment: same sentence, reworded the same way.
   - `services/api/src/media-uploads/media-uploads-switch.service.ts`: the start-up **warning log text** said "the founder sets it only after counsel has answered B-206". **This is a runtime string, not a comment.** No test pins it (grep of `src` and `test`). Changed to "the founder sets it at the launch gate (launch-gate runbook step 8.7, Decision Log #524)". Revert this one line if you want the brief taken literally (comments and config only).
   - `services/api/src/modules/post-media/README.md` (line 376): same sentence. A module README under `services/`, so treated like the two-factor README.

## Stale places found and NOT changed
- Not about uploads waiting (evidence handling stays with counsel under B-206): `report-retention.service.ts` lines 43 and 293, `moderation/README.md` line 963 ("escalated report kept until counsel answers B-206"), `account-deletion/anonymized-row-purge.service.ts` line 22, `suspected-illegal-media.service.ts` line 30. These are correct as written.
- Docs that still say uploads wait on counsel (not mine, not edited):
  - `docs/incident-response-and-breach-notification-plan-draft.md` line 39 ("The founder turns uploads on only after counsel answers B-206").
  - `docs/sprint-1-dpia-outline-draft.md` lines 50 and 1689 (same).
  - `docs/build-register.md`: B-306 / B-267 (l) / B-193 and similar lines, older than Decision Log #524; checked only by grep, not read in full.
  - `docs/backend-b306-media-uploads-switch-report.md` line 40 (historical report).
  - `CLAUDE.md`: the `backend/b306-media-uploads-switch` bullet and older bullets (history; the #524 bullet already supersedes them).
- `docs/deployment.md` and `docs/launch-gate-runbook.md` already say counsel is not a condition (checked, not edited, not mine).
- `docs/dpia-addendum-post-media-draft.md`, `docs/legal-copy-part-c-post-media-draft.md`: no match for the search terms; not read in full.
- `services/api/src/modules/admin/README.md` and Decision Log #447 (a) / the B-086 follow-ups bullet in CLAUDE.md still carry the old "access tokens accepted" sentence as history (R90 noted it).

## Verification
- `npx jest src/env-completeness.spec.ts src/media-uploads`: 3 suites / 59 tests passed, 0 failed.
- `render.yaml` parsed with js-yaml: 6 services.
- eslint on the two changed `.ts` files: clean.
- Not run: the whole suite, e2e, Playwright, CI.
