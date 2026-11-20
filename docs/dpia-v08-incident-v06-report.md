# DPIA v0.8 and incident plan v0.6: what changed, what was left, what could not be checked

*Draft work for counsel review. Not approved, not legal advice (CLAUDE.md non-negotiable #2). Nothing here closes a risk, decides B-206, or records a counsel position. Written by the `safeguarding-drafter` role, 2026-11-13.*

## 0. Handshake

- `git fetch origin`; `origin/main` = **`d6138c8`** ("Merge pull request #757 from Tracymao/frontend/b308-hold-controls-and-audit-notes").
- All four prerequisites are merged (read from `git log` on that sha): **B-305** PR #755 (`e7a28ef`), **B-306** PR #756 (`fd5c66a`), **B-307** PR #758 (`ba93495`), **B-308** PR #757 (`d6138c8`).
- Files edited: `docs/sprint-1-dpia-outline-draft.md` (v0.7 to **v0.8**), `docs/incident-response-and-breach-notification-plan-draft.md` (v0.5 to **v0.6**), this report, and one status bullet in `CLAUDE.md`. Nothing else: not the legal copy, the addendum, code, Figma, the register, the docx or the manifest.
- Line numbers below are lines in the files **on this branch** (after the edits), CRLF line endings kept.
- Marker counts: DPIA 19 `[CHANGED v0.8 …]` markers; plan 18 `[v0.6 CHANGED …]` markers.

## 1. What I read

Sources: `docs/backend-b305-session-revocation-report.md`, `docs/backend-b306-media-uploads-switch-report.md`, `docs/backend-b307-contest-entry-retention-report.md`, `docs/frontend-b308-hold-controls-audit-notes-report.md`, `docs/backend-contest-removal-report.md`, build-register Section 7 rows #498 to #503 and Section 92, and the code: `services/api/src/session-revocation/session-revocation.ts`, `src/media-uploads/media-uploads.switch.ts`, `modules/moderation/moderation-holds.service.ts`, `contest-entry-retention.util.ts`, `modules/post-media/README.md` (B-283), `content-removal.util.ts`.

## 2. The five required changes

### 2.1 Hold routes (B-302, #498, #499; B-308)

**Stale statements found (by grep on "hold routes", "place or lift", "concernsMinor only"):**

| Draft | Where (v0.7 / v0.5 line) | What it said |
|---|---|---|
| DPIA | ~87 (v0.6 changelog, "still visibly stale" paragraph) | hold routes gated on `concernsMinor` only |
| DPIA | ~1448-1449 (R33(f) update, item (c)) | non-vetted moderator can place or lift a hold on a message report between two children |
| DPIA | ~1603 (R35 update item 3) | "…suspension; the hold routes" listed as ungated |
| DPIA | §5 item 45 | "the hold routes" listed under "what still does not need a vetted admin to act" |
| Plan | ~216 (§3) | the vetting rule "does **not** yet cover … the hold routes" |

**Edits:** DPIA R33(f) item (c) marked `[SUPERSEDED in v0.8 …]` and a new v0.8 update paragraph added before R33(g) (line 1481); R35 update item 3 marked (line 1653); R35 v0.8 update item 7; §5 item 45 changed and new item 49. Plan §3 line 216 gets a `[v0.6 CHANGED …]` clause; §4.10 hold row gets the vetting rule in both the "who" and "also triggers" columns.

**What the text now says, and its source:** the three routes call `ModerationService.assertVettedToActOn`; a `concernsMinor` report, or a message report whose reported sender or any participant is under 18, needs a child-safety-vetted admin; fails closed on a missing message row or a participant with no User row; a vetted admin is never blocked and the thread is not looked up for them; 404 before 403 and nothing written before the 403; a hold whose report was purged (`reportId` NULL, #496) may be lifted by any moderator (#499); since PR #757 the admin screen does not show the hold buttons to a non-vetted admin on such a report (the signal is `contextHidden`) while the server still refuses. **I kept, as still true,** that a hold on a post, comment or user report follows `concernsMinor` only (there is no participant list to test), and that the user-page suspension has no vetting call.

### 2.2 Sessions (B-305, #500)

- **DPIA:** new "Update to R35, v0.8" (R35, line 1663), items 1 to 4, plus a sentence in the R35 row of Section 4 (line 1843) and §5 item 48.
- **Plan:** §4.1 "Limit" bullet rewritten (the old text said an access token stays valid up to 15 minutes; line ~268), §4.2 (line ~274), §4.6 (fail-open tags, line ~315), §4.10 cautions (line ~392).
- **Stated as built behaviour, not a legal-copy promise:** both drafts say so in words.
- **Facts recorded, with source:** marker keys `auth:revoked-at:user:<id>` and `admin:revoked-at:admin:<id>`; whole seconds; TTL = access-token lifetime plus 60 s; the three guards refuse a token issued earlier than the marker with the ordinary 401; callers (suspension, Block, immediate delete, deactivate/delete, password change and reset, email change, two-factor recovery completion, log-out of all sessions, two-factor reset, admin role removal by deactivation).
- **Failure mode:** Redis unreachable on read → the token is accepted, one log line and one Sentry event at most once a minute (tags `session_revocation=user|admin`), never throws. Marker **write** failure propagates (refresh tokens may already be gone). **One-second edge:** a token issued in the same second as, but before, the revocation is not refused. Accepted by the founder (#500).
- **Side effect recorded:** a password change now ends the current device's access token (the builder's report says `ChangePasswordPage` and a Playwright spec still say the opposite; see 5.6).
- **Not verified:** any of it against a live Redis outage; whether Sentry would ever reach anyone (no `SENTRY_DSN` exists, B-267 (c)).

### 2.3 Uploads (B-306, #501)

- **DPIA:** note under R8 (before R9, line 1173), R35 v0.8 update item 5, §5 item 50. **Plan:** §1 photos row (line 164), §4.7 (new bullet and the "no per-feature kill switch" sentence), §8.3 (line 653), v0.6 change 2.
- **Recorded:** `MEDIA_UPLOADS_ENABLED`: in production on only when exactly `true`, elsewhere on unless exactly `false`; Render sets `NODE_ENV=production` on staging too, so both start off; gates `POST /media/uploads`, its confirm step, avatar and cover uploads with a coded 403 `media_uploads_disabled` before any consent check or file read; does not gate reads, deletes, media reports, the staff upload route, or posts without media. The founder turns it on only after counsel answers B-206.
- **B-206 is not decided, and no sentence says what the answer should be** (checked by re-reading the added text). §5 item 50 sends it to "Counsel + founder" as the existing open item, nothing new.

### 2.4 Retention (B-307)

The B-307 report says exactly this, and the drafts now say the same:

- The Contest-entry block in `ReportRetentionService` is **lifted except in two cases**: (1) the entry's cycle is not `completed`; (2) the entry still holds a `ContestRoundWinner` row, which can only be a legacy admin-judged cycle (B-300 removes a removed entry's winner row in the current model).
- The cascade on deleting the post removes only `ContestRoundWinner`, `ContestVote`, `ContestEngagement`, `ContestImpression` and the entry row; the report explains why none of them still counts for a removed entry in a completed cycle after B-300.
- **Unchanged:** the 6/7-year clocks, the hold / escalation / open-appeal / other-open-report skips, the `context_of_other_report` block, the detach step.
- **Pending appeal and overturned appeal** never reach the check (their `reportClosedAt` is null).
- **A question the builder left for Temi, which I did NOT answer:** whether a legacy cycle's winner row should be kept forever, handled by a separate rule, or migrated. Recorded as DPIA §5 item 51 and R36(j) as a founder question, not a counsel one.
- **Edits:** DPIA R36(d) (line 1738, the "blocked" sentence), R36(i) item 3 (line 1789), new R36(j) (line 1797), R34(f) v0.8 update (line 1562; B-300 built; the engagement-points revocation runs for Contest-entry posts only, and ordinary removed posts' points still stay), §5 items 45, 46 and 48-51 (lines 1924-1930). Plan §8.4 table.

### 2.5 Other stale statements

**Edited, because plainly stale:**

| Where | Was | Now |
|---|---|---|
| DPIA R35 row, Section 4 (line 1843) | "web Contact Us page and admin inbox not built" | built (PR #739). v0.7 fixed the prose but missed this cell. |
| DPIA R35 update item 6 and §5 item 46 | suspension email to the address on file "recorded, not decided" | founder-accepted position (#503) |
| DPIA R35(c)(i) (line 1619) | staff-recorded appeal "not built" | marked superseded; B-292 built (PR #731). The v0.6 update item 1 already said so. |
| Plan §4.9 | "no staff-recorded appeal yet (B-292 is decided, not built)" | built (PR #731), with its rules |
| Plan §1 photos row and §8.3 | rejected files "never deleted" | B-283 (PR #608): the private object is deleted on every path that removes its row unless an active admin hold or an unclosed report applies; the stray-object sweep needs a list permission (B-207) |
| Plan §4.7 | "no per-feature kill switch" | except the uploads switch |
| Plan §4.1, §4.2 | access token lasts up to 15 minutes after a revocation | see 2.2 |
| Plan Q20 and Q24(c) | suspension email "recorded, not decided" | founder-accepted (#503); the question text is otherwise unchanged |
| Plan §8.4 table | Contest entry "Blocked" | only the two cases in 2.4 |

**Checked and left alone because still true:**

- Report retention 6 years, 7 if `concernsMinor`, in both drafts (DPIA R36 and §4 row; plan §1 row 158, §8.2 row 636, §8.4 row 668, Q21): matches `report-retention.config.ts` defaults and #490. The "12 months / 6 years" strings in the DPIA at lines 88, 92, 137, 139 and the plan at lines 59 and 81 are **change-log history** of earlier versions, labelled as such.
- Messages 12 months with the legal-hold exemption (#478, #482): DPIA R33(b) (line 1383) and plan §8.4 row 667: matches.
- Contact Us 12 months from the last message, and the escalated-enquiry exception (#440, #460, #444): DPIA R35 update item 2 and R36(i) item 2: matches.
- Hidden context (#486, B-293, B-297): DPIA R33(f); plan §3: matches.
- Guardian notices, the withhold flag and "holds never notify a guardian" (#456, #458, #459): plan §4.10, §7.5 and DPIA R35: matches the code as the earlier passes recorded it. I did not re-read `guardian-security-notice` in this pass.
- Appeals: staff-recorded appeal rules (recorder and original actioner may not decide; pending appeal pauses the retention clock): DPIA R35 update item 1: matches the B-292 bullet in `CLAUDE.md`.

**Left stale on purpose, because it is history or needs a decision (not edited):**

1. DPIA lines **152 and 192** (v0.5 and v0.6 change-log paragraphs) and **363-364, 789, 1166** (§1.2 and R8) describe `Post.mediaUrls` and `Message.mediaUrl` as the upload path. The v0.5 change log already lists this as visibly stale; the upload pipeline now uses `mediaIds` and no route writes `Message.mediaUrl`. I added a v0.8 note under R8 saying the text describes the capability, not production. Rewriting R8 is a content change, not a staleness fix, so it is a question: **[FOR FOUNDER]** should R8 be redrafted around the pipeline.
2. DPIA lines **87-89, 114, 156** (the v0.6 and v0.5 change-log paragraphs saying "this pass did not check whether #488 is built"). History; R34(f) v0.8 update answers it.
3. DPIA R33(f) item (a) and (b) remain as written: post, comment and user reports about a child outside `child_safety_concern` can still be actioned by a non-vetted moderator, and the user-page suspension has no vetting call (checked: `admin-users.service.ts` has no vetting call; found by search, not tested). Existing **[FOR FOUNDER]** question, not touched.
4. DPIA R36(i) item 4 and §5 item 47 (a held report keeps its enquiry; a legal hold has no end date): unchanged, still open.

## 3. Open questions I left (not decided)

| # | Question | Who | Where |
|---|---|---|---|
| 1 | Legacy admin-judged Contest cycle: keep a winner's report forever, a separate rule, or a migration (B-307 builder's question) | Founder | DPIA R36(j), §5 item 51 |
| 2 | B-206: CSAM detection and statutory reporting for uploaded images and video; uploads stay off in production until answered | Counsel | DPIA R35 v0.8 item 5, §5 item 50; plan §4.7, §8.3, Q22 |
| 3 | Should the vetting rule extend to post, comment and user reports about a child, and to the user-page suspension | Founder | DPIA R33(f) (a), (b) |
| 4 | Is it acceptable that a revoked access token works again while Redis is down | Founder (accepted in #500); stated for counsel's awareness | DPIA §5 item 48 |
| 5 | Redraft R8 and the addendum around the upload pipeline | Founder | 2.5 item 1 above |

No ordinary wording or product choice was sent to counsel. Items 2 and 4 repeat existing open items; nothing new is classed a counsel blocker.

## 4. Other documents the builds make stale (NOT edited, per instructions)

- `docs/dpia-addendum-post-media-draft.md`: line **259** ("Still blocked and counted: a removed post that is a Contest entry") and line **826** (item 25, "A post that is a Contest entry is never deleted by the report sweep") are stale after B-307; it also says nothing about the uploads switch (#501) or about B-283's deletion of rejected files. It needs a v0.5. Out of scope for this pass.
- `apps/web/src/pages/settings/ChangePasswordPage.tsx` (line 98) and its test (line 231) still say "You stay logged in on this device"; after B-305 the current device's access token is refused after a password change. The B-305 builder reported it; nothing here touches it.
- `docs/legal-copy-draft-tos-privacy-policy.md` Part C row 52 and the manifest: not read for this pass, not edited.

## 5. What could not be verified

- **CI cannot be read from here**, so I cannot say whether `main` at `d6138c8` is green. The B-305 to B-308 reports state their own test results; I did not rerun anything.
- **No test suite, `tsc`, lint or build was run** (docs-only change); no behaviour was exercised against a live system, a real Redis outage, a real Render environment, Sentry, or an object store.
- Facts about the code are read from the files and reports named above on `d6138c8`; the Redis failure behaviour and the `MEDIA_UPLOADS_ENABLED` rule are read from the B-305 and B-306 reports, and I confirmed the file names and the guard/switch structure by listing them, not by executing them.
- I did not re-read `guardian-security-notice`, `account-hold.rules.ts` or the admin Users screens for this pass; statements about them are carried over from v0.7 / v0.5 unless listed above.
- No legal proposition in either draft was checked against a primary source in this pass.
