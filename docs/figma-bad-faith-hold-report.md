# Figma: Bad Faith Hold Active frames (follow-up to B-045 / PR #534)

Figma-only change (file `weZWWqggy9j13eX8bhFgs6`, page `0:1`) plus this report and a CLAUDE.md status bullet. No application code, schema, legal copy, `docs/pending-copy-manifest.md`, `docs/build-register.md` or Build Plan docx was changed.

## Why

PR #534 (B-045) found no frame draws an ACTIVE bad-faith hold. A bad-faith hold differs from a legal hold in that it ends (`BAD_FAITH_HOLD_MONTHS` = 6, `AccountHold.expiresAt`). The code reused the Legal Hold Active row and showed no expiry.

## What was built

Two new frames, each a clone of its Legal Hold Active original, placed directly BELOW the original at the same x (y 64834; the slots beside the originals are taken by other frames, and nothing existing was moved):

| New frame | Id | Position / size | Original |
|---|---|---|---|
| Admin — Report Detail — Bad Faith Hold Active (#398 D1) | `6870:30620` | x 4860, y 64834, 1440 x 1184 | `6672:28898` |
| Admin — Appeal Review — Bad Faith Hold Active (#398 D1) | `6870:30808` | x 6480, y 64834, 1440 x 1234 | `6672:29059` |

Changes on the hold row only (`Hold status (marker + Lift hold control)`):

1. The marker instance of the existing Pill component now reads **"Reporter acted in bad faith"**, with `Tone=Positive`, the same tone and wording the held list (`6647:23351`) uses for this marker. Instance renamed to match.
2. The existing "Active since 14 Oct 2026" text is kept unchanged.
3. One new text, **"Ends 14 Apr 2027"**, cloned from the "Active since" text (same font, same variable-bound fill), placed after it and set to hug its content. 14 Apr 2027 is six months after the example start date.
4. The existing Lift hold button instance is kept; its prototype reaction (NAVIGATE to the Lift Hold Confirm frame `6672:27420`) came through the clone and still points there. The Lift dialog frame was not touched.

No new sentence was written. Everything else in both frames (shell instance, Take action buttons, callouts, cards) is identical to the originals. The Appeal Review frame stays content-height (1234); the Report Detail frame is at the 1184 floor.

## Checks (measured)

- Light mode only; no new colour, no new component. The Pill, Button and Admin Shell are instances.
- Solid paints on visible nodes: Report Detail original 136 / new 137, Appeal Review original 134 / new 135 (the one added paint is the new text, bound). Unbound in every frame: 1, the Admin Shell `Rectangle 223` sidebar wash, a known literal paint (Decision Log #199), inherited.
- Overlaps against the whole page: none for either new frame.
- Standing top-level check: 1,021 top-level nodes before, 1,023 after (the two new frames). The id hash of the 1,021 non-new nodes after the pass is `354356400`; a before-hash was NOT taken before the first write, so unchanged ids is shown by count only. Nothing was deleted or archived.
- Screenshots in `docs/figma-bad-faith-hold-screens/`: Report Detail original and new. The Appeal Review new frame was screenshotted before the Ends text was set to hug (a wider gap before Lift hold); after the fix its row was read back as geometry only (rowW 635, Ends w 111) and not re-shot, so only the original Appeal Review screenshot is saved.

## Follow-ups (not fixed, outside the brief)

- Both new frames still show both case-level action buttons ("Reporter acted in bad faith" and "Legal hold"), as the originals do, even though a hold is already active. Whether the button for the active hold type should be hidden or disabled is a design decision.
- The "Ends" label has no frame for an elapsed-but-not-lifted hold (`expiresAt` in the past); `hold_expired` exists as a server code.
- Inherited defects in the originals, copied faithfully: a pale green box behind the left edge of the first content card (Admin Shell `Frame 5768` at 279,186), and on Appeal Review a mis-layered duplicate text overlapping the "You are reviewing this appeal" callout.
- The hidden `ARCHIVED — Marker — Hold type (Legal hold)` layer inside each clone still carries the "Legal hold" text; it is hidden and untouched.
- Code (`apps/admin`): the bad-faith hold-active row can now be matched to a frame, including the end date (`HoldView.expiresAt` is already returned by the API); that is a separate figma-to-code pass.
- No wording tagged `[COPY PENDING LEGAL REVIEW]` was added; "Ends 14 Apr 2027" is a plain date label.

## Disclosures

- A first read-only script of mine had a stray typo and failed with a ReferenceError before writing anything; it was fixed and re-run. No other stray tool calls.
- The working checkout `D:\Projects\soccernity-mvp` held another session's uncommitted `services/api` changes, so this branch was built in a separate git worktree (`D:\Projects\soccernity-badfaith`) from `origin/main` (57f4621); the shared checkout was not touched.
