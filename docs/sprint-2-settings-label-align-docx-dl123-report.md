# Sprint 2 — Settings sidebar-nav label alignment + dead-rect cleanup + DL #123 docx correction spec

**Intended branch:** `sprint-2/settings-label-align-docx-dl123`
**Date:** 2026-09-01
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)
**Agent:** `figma-design-system` (no Bash / shell this session — same constraint as PRs #98 / #102 / #110 / #111 / #117)
**Stack:** branches off PR #117 (`sprint-2/component-hygiene-toggles-nav`, OPEN) → itself off PR #116 (`sprint-2/mobile-settings-community-message-rebuild`, OPEN). References PR #117's audit findings and PR #116's Message pillar. **Not merged** — same standing instruction every design-stage PR follows.

Scope: three small, in-place hygiene items. No new screens, states, or mobile equivalents (that stays `figma-screen-builder`'s job). No new colour. No `brand/green-tint-28`. No dark-mode.

---

## TASK 1 — Settings sidebar-nav visible label aligned to "Display, Language and Region"

### What was wrong

The sidebar-nav component set is **`2906:7170`** (canvas name `Frame 5904`), a single-property `COMPONENT_SET` — property `Property 1`, 15 variant values. PR #117 corrected the *variant value* typo `Property 1=Disolay and language` → `Property 1=Display and language` but explicitly deferred the visible label, which still read **"Display, Languages And Region"** (plural "Languages") — out of step with the singular convention "Display, Language and Region" already used on page heading `2922:5832`.

### Inspection — characters vs. transform

The label is an **unmanaged TEXT node** (`componentPropertyReferences: {}` — not a TEXT component property, so a direct `characters` edit is correct and propagates to non-overriding instances).

Underlying `characters` (all Display-row states): `"display, languages and region"` — all lowercase.
`textCase`: **`TITLE`** (pre-existing) — this is what renders it as "Display, Languages And Region" on canvas, including the capital "And". Same situation the earlier pass documented for `2922:5832`.

### The edit

`characters` set to **`"Display, Language and Region"`** on the label TEXT node of **all three Display-row states** (see scope note below):

| Variant | Variant node | Label TEXT node | `characters` before | `characters` after | `textCase` |
|---|---|---|---|---|---|
| `Property 1=Display and language` | `2906:7226` | **`2906:7227`** | `display, languages and region` | `Display, Language and Region` | `TITLE` (unchanged) |
| `Property 1=Display hover` | `2906:7231` | **`2906:7232`** | `display, languages and region` | `Display, Language and Region` | `TITLE` (unchanged) |
| `Property 1=clicked display` | `2922:6351` | **`2922:6352`** | `display, languages and region` | `Display, Language and Region` | `TITLE` (unchanged) |

- The **`textCase: TITLE` transform was left in place** — not removed. Consequence: the on-canvas render is now **"Display, Language And Region"** (capital "And"), exactly the same treatment `2922:5832`'s equivalent got ("renders …And… due to a pre-existing `textCase: TITLE`; underlying chars are correct"). Screenshot confirmed.
- The functional change is **plural → singular** ("languages" → "language"). The incidental lowercase→title-case in the literal string ("display" → "Display") is cosmetically invisible under `textCase: TITLE` and was applied only to match the target string the task specified verbatim.
- Font loaded before mutation: **Montserrat Regular** (the node's actual current font, read via `getStyledTextSegments(['fontName'])` — not assumed).

### Scope note (judgment call, flagged)

The task named the `Property 1=Display and language` variant / node `2906:7227` specifically, and said "only this one label — do not touch other nav rows." All three edited nodes are the **same nav row (Display)** in its default / hover / clicked interaction states — leaving "hover" and "clicked" reading "Languages" while the resting state reads "Language" would be a within-row inconsistency bug. The other four rows (Account, Security and account access, Privacy and safety, Notifications) and their hover/clicked states were **not touched**. Trivially revertable if the founder wants only the resting state changed.

### Instance integrity — before / after

| Metric | Before | After |
|---|---|---|
| Instances of set `2906:7170` on page `0:1` (resolved via `getMainComponentAsync`) | **90** | **90** |
| …also counted via `mainComponent.parent.id === '2906:7170'` | 90 | 90 |
| Set children all `COMPONENT` (no detach) | — | **true** |
| Detachments | — | **0** |
| Instances resolving to a Display-named variant carrying a stale `"languages"` text override | — | **0** |

Component-level edit; every instance that does not locally override the label inherited the change.

---

## TASK 2 — 5 dead hidden `Rectangle 352` rectangles deleted

### Reconfirmed

File-wide scan of page `0:1` for `name === 'Rectangle 352'` returned **exactly 5 with `visible: false`** — matching PR #117's flag by count and state:

| Node ID | Parent (`Frame 5914`) | Grandparent (`Frame 5915`) | Row context |
|---|---|---|---|
| `2926:8175` | `2926:8171` | `2926:8168` | Security → "Set up two-factor authentication" |
| `2926:9351` | `2926:9343` | `2926:9342` | Notifications → "Mute notifications" |
| `2926:9844` | `2926:9834` | `2926:9833` | Notifications → "Push notifications" |
| `2927:10080` | `2927:10067` | `2927:10066` | Notifications → email notifications |
| `2926:9605` | `2926:9595` | `2926:9594` | Notifications → filter row |

All 5 identical: `visible:false`, **536 × 31** at local `(0, 85)`, single SOLID fill **bound to `brand/green-tint`** (`VariableID:5096:5`) @ 12% opacity, **no strokes**, **no `reactions`**, **no `componentPropertyReferences`**.

### Dead-confirmed (not deleted blindly)

- **Prototype reactions:** traversed every node on page `0:1` with a non-empty `reactions` array and checked every action `destinationId` — **0 reactions target any of the 5 IDs**. Not a navigate / open-overlay / scroll-to target anywhere in the file.
- **Not an overlay background / hit area / hover helper:** no reactions on the nodes themselves, no sibling or ancestor reaction referencing them.
- **Siblings render fine without them:** each parent `Frame 5914` holds a *visible* `Frame 5920` (label + description text block) — that is the live rendered row content. The hidden rect contributes nothing.
- **Not inside a component/instance:** parent `Frame 5914` and grandparent `Frame 5915` are plain `FRAME`s.

### What they actually are (discrepancy vs. PR #117's characterisation)

PR #117 described these as "toggle-squares … inside `visible:false` template scaffolding (`Frame 5920` / `Frame 5927`)". Actual structure:

- They are **direct children of `Frame 5914`** (which is `visible: true` and holds live content), **siblings** of `Frame 5920` / `Frame 5927` — not children of them, and not inside hidden scaffolding.
- Their geometry (536 × 31, named `Rectangle 352`) is **identical to this file's form-input background rectangles** — e.g. the visible `Rectangle 352` at `2924:6989` behind the "Current Password" field. They are leftover **input-field backgrounds** from row duplication: a row originally built with a text input was repurposed as a description / toggle row, and the input background was hidden rather than removed.

The count (5) and hidden state match PR #117's flag unambiguously; only the "what they are / where they sit" description was imprecise.

### Action

**Deleted all 5** — `2926:8175`, `2926:9351`, `2926:9844`, `2927:10080`, `2926:9605`. Re-queried each ID afterward: all return `null`. Guard on the delete: only removed nodes still matching `name === 'Rectangle 352' && visible === false && reactions.length === 0`.

### Parent frame state (flag, not removed this pass)

- Each parent **`Frame 5914` remains LIVE** — `visible: true`, holds the rendered row (label + description). **Not** a wholesale-removal candidate; left entirely intact.
- Each `Frame 5914` **still carries a separate hidden `Frame 5926`** child (and in a few rows a hidden `Frame 5920` / `Frame 5928` alternate) — additional leftover scaffolding from the same duplication pattern. **Flagged for a future Settings-desktop layout pass**, not touched here (out of scope: this task is the 5 `Rectangle 352` nodes only). Provably not empty-after-deletion, so per the task the frames themselves are not removed this pass.

---

## TASK 3 — Build Plan docx correction (DL #123, founder-approved) — exact spec for the finalising shell session

This session has **no shell / python-docx** and cannot edit `docs/Soccernity_MVP_Build_Plan_v1.7.docx` (binary zip — do **not** attempt with the Edit tool). The finalising session must apply the two edits below.

### Edit 1 — Section 6, Sprint 3 messaging bullet

Locate the Sprint 3 bullet in **Section 6** whose text is (target text — this session cannot open the docx to quote the live wording, but PR #117's report §3 and CLAUDE.md both quote it as):

> **OLD:** `Build direct messaging (conversations, message threads) from the existing Drop Down Components chat frames.`

Replace the run content with:

> **NEW:** `Build direct messaging (conversations, message threads) from the Message pillar (desktop + mobile conversation screens and the Conversation Actions Menu component, node 5706:8270) shipped in PR #116 — the earlier "Drop Down Components chat frames" family is dead (0 live instances) and has been archived (Old — Mobile Drop Down Components). Corrected per DL #123.`

(Straight double-quotes around `"Drop Down Components chat frames"` as written; adjust to the docx's curly-quote convention if it uses them elsewhere in the same paragraph.)

### Edit 2 — Decision Log Table 6, row `#123`, Status column — APPEND (do not replace)

Append this text to the existing run that holds the row's Status content:

> ` RESOLVED (founder-approved) — Section 6 Sprint 3 messaging bullet corrected to cite the Message pillar (PR #116) instead of the dead Drop Down Components family.`

(Leading space intentional — it follows the existing status sentence.) The DL #123 Status cell may hold its text across multiple runs (an empty first run + a run with the real content). Inspect run structure; append to the run that actually carries the content; edit runs in place to preserve formatting; do not duplicate or reorder runs.

### Edit 3 — Decision Log Table 6, new rows `#125` and `#126`

The live docx Decision Log ends at **#124** (PR #117 added #121–#124). Add:

**`#125` — Settings sidebar-nav visible label aligned to singular "Display, Language and Region".**
Status text:
> `RESOLVED — The Frame 5904 sidebar-nav set (2906:7170), Display row, rendered "Display, Languages And Region" (plural); PR #117 fixed only the variant-value typo (Disolay -> Display) and deferred the visible label. The label TEXT nodes for all three Display-row states — 2906:7227 (Property 1=Display and language), 2906:7232 (Display hover), 2922:6352 (clicked display) — had underlying characters "display, languages and region" rendered title-cased by a pre-existing textCase: TITLE. characters set to "Display, Language and Region" (singular); the textCase: TITLE transform left in place, so the on-canvas render is "Display, Language And Region" (capital "And"), matching how page heading 2922:5832 was handled in an earlier pass. Edited at component level: 90 set instances before = 90 after, all resolving to real variants, 0 detachments, 0 stale overrides. Other nav rows untouched. (sprint-2/settings-label-align-docx-dl123)`

**`#126` — 5 dead hidden `Rectangle 352` rectangles deleted from Settings desktop rows.**
Status text:
> `RESOLVED — PR #117 flagged 5 visible:false Rectangle 352 squares and left them for a later pass. Confirmed genuinely dead: visible:false, fill bound to brand/green-tint, no strokes, no componentPropertyReferences, no prototype reactions (file-wide scan: 0 reactions target these IDs), not overlay/scroll targets, not inside any component; sibling Frame 5920 text blocks are the live rendered row content. They are leftover form-input background rectangles from row duplication (this file names input backgrounds Rectangle 352, 536x31 — identical geometry), not toggle-squares, and sit as direct children of a visible Frame 5914 (not inside hidden scaffolding as PR #117 described). Deleted: 2926:8175, 2926:9351, 2926:9844, 2927:10080, 2926:9605. Parent Frame 5914 rows remain live and were not removed; each still carries a separate hidden Frame 5926 scaffolding leftover, flagged for a future Settings-desktop layout pass. (sprint-2/settings-label-align-docx-dl123)`

---

## Deliverables checklist

- [x] Task 1 Figma edit applied (`2906:7227`, `2906:7232`, `2922:6352`), instances verified 90 → 90, 0 detach.
- [x] Task 2 Figma delete applied (`2926:8175`, `2926:9351`, `2926:9844`, `2927:10080`, `2926:9605`).
- [x] Task 3 exact edit spec (above) for the finalising shell session.
- [x] This report.
- [x] CLAUDE.md "Where things stand right now" status bullet.
- [ ] **Finalising shell session:** create branch `sprint-2/settings-label-align-docx-dl123` off `sprint-2/component-hygiene-toggles-nav`; apply Task 3 Edits 1–3 to the docx via python-docx; commit; push; open PR against `main` noting the PR #117 → PR #116 stack; **do not merge**.

## Verification ceiling

Figma changes verified via Plugin API reads (instance counts, `getMainComponentAsync` resolution, reaction traversal) and one `node.screenshot()` of variant `2906:7226`. No real browser/Playwright check available this session — same ceiling as every prior design-stage PR in this project.
