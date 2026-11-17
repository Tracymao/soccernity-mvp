# D7 report — DPIA v0.9 → v0.10 and incident plan v0.7 → v0.8

*Draft only. Not approved, not legal advice (CLAUDE.md non-negotiable #2). Branch `legal/dpia-incident-stale-fixes`, cut from `origin/main` `b67d9c0`.*

**What this pass is.** A narrow refresh so counsel does not read statements that the built system or a founder decision contradicts. It re-marks eight dispositions, fixes stale statements and adds pointers. It re-rates nothing, closes no risk, completes nothing. The DPIA Section 6 sign-off block is still empty. Every change is marked `[v0.10 CHANGED …]` / `[v0.8 CHANGED …]` in the files; line numbers below are in the new files.

**Handshake.** No open PR touches either file. Decision Log #533 and #534 exist only on the unmerged docs PR R98 and are cited as "docs PR R98, pending merge". The Security session could not be asked (non-interactive).

## 1. `docs/sprint-1-dpia-outline-draft.md` (v0.10)

| Line | Change | Before → after |
|---|---|---|
| header | version, sprint/PR, draft date | v0.9 → v0.10 |
| 28–48 | new "Changelog — v0.9 → v0.10", with the "stated plainly" paragraph | added |
| 178 | pointer under the v0.6 "still visibly stale" list | list kept; says hold routes are now vetted for message reports (#498) and #488 is built (B-300, PR #742) |
| 221 | pointer under the v0.5 list (c)/(e) | list kept; (c) answered by `Report.concernsMinor` / `AdminUser.childSafetyVetted`, (e) by #488 |
| 554 | §1.5 "hosting not yet decided" | marker: decided (#391, Frankfurt); transfer assessment still A (§5 item 3) |
| 893 | §2.6.3 | pointer: age-5 floor (#407 item 2), guardian≠child email check and card verification for under-13 US are built; v0.3 analysis kept as history; COPPA question still §5 item 24 |
| 1269 | R9 body | marker: vetting mechanism exists; who opens suspected-illegal files is vetted staff only, staff welfare is the founder's HR duty (#533); risk kept |
| 1290 | R11 text | marker: hosting decided (#391), Postmark, R2 (#307), Sentry inert; transfer assessment still open |
| 1921 | R10 row | "Decision Log #9, still open" → marker: hosting decided (#391) |
| 1927 | R16 row | marker: "None chosen" / "stronger method not built" are history |
| 1979 | §5 item 1 | "OPEN" → marker: resolved (disposition C) |
| 2018, 2019, 2025 | §5 items 40, 41, 47 | **B → D** (recorded, not decided; owner founder; source register Section 85c, #534). v0.9 "B" kept, marked superseded |
| 1970, 1972 | summary table | B 13 → **10** (18, 29, 30, 31, 33, 35, 36, 46, 48, 49); D 14 → **17** (adds 40, 41, 47). Item 9 stays D. A and C unchanged |

## 2. `docs/incident-response-and-breach-notification-plan-draft.md` (v0.8)

| Line | Change | Before → after |
|---|---|---|
| 1, 6, 10 | title, header, platform status | v0.7 → v0.8; "no Render, Neon, Upstash, Postmark, Sentry or R2 account exists" → the accounts that exist (runbook), R2 buckets / AWS / Google OAuth / Meta not yet created |
| 27–48 | new "v0.8 changes" with the "stated plainly" paragraph | added |
| 73 | v0.7 list item 5 | "no Decision Log entry for [staff welfare] was found" → #533 (docs PR R98) records it; old wording kept as history |
| 198, 384 | §4.7 / §4.8 "no account exists" | corrected to which accounts exist (nothing was run against them) |
| 935 | **Q5** | sub-point from Q18 added (does the withhold flag also stop a breach notice, who decides); **stays A** |
| 964 | **Q18** | NOT ASSIGNED → **D, folded into Q5** (#534). Number kept |
| 965 | **Q19** | B → **D** (residual: pause retention job during an incident) |
| 971 | **Q20** | B → **D** (residual: points after a precautionary suspension; §10.7 note) |
| 974 | **Q23** | NOT ASSIGNED → **D** |
| 975 | **Q24** | NOT ASSIGNED → **(a) and (b) D, (c) B (#503)** |
| 923–926 | §12 summary table | B: Q10, Q24(c); D: Q9, Q15, Q18, Q19, Q20, Q23, Q24(a)(b); NOT ASSIGNED: none; A gains "Q5 (now with the Q18 sub-point)" |

Each superseded v0.7 marker is kept in the row, labelled "(superseded by v0.8)".

## 3. Statements found and left alone

- DPIA: other §5 items marked B/C/D in v0.9 (including items 9, 18, 29–36, 46, 48, 49) are unchanged. Item 9 stays D.
- DPIA v0.3 §2.6.3 findings 2, 4, 5, 6 (email link, public disclosure) are not changed by built work I could verify.
- Incident plan: the §10 templates, roles (placeholders) and the §4.9 "gaps" list were not re-checked item by item; some may now be built (for example the action-log reader exists, PR #607).
- Both files: bracketed `[ACTION FOR REVIEW]`, `[OPEN]`, `[UNVERIFIED]` and `[PLACEHOLDER]` markers are untouched.
- Legal copy, addenda and Cloudflare drafts, the Build Plan docx, the register, the manifest, the runbook and `docs/deployment.md` were not touched (other sessions own them).

## 4. Not verified

Nothing was run: no tests, build or CI (CI cannot be read from here). Built-state claims are read from `CLAUDE.md` and the Decision Log summaries, not re-tested; no legal proposition was checked against a primary source. #533 and #534 are unmerged. The re-marks of items 40, 41, 47 and Q18, Q19, Q20, Q23, Q24 follow the founder's direction in the task, not a Decision Log entry on `main`.
