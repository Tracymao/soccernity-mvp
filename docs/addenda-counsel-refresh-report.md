# Addenda counsel refresh (brief D4) — report

**Status: draft-support note. NOT APPROVED, NOT LEGAL ADVICE (CLAUDE.md non-negotiable #2).** Nothing here records a counsel position; counsel has not reviewed any of the five files.

- **Branch:** `legal/addenda-counsel-refresh`, cut from `origin/main` `014afcd4c8d507ba70307542fc69767669f4b491` (short sha `014afcd`), 2026-11-17.
- **Purpose:** counsel gets current documents and ONE list of only what still needs a lawyer (Decision Log #532).
- **What this is:** a narrow refresh. Every question and open item in five drafts now carries one marker, `[v0.N DISPOSITION: A|B|C|D — reason, source]`; marked notes sit beside statements that later builds or decisions overtook; each file has a changelog. It **chooses no option, applies nothing to the product, the legal draft, the DPIA or any code, completes nothing and claims nothing as solved.** No history was deleted (the only removed lines in the five diffs are six old version/date lines, each replaced by a longer line that keeps the original text).
- **Not touched:** the Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`, the runbook, `docs/deployment.md`, code, Figma, the DPIA, the incident plan, `docs/legal-copy-draft-tos-privacy-policy.md`. Sign-off blocks are still empty in every file.

**Disposition key.** A = open for counsel (non-blocking, #532). B = decided by the founder (Decision Log number named; "counsel's view not recorded" where true, because a founder decision is not legal clearance). C = resolved, counsel signed off — **none exist**. D = founder or engineering housekeeping.

## 1. Files and changes

| File | Version | Line endings kept | Diff | Disposition markers | Change notes |
|---|---|---|---|---|---|
| `docs/dpia-addendum-post-media-draft.md` | v0.4 → **v0.5** | CRLF | +101 / −2 | 39 | 49 |
| `docs/legal-copy-part-c-post-media-draft.md` | v0.1 → **v0.2** | CRLF | +50 / −1 | 22 | 16 |
| `docs/dpia-addendum-contest-view-data-draft.md` | v0.1 → **v0.2** | LF | +47 / −1 | 23 | 9 |
| `docs/legal-copy-part-c-view-data-draft.md` | v0.1 → **v0.2** | LF | +33 / −1 | 12 | 8 |
| `docs/cloudflare-processor-and-cross-border-draft.md` | v0.1 → **v0.2** | CRLF | +37 / −1 | 14 | 5 |

(Counts are `grep` matches of the marker strings, which include the explanatory lines inside each changelog.)

**Brief discrepancy.** The brief said the post-media addendum goes v0.3 → v0.4. On `origin/main` it was **already v0.4** (revised 2026-11-11), so it is now v0.5. The older v0.1–v0.4 changelogs are kept.

### 1.1 `docs/dpia-addendum-post-media-draft.md` (v0.5)
- Changelog at line 32. Marked notes (`[v0.5 CHANGED …]`) after §0, §1.1, §1.3, §1.4, §1.5, §5, §6(f), R23–R30, §9, §10 and §11 (new assumption 15). They record: automatic check first then report-and-review (#430 item 1) and the built pipeline; uploads live at launch with `MEDIA_UPLOADS_ENABLED` as the off switch and no counsel gate (#524); the suspected-illegal set-aside path, 365-day default, now including profile pictures and covers (#525, #530); detection after launch, unbuilt (#526); no NCMEC or UK-body registration before launch (#529); private-first storage and two R2 buckets with the cross-bucket copy still unproven (#518–#521); B-283 deletion unless held; B-307 report-retention cascade.
- Dispositions on every question: §7 questions 1–8 (lines 496–522) and §12 questions 1–25 (lines 821–922), plus nested 4a, 5a, 12a, 14a, 23a split into their own lines.
- Removed an invented internal reference ("B-325") during the work; it is not cited anywhere.

### 1.2 `docs/legal-copy-part-c-post-media-draft.md` (v0.2)
- Changelog at line 29. Notes after the row 46 line (stale clauses: moderator tool, "no hash-matching or reporting path", retention and public address), the §2 table, §3.1–§3.7 (model decided by #430 item 1; AWS account not yet created; private-first built but the launch step not done; retention table), §4, §5 and a new assumption 7.
- Dispositions on §7 questions 1–8 and the §4 notice options N-1 to N-5 (**none chosen**), lines 25–267.

### 1.3 `docs/dpia-addendum-contest-view-data-draft.md` (v0.2)
- Changelog at line 33. Notes after R17, R18, §1.1 store D, the §6 table, §7.1; new assumption 13; closing note.
- B-300 (#488/#495, PR #742): removing a Contest entry's post revokes the points earned on it by a flag (`revokedForRemovalAt`), restored on an overturned appeal. B-307 (PR #758): once the report is retained out for a **completed** cycle, the post and the entry's `ContestEngagement`, `ContestImpression`, `ContestVote`, `ContestRoundWinner` rows are deleted. **Re-checked in code:** `AccountDeletionSweepService.anonymizeUser` still deletes only the viewer's `ContestImpression` rows (line 283) and no `PointsLedgerEntry` or `ContestEngagement` rows, so **R18 stands as written**.
- All 16 questions in §9 carry dispositions (lines 407–451): **all A**, with B/D notes on Q3, Q9, Q10, Q12, Q13, Q15.

### 1.4 `docs/legal-copy-part-c-view-data-draft.md` (v0.2)
- Changelog at line 24; notes after the row 45 line (B-300/B-307), §2.3 retention table, option N-4 and the row-numbering line; dispositions on §5 questions 1–6 (all A) and on N-1 to N-4 (none chosen).
- **Stale, flagged and not edited:** the file refers to "Part C of the v0.8 draft" and "the last existing row is 44". The legal draft is now v0.16; its row 45 is the Contact Us form notice and rows 52–54 exist, so the proposed number **must be renumbered** by whoever applies it.

### 1.5 `docs/cloudflare-processor-and-cross-border-draft.md` (v0.2)
- Changelog at line 32. Two marked notes: after §0 item 6 (line 76) and after the §7 options table (line 323). Dispositions on **all 11 questions** (lines 461–490).
- **Q9 → B for the scope, A for what is open.** #449 adopted the free-plan proxy in front of the API and the two static sites with an origin lock (the scope of Option A in §7); #518 defers building it until after launch. That is a founder decision, counsel's view not recorded. Which of Options A, B or C is acceptable, and whether the admin hostname is excluded, stay **A**. Q1–Q8, Q10, Q11 stay A.
- One line added that the Cloudflare image-scanning tool was dropped (#526) and is **not part of this draft**.
- Header still names legal draft v0.11 and DPIA v0.3 (now v0.16 and v0.8); not re-pointed, flagged in the changelog. The Cloudflare, Render and law statements were **not re-fetched** and keep their 2026-11-01 retrieval dates.

## 2. Disposition tally (markers on question/open-item lines, excluding changelog legends)

| File | A | B | D | C |
|---|---|---|---|---|
| Post-media addendum (§7 Q1–8, §12 Q1–25 and nested) | most | 7 questions or parts (model, vendor path, uploads-live, AWS opt-out, vetting, deletion paths, private-first) | 6 (staff welfare, reconciler window, hold-rule difference, logging, housekeeping) | 0 |
| Post-media Part C (§7 Q1–8, N-1..N-5, notes) | questions 3–8 and N-1..N-5 | question 1 model, 2 premise overtaken | housekeeping notes | 0 |
| Contest/view-data addendum (Q1–16) | all 16 | caps and "same rules for minors" cited as B notes only | consent-screen bump, purge job, backup retention | 0 |
| View-data Part C (Q1–6, N-1..N-4) | all | — | row renumbering, housekeeping | 0 |
| Cloudflare (Q1–11) | Q1–Q8, Q10, Q11 (and the open part of Q9) | Q9 scope | Q2, Q7, Q10 notes | 0 |

Exact per-question markers are in each file; line numbers are in §1.

## 3. Statements changed versus listed-and-left

**Changed (a marked note added next to the old text; the old text is kept):** the post-media pipeline description (model, vendor, uploads-live, set-aside, deletion, storage), report-retention and B-300/B-307 consequences for contest data, the timing of the Cloudflare proxy, and the version/date lines.

**Listed and left (not edited, because outside the brief or undecidable here):**
- legal draft line references, "v0.8" references and the row-45 numbering in the view-data Part C file;
- the DPIA addenda still referring to DPIA v0.3 (now v0.8);
- the Cloudflare draft's references to legal draft v0.11, DPIA v0.3 and row 47;
- legal draft Part C row 8 (cited by the post-media addendum's disposition for Q19), not edited;
- the 6/7-year report-retention figures (unverified for UK law; stated by the legal draft as counsel-approved range, which this pass relied on, not re-confirmed).

## 4. Unclear — founder to say

1. Is logging every admin file-open in the action log intended? (Verified **not built**: the action log records decisions and set-asides only.)
2. Is a public (non-user) route to report a media file wanted? (post-media addendum Q19)
3. Is deleting a surviving post's files at anonymisation (#341) the intended rule? (Q16)
4. What happens to a legacy admin-judged Contest cycle whose winner row still blocks a contest-entry report purge (B-307)?
5. Is the 5-minute reconciler window acceptable? (Q22)
6. Is the difference between the hold rules (message retention: legal hold only; removed-post files: legal or bad-faith) intended? (Q23/23a)
7. The R2 cross-bucket copy is **unproven**; the AWS opt-out step is **not done**; the bucket setup is a founder launch step.
8. Whether to renumber and re-point the stale references listed in §3.

## 5. What could not be verified

- CI could not be read; **nothing was run** (docs only); no tests apply.
- The Security session could not be asked (non-interactive).
- Facts about the repo were read on `origin/main` `014afcd`; `docs/check_version_consistency.py` does not exist.
- Cloudflare, Render, AWS and law statements were not re-fetched.
- Nothing was exercised against a live system.

## 6. Verification of this pass

- `file` shows CRLF kept on the four CRLF files; LF kept on the two LF files.
- `git diff --stat`: 5 files, 262 insertions, 6 deletions; removed lines are only the six old version/date lines.
- No sign-off block edited; no tag removed.
