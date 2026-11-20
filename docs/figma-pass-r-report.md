# Figma pass R — final-entry wording, report-on-media reconciliation, pass P chips

Date: 2026-10-28. Branch `figma/pass-r-media-report-reconciliation`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`.
Figma and docs only. No application code, schema, legal copy, DPIA, `docs/build-register.md` or Build Plan docx changed. No unit or e2e suite was run (the brief excludes them).
Source: build-register row **B-261** (as found on fresh `origin/main` `31dd0b3`, register Section 52), Decision Log #430 item 5 and #412 item 5, `docs/figma-pass-p-report.md` section 8, `docs/figma-pass-q-report.md`.
Screenshots: `docs/figma-pass-r-screens/` (`before-<id>.png` and `after-<id>.png`, node id with `:` as `-`). Before shots exist only for frames that already existed; new frames have after shots only.

## 1. Standing check (Decision Log #404 item 14)

| | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 1,008 | 1,019 (11 new) |
| djb2 hash of the 1,008 original ids, in order | 2578804978 | 2578804978 (the first 1,008 children are unchanged and in the same order) |
| Hash of all ids | n/a | 2723711384 |

`findAll` counts per touched frame (whole-page `get_metadata` is not usable on this file):

| Frame | Before | After | Why |
|---|---|---|---|
| `6849:30010` Report form, desktop | 11 | 12 | label "Reason (optional)" added |
| `6849:30169` Report form, mobile | 11 | 12 | same |
| `6850:29769`, `6850:30027`, `6850:29871`, `6850:30141` (final-entry) | 50, 56, 49, 55 | 50, 56, 49, 55 | text edits only |
| Six old impression frames `6646:22745`, `6646:23097`, `6646:23419`, `6646:23765`, `6646:23984`, `6646:24345` | not taken before | 244, 214, 238, 111, 253, 110 | text and layer-name edits only; no node added or removed (the edits cannot change a node count) |
| New frames | n/a | 12, 12, 18, 6, 6 (desktop), 12, 12, 18, 6, 6 (mobile), 10 (notes) | |

Nothing was deleted or archived. New nodes: 10 report-state frames and 1 notes frame, all top-level, 11 in total.

## 2. Item 1 — final-entry wording ("until you submit", Decision Log #430 item 5)

A page-wide text search (archived frames skipped) found four strings that describe when the entry can be changed. All four are edited in place:

| Node | Frame | Before | After |
|---|---|---|---|
| `6850:29819` | Create Post — Desktop — Final Week — Upload — 03 Being checked | You can replace it until the upload window closes. | You can replace it until you submit. |
| `6850:30083` | Create Post — Mobile — Final Week — Upload — 03 Being checked | same | same |
| `6850:29918` | ... Desktop — 05 Rejected | It didn’t meet our community guidelines. Remove it and upload another before the window closes at 23:59:59 on day 24. | It didn’t meet our community guidelines. Remove it and upload another, then submit before the window closes at 23:59:59 on day 24. |
| `6850:30194` | ... Mobile — 05 Rejected | same | same |

**Judgment call.** The rejected copy is about when the file can be changed, so it now says "upload another, then submit". The deadline stays, because it is the rule about when something can be uploaded and submitted. The header banners ("Upload a new video on days 22–24, deadline 23:59:59 on day 24") describe the upload window, not when an entry can be changed, so they are unchanged. The Pass Q notes frame `6853:30611` quotes no changeability sentence and is unchanged.

## 3. Item 2 — report on media, reconciled with the built API

Reference: Decision Log #430 item 4 and register B-258 / B-259 (optional reason up to 500 characters, one report per person per item, a per-account daily limit). The existing form frames already drew a textarea and a "0 / 500" counter, but with a disabled Submit button (layer named "disabled until a reason is entered") and no sign that the reason is optional. That is what is reconciled.

Existing frames edited in place (renamed, named here as the brief requires):

| Node | Old name | New name |
|---|---|---|
| `6849:30010` | Post media — Report — Form — picture — Desktop | Post media — Report — Form — picture — Desktop — 01 Empty (reason optional) |
| `6849:30169` | Post media — Report — Form — picture — Mobile | Post media — Report — Form — picture — Mobile — 01 Empty (reason optional) |

Changes inside both: a visible label "Reason (optional)" above the field; placeholder "Add anything that would help our team look into it."; Submit report at full strength (it was drawn disabled) and its layer renamed "Submit report". The Pass Q confirmation frames `6849:29966` / `6849:30125` ("Reported — thanks, our team will review it.") are checked and unchanged.

New frames, desktop (560 wide) at y 115,800 and mobile (390 wide) at y 116,700, same sheet pattern as the form (scrim, white dialog, Montserrat, existing tokens):

| State | Desktop | Mobile |
|---|---|---|
| 01 Empty (edited, above) | `6849:30010` | `6849:30169` |
| 02 Reason entered (98 / 500) | `6858:30609` | `6858:30685` |
| 03 At 500-character limit (field outlined in navy, counter "500 / 500 · character limit reached") | `6858:30622` | `6858:30698` |
| 04 Send error (alert callout, text kept: "Couldn’t send your report. Check your connection and submit again. What you wrote is still here.") | `6858:30635` | `6858:30711` |
| Already reported ("You’ve already reported this picture", Close) | `6858:30658` | `6858:30734` |
| Daily limit reached ("You’ve reached today’s report limit", Close) | `6858:30671` | `6858:30747` |
| Confirmation (existing) | `6849:29966` | `6849:30125` |

Construction: every new frame is a clone of the edited form frame, so layout, fills, text styles and variable bindings are inherited. The send-error callout is a clone of the Pass Q "Upload status" block (`6847:30107`, `semantic/alert` stroke on the icon only), its "Try again" action removed because the form's own Submit is the retry. No new component, text style or colour was created. Only the picture sheet is drawn; the video sheet is the same sheet titled "Report this video" (as in Pass Q).

## 4. Item 3 — pass P leftovers

`docs/figma-pass-p-report.md` section 8 names three open points. Only the first concerns the older impression frames and it is the only one touched:

> The old impression frames still show the "Live from reveal" pill and the "Week 4 final" chip next to editable settings. Only the layer names were retitled.

Visible strings changed (frames keep their pass P titles; nothing deleted):

| Nodes (frames) | Before | After |
|---|---|---|
| `6646:22953` (`6646:22745`), `6646:23305` (`6646:23097`), `6646:23627` (`6646:23419`), `6646:23973` (`6646:23765`), `6646:24195` (`6646:23984`) | October 2026 · Week 4 final | October 2026 · Before week 4 |
| `6646:22955` (`6646:22745`), `6646:23307` (`6646:23097`), `6646:24197` (`6646:23984`) | Live from reveal | Settings editable |

Pill layers renamed to match: `6646:22952`, `6646:23304`, `6646:23626`, `6646:23972`, `6646:24194` ("Pill — October 2026 · Before week 4"); `6646:22954`, `6646:23306`, `6646:24196` ("Pill — Settings editable"). `6646:24345` (Load Error) carries no chip. The "Reveals 25 Oct 00:00" pill on `6646:23419` and the "No final" pill on `6646:23765` are true on a pre-week-4 frame and were left. `6838:29547` (Settings Locked, the real week-4 state) keeps "Week 4 final" and "Live from reveal".

Not touched, because they are not about the older impression frames: the feed samples that keep six finalists, and the hidden tile-club layers. **Still open:** these frames still show impression numbers (mean 1,224 etc.) although impressions only start at the reveal; that is content, not a chip, and is not decided.

## 5. Audit

- New and edited report frames: 147 solid paints checked, **0 unbound**, **0 `brand/green-tint-28`**, 0 new colours, light mode only.
- Overlaps of the 11 new top-level nodes with all 1,008 originals and with each other: **0**.
- Notes frame `6859:30608` ("Notes — Pass R — ...", x -1,200, y 115,800): three SCOPE OPEN notes (Note component instances cloned from the Pass Q final-entry notes frame).
- Components: none created. Existing local frames were cloned.

## 6. Strings and tags (Decision Log #412 item 5)

**Newly tagged `[COPY PENDING LEGAL REVIEW]`: none.** Every new or changed string was checked against the rule (tag only strings that make a legal or safety promise):

- Report sheet: "Reason (optional)", "Add anything that would help our team look into it.", "Couldn’t send your report", "Check your connection and submit again. What you wrote is still here.", "You’ve already reported this picture", "Our team already has your report. You don’t need to send it again.", "You’ve reached today’s report limit", "Each person can send a limited number of reports in 24 hours. You can report again later.", "500 / 500 · character limit reached", "Close", sample reason text. None promises an outcome, a timeline or who sees the report; the existing "Our team will review it." was already untagged in Pass Q and is unchanged.
- Final-entry: "You can replace it until you submit." and the reworded rejection line. Functional, no promise about who can see the video (the tagged visibility strings of Pass Q are unchanged).
- Chips: "October 2026 · Before week 4", "Settings editable". Admin-facing labels.

`docs/pending-copy-manifest.md` lists code strings only; this pass adds one prose bullet recording that no string was newly tagged, and no table row (a row with no matching string in `apps/web` or `apps/admin` would fail the inventory test).

## 7. Open points (also on the canvas as SCOPE OPEN, notes frame `6859:30608`)

1. The status codes behind "already reported" and "daily limit"; the frames assume the API answers a repeat report and an over-limit report with distinct errors.
2. Whether the limit sheet may show the number. The adopted default is 20 in a rolling 24 hours, set in configuration (#430 item 3, B-258); the copy deliberately says "a limited number".
3. Nothing is drawn for what a person at the limit does about something urgent.
4. The sample reason text is placeholder (it describes a private photo; replace it with neutral sample text if the founder prefers).
5. After a final entry is submitted, what a finalist can do is not drawn (the build found a submitted entry’s file cannot be removed).
6. Impression numbers on the pre-week-4 admin frames (section 4).
7. The report sheet still has one sheet per type only for pictures; no separate video form is drawn.

## 8. Register

`docs/build-register.md` is not edited here (brief). B-261 parts (a), (b), (c) are drawn; the next docs PR can add a status line to B-261 and a forward-pointer where #430 is concerned.
