# Addenda stale-fixes report (task D8)

**DRAFT ONLY (CLAUDE.md non-negotiable #2).** Nothing here is approved or legal advice. This pass decided nothing for the founder or counsel; it recorded decisions already made and corrected stale references. Sign-off blocks in all five files are unchanged and empty.

- Base: `origin/main` sha **`b67d9c0`** (2026-11-17). Branch `legal/addenda-stale-fixes`.
- Open PRs touching these five files: **none** (`gh pr list --state open`).
- Decision Log **#533 and #534 are in docs PR R98, pending merge** when this was written; they are cited that way and are not on `main`.
- Current versions on `main`: legal copy **v0.17** (Part C rows 1 to 54, next free row **55**), DPIA **v0.9**, incident plan v0.7.

## 1. Files changed (all five get a new top changelog entry and a version bump)

| File | Was | Now |
|---|---|---|
| `dpia-addendum-post-media-draft.md` | v0.5 | **v0.6** |
| `legal-copy-part-c-post-media-draft.md` | v0.2 | **v0.3** |
| `dpia-addendum-contest-view-data-draft.md` | v0.2 | **v0.3** |
| `legal-copy-part-c-view-data-draft.md` | v0.2 | **v0.3** |
| `cloudflare-processor-and-cross-border-draft.md` | v0.2 | **v0.3** |

Every change is marked `[vX CHANGED ...]`; no history deleted, no question renumbered, all `[COPY PENDING LEGAL REVIEW]` tags kept. Each changelog says in plain words that it is a narrow refresh that chooses no option, completes nothing and claims nothing solved. (Exact line numbers shift with each insertion; use `git diff` for the lines. Old text is always kept beside the marked note.)

## 2. Re-marked questions

| Question | Was | Now | Source |
|---|---|---|---|
| Post-media addendum §7 **Q5** (staff legal protection and welfare) | D | **B** | #533 (counsel's view not recorded). **Q5a stays A.** |
| §12 **Q19** (images of non-user children; legal Part C row 8) | A | **D** | #534 |
| §12 **Q22** (5-minute reconciler window) | D | D (confirmed) | #534 |
| §12 **Q23 / Q23a** (hold-rule difference) | D | D (confirmed) | #534 |
| §12 **Q16** | A | A (unchanged) | brief |
| Cloudflare **Q9** (which of Options A, B, C) | B scope / A choice | **B (#449)**, in all four places (Section 11 entry, the "Result of the check" paragraph, the options-table note, the timing note) | #449, deferral #518 |

The v0.5 / v0.2 markers are kept; the new marker sits directly under each and says it replaces it.

## 3. FOR THE FOUNDER TO CONFIRM (not decided by me)

1. **Q24.** The brief said "Q22, Q23 and Q24 to D, the 5-minute window and the hold-rule difference". In this file the 5-minute window is Q22, the hold-rule difference is Q23/Q23a, and **Q24 is a different, legal question** (whether a record of what a removed child's file was, and why, must survive the report sweep; B-206). The counsel pack numbers the hold-rule text "question 24", which looks like a pack numbering slip. **I kept Q24 as A**: moving it to D would take a legal question off counsel's list on the strength of a number. If D was meant, change that one marker.
2. **Cloudflare Q9.** The brief says B for Q9 everywhere. v0.2 had B for the scope but A for the admin-hostname variant. I applied B to the whole of Q9 as instructed; the admin-hostname part is therefore no longer on the counsel list. Confirm that is intended.
3. Counsel's view is **not recorded** on any B item; no C (counsel-resolved) item exists.

## 4. Stale references fixed (each with a marked note beside the old text)

- Legal draft **v0.8 / v0.11 / v0.16 → v0.17**, in the headers and the verifiable statements of all five files.
- DPIA **v0.3 / v0.8 → v0.9** in the contest addendum's header and in the post-media addendum changelog.
- **Row numbers.** Part C of the legal draft already uses rows 1 to 54, so the proposed **row 46** (post-media Part C) and **row 45** (view-data Part C) are taken; the next free row is **55**. A note says "renumber when applied"; nothing was renumbered here.
- Contest addendum: the claim that the legal draft mentions points and rank but nothing about impressions, view qualification or dwell was **re-checked against v0.17 (no match for "impression" or "dwell") and still holds**; annotated, not changed.

## 5. Statements listed and left (not verified, not rewritten)

- Many body references to "the v0.3 DPIA R8 / R9 / R11 / R16" and "v0.6 R36(e)" in the addenda describe what those DPIAs said when each addendum was written. They were **not re-verified against v0.9** and are kept.
- Cloudflare Section 8's proposed row numbers (including "row 47") were not re-checked row by row against v0.17.
- Post-media addendum: statements about the legal draft v0.8 PP §2, §5 and §7 and the Part C row 37 quotation are kept with their historical framing; row 37 itself was rewritten in legal copy v0.17 (separate file, not touched here).
- Cloudflare, Render, AWS and law statements were not re-fetched.

## 6. The three "oddities" at post-media Part C lines 55 / 97 / 148 (v0.2)

Checked. They are **not faults**: each is the end of a paragraph of original v0.1 wording followed by a marked v0.2 note. Nothing changed there; recorded in the v0.3 changelog.

## 7. NOT verified

- **CI cannot be read from here.** Nothing was run (docs only); no test suite, build or Playwright.
- The Security session could not be asked (non-interactive session).
- No statute, regulator text or vendor page was retrieved.
- Not touched: Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`, runbook, `docs/deployment.md`, code, Figma, the DPIA, the incident plan, the legal copy draft.
