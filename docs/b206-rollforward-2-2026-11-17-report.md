# R96: docs roll-forward 2 (2026-11-17)

Docs only. Branch `docs/b206-rollforward-2-2026-11-17`, cut from `origin/main` `ccd67e0` (after PRs #805, #806, #807). No application code, schema, Figma, legal copy, DPIA, incident plan or `docs/pending-copy-manifest.md` changed. Nothing was run (no tests, `tsc`, `eslint`, build or Playwright). The Security session could not be asked (this session is non-interactive); the founder's statements are taken from the brief.

## 1. Numbers used

Decision Log #529 to #532 (the last row before was #528; 526 data rows before, 530 after; #293 and #294 still absent). Register: no B-ID added (323 B-IDs, 146 gap frames, W11 30). Section 102 added; Section 7 heading renamed `#367-#528` to `#367-#532`.

## 2. What changed

**Decision Log (Build Plan docx, append only)**
- #529: no registration with NCMEC's CyberTipline or the UK body before uploads go on; launch condition is TWO parts; the founder's own risk decision, not counsel's view. Amends #524, #525.
- #530: profile pictures and covers can be set aside (BUILT, PRs #806 and #807); the immediate cut-off of an admin refused at the two-factor enrolment gate is intended (#500), which amends the pointer in #447 (a).
- #531: the founder clears the 56 admin two-factor strings himself, without counsel. NOT YET EXECUTED (R97).
- #532: only unresolved legal questions go to counsel; the legal-duties question stays on the list and does not block launch. NOT YET EXECUTED.
- Dated pointers appended (original text untouched) to #447, #500, #524, #525, #526. The #526 pointer carries the reasons for the detection decision; PhotoDNA has NO stated reason and none is recorded.

**Register** (`docs/build-register.md`): dated lines on B-124, B-206, B-208, B-267, B-301, B-306, B-321, B-323; Section 7 rows #529 to #532; line-3 "Updated" sentence; Section 102 (a to f).

**Runbook** (`docs/launch-gate-runbook.md`): line 50, step 6.14 (now also a profile picture and a cover photo), 6.15, 7.5, 8.7, 12.6 (reasons), checklist rows, F2 (UNCONFIRMED whether Render's free plan runs Docker), new step 4.6 (restart the staging API five times; the country database is fetched at every container start; MaxMind's daily limit UNVERIFIED). **`docs/deployment.md`:** the `MEDIA_UPLOADS_ENABLED` paragraph states the two-part condition.

## 3. Stale statements named, not edited

See Section 102d: the incident plan, the DPIA files, legal copy Part C rows 37 and 46 (owner: safeguarding-drafter, later PR); Sections 101a/101b and #524/#525 original wording (history); older QA/backend reports; runbook step 7.1 still says 246 strings until R97 clears the 56.

## 4. Adopted defaults (veto-able)

Step 4.6's five restarts and spacing; the step 6.14 note about the automatic check not listing a cleared picture; treating the enrolment-gate cut-off as "confirmed by the founder (2026-11-17)".

## 5. Verification

- Decision Log: compared cell by cell with `origin/main`; only the Status cells of #447, #500, #524, #525, #526 differ, each by appended text; four rows added; all other tables and paragraphs equal; only `word/document.xml` differs in the zip; `testzip` clean.
- Register: compared positionally with `difflib` (CRLF/LF normalised); the changed lines are line 3, the eight rows (only cell 6, old text a prefix, 14 split parts each), the Section 7 heading, four inserted rows, and the appended Section 102; no bare LF; 323 unique B-IDs.
- `docs/check_version_consistency.py` does not exist in the repo, so it was not run; Temi runs it locally.
- One stray tool call: a bash heredoc containing apostrophes failed to parse and wrote nothing; the scripts were then written with the file tool. No file was affected.
