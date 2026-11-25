# Figma: Today's Fixtures text alignment (PR design/home-fixtures-text-align)

Handshake: origin/main `715d7a5`; no open PR touches `docs/build-register.md` or `CLAUDE.md`; next free register section 137 (last was 136); no Decision Log row needed (text alignment only, no judgement call).

Scope: Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Text and layer names only. No layout, code, legal draft or counsel pack change.

## Edits
1. Heading "Matches happening right now" to "Matches today": FS-1 desktop `5208:6808`, FS-2 mobile `5543:7461`. Eyebrow "TODAY'S FIXTURES" kept. FS-3 and FS-4 untouched.
2. Scheduled card footers "Today" to "Kickoff 17:30", "Kickoff 20:00", "Kickoff 20:00", "Kickoff 19:45": `5208:6829/6847/6865/6883` and `5543:7482/7500/7518/7536`. The text fits in the existing boxes, so nothing was widened. Finished-card footers ("Full time") unchanged.
3. Annotation Zone note `5214:6828`: both paragraphs (`5214:6831`, `5214:6832`) rewritten to describe the current design (live-scores hero card with sample Premier League data; Today's Fixtures shows scheduled matches only with a "Latest results" fallback; sample data is illustrative; the real app reads Sports Hub data). Style kept; note frame still 48 px high, no overlap.
4. FS-1 `5208:6804` renamed "Today's Fixtures — Scheduled (FS-1)".

## Checks (standing check, Decision Log #404 item 14)
- Top-level nodes 2,000 before and after; hash of ids 763113808 unchanged.
- 12 edited text nodes: 0 unbound fills, minimum font size 11, no clipping, note paragraphs do not overlap.
- Contrast against nearest solid ancestor: 11.56 to 12.58 (limit 4.5).
- The 10 prototype reactions in `5204:6728` and `5543:7407` read back with the same destinations (the 4 Sports Hub links `7172:15`, `7172:53`, `7172:67`, `7172:105` and the 6 footer links).
- One screenshot of FS-1 taken (not stored in the repo).

## Reported, not renamed (names still say Grassroots)
`5206:6805` Card — Live Across Soccernity (Sports Hub + Grassroots); `5209:6810` Pillar Card — Grassroots first; `5543:7406` UNRESOLVED — ClubPage membership vs User.clubAffiliationId; `5543:7409` Hero — Grassroots Football, Recorded; `5543:7427` Card — Live Across Soccernity (Sports Hub + Grassroots); `5543:7457` Today's Fixtures — Grassroots (the FS-2 mobile frame itself); `5543:7543` Pillar Card — Grassroots first; `5543:7660` CTA — Browse grassroots teams (secondary). The note frame `5214:6828` name was not re-checked for Grassroots wording.

Not done: the FS-2 layer rename was not asked for; the 8 names above are for a later pass.
