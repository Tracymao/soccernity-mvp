# Sprint 2 — Settings Menu (Mobile) hub — PR 1 of 6

**Agent:** figma-screen-builder
**Date:** 2026-09-06
**Scope:** ONE net-new Figma frame. Executes **founder decision #7** only (from the Settings-family consolidation decision set, Decision Log #230 / `docs/sprint-2-settings-family-consolidation-audit-report.md` §6.6 option (a)).
**Figma design only** — no app code, no backend code, no existing frame touched.
**Branch (not yet created — see §9):** `sprint-2/settings-mobile-menu-hub` off `main`.

---

## 1. What was built

**New frame: `Settings — Menu — Mobile` — node ID `6289:15068`**
Page `0:1` ("Soccernity"), file key `weZWWqggy9j13eX8bhFgs6`.
Position `x 4939, y −8642`. Size **390 × 551** (width fixed at the canonical mobile width per Decision Log #86; height hugs content).

This is the mobile equivalent of the shipped `/settings` route: a standalone top-level hub listing the 5 canonical Settings sections, each row navigating to that section's existing mobile page. It resolves audit §6.6 by giving mobile the same hub-then-section shape the shipped `/settings` → `/settings/privacy` routes already have in code.

It does **not** modify `Settings — Overview — Mobile` or `Settings — Privacy — Mobile`, which still carry the inline 5-row `Category Nav` list. Stripping that list from those two frames is **PR 5**, explicitly out of scope here.

---

## 2. Proposed structure (stated before building), and what was actually built

### Proposed

```
Settings — Menu — Mobile          FRAME 390 × hug, VERTICAL, fill color/background/page
├── Top Bar — Soccernity          clone of 6185:14548 (390×64, surface fill,
│                                 icon/inactive bottom divider, green mark + navy wordmark)
└── Content                       VERTICAL, pad 24/20/40/20, gap 28
    ├── Header                    VERTICAL, gap 6
    │   ├── "Settings"            Montserrat Bold 28, color/text/secondary
    │   └── one-line sub-copy     Montserrat Regular 14, color/text/secondary
    └── Section Menu              VERTICAL, gap 24
        └── 5 × Nav Row           HORIZONTAL SPACE_BETWEEN/CENTER, gap 12
            ├── Text              VERTICAL gap 4 → label (Montserrat SemiBold 16,
            │                     color/text/primary) + description (Regular 12, secondary)
            └── chevron-forward   16×16, vector stroke brand/navy
```

### Built — confirmed identical to the proposal

Verified by a node-by-node read of the finished subtree (40 nodes). No structural deviation.

| Node | ID | Notes |
|---|---|---|
| `Settings — Menu — Mobile` | `6289:15068` | 390 fixed × hug, VERTICAL, `color/background/page` |
| `Top Bar — Soccernity` | `6289:15069` | clone of `6185:14548` |
| `Content` | `6289:15073` | pad 24/20/40/20, gap 28 |
| `Header` | `6289:15074` | gap 6 |
| `Settings` (title) | `6289:15075` | Montserrat Bold 28 |
| `Header Description` | `6289:15076` | Montserrat Regular 14 |
| `Section Menu` | `6289:15077` | gap 24 |
| `Nav Row — Account` | `6290:15068` | built from scratch |
| `Nav Row — Security & Account Settings` | `6290:15074` | clone of the Account row |
| `Nav Row — Privacy` | `6290:15080` | clone |
| `Nav Row — Notification Preferences` | `6290:15086` | clone |
| `Nav Row — Display, Language & Region` | `6290:15092` | clone |

Rows 2–5 were **cloned from row 1** rather than re-authored, so every variable binding, font, sizing mode and layout property is inherited rather than retyped — the same reuse discipline the brief asked for.

---

## 3. Per-row route mapping (all 5 wired and verified)

Each `Nav Row — *` carries a single `ON_CLICK → NAVIGATE` reaction. All reactions were **read back from fresh node handles after writing** to confirm persistence, and every destination was confirmed to be a real, existing top-level `FRAME` (Figma's `NAVIGATE` requires a different top-level frame).

| Row label (exact) | Row node ID | → Destination node ID | Destination name (read live, not assumed) |
|---|---|---|---|
| Account | `6290:15068` | `5607:7813` | `Settings — Overview — Mobile` |
| Security & Account Settings | `6290:15074` | `5695:8279` | `Settings — Security Overview — Mobile` |
| Privacy | `6290:15080` | `6185:14547` | `Settings — Privacy — Mobile` |
| Notification Preferences | `6290:15086` | `5696:8340` | `Settings — Notification Preferences — Mobile` |
| Display, Language & Region | `6290:15092` | `5649:8140` | `Settings — Display, Language & Region — Mobile` |

Wired **to node IDs, not names**, so PR 2's planned rename of `5607:7813` → `Settings — Account — Mobile` will not break the link.

Row labels use founder decisions **#2** ("Security & Account Settings") and **#3** ("Notification Preferences") verbatim. This means the new frame's labels intentionally differ from the stale labels still on the existing inline `Category Nav` ("Security and account access", "Privacy and safety", "Notifications", "Display, languages and region") — aligning those is PR 5's job, not this PR's.

### Row descriptions — each grounded in real screen content, nothing invented

| Row | Description | Grounded in |
|---|---|---|
| Account | "Account information, password, and account status" | The Account section page's actual rows (Account information · Change password · Deactivate · Delete) |
| Security & Account Settings | "Two-factor authentication and account security" | `5695:8279`'s only real content is two-factor authentication |
| Privacy | "Who can see your profile and posts, and how your data is used" | Mirrors the shipped Privacy page's own subtitle wording |
| Notification Preferences | "Choose which notifications you get, and how you get them" | Deliberately phrased to stay accurate **both** today (Push/Email) and after decision #1's 4-row consolidation lands, so PR 4 does not have to rewrite it |
| Display, Language & Region | "Accessibility, display, language, and data usage" | The 4 rows `5649:8140` itself lists |

---

## 4. Design decisions taken, and disclosed

These are judgment calls made inside the brief's constraints. Each is stated rather than silently applied.

**4.1 — No back affordance, matching the file's convention rather than inventing a bar.**
The brief noted a back affordance to the previous screen "is appropriate", qualified by "match the file's convention, don't invent a new bar." Checking live: the two frames that currently carry the hub list — `Settings — Overview — Mobile` and `Settings — Privacy — Mobile` — have **no** back affordance at all, just the 64px `Top Bar — Soccernity` logo bar plus a "Settings" heading. The `Back to Settings` row that *does* exist (e.g. `5695:8285` on Security Overview — Mobile) is a **leaf-frame** pattern whose target is this hub — it would be circular here. And the actual entry point to Settings on mobile is the `Navigation Drawer — Mobile` (`5870:10689`), which is an **overlay component**, not a frame that can be a `NAVIGATE` destination; a drawer is dismissed, not navigated back to.
So this frame matches `6185:14547` exactly: logo top bar + "Settings" heading, no back row. **Flagged for founder review** — if a back affordance is still wanted, the honest options are (a) a `×`/close that dismisses back to the drawer overlay, or (b) leaving it to the device back gesture. Neither was invented here.

**4.2 — No icon column, following the hub list rather than the Privacy leaf rows.**
The label+description+chevron row shape was lifted from the Privacy page's `Download My Data Row` (`6186:14563`), which also carries a 24×24 leading icon. The existing 5-row `Category Nav` hub list (`6185:14554`) — the thing this frame *is* — has no icons, label + chevron only. Following the hub list avoids inventing 5 new section glyphs, which is real new artwork and a bigger call than this PR's scope. Adding a section icon set later is additive.

**4.3 — Label uses `color/text/primary`, description uses `color/text/secondary`.**
The `Download My Data Row` binds *both* its label and description to `color/text/secondary`. For a menu of navigable rows the label needs more weight, and the existing `Category Nav` already binds its row labels to `color/text/primary`. Using primary/secondary follows the hub list for the label and the leaf row for the description.

**4.4 — Chevron cloned from the navy-bound one, not the Category Nav one. This avoids a real pre-existing bug.**
The chevrons inside the existing `Category Nav` (e.g. `6185:14558`) have their vector stroke bound to `color/text/on-navy` — **white**. On the one active navy-filled row that reads correctly; on the other four white rows those chevrons are **effectively invisible**. The chevron on the Privacy page's `Download My Data Row` (`6186:14570`) is correctly bound to `brand/navy`. This frame clones the latter, so all 5 chevrons render.
**Not fixed here** — that bug lives on existing frames (`6185:14547`, `5607:7813`) which this PR is forbidden to touch. Flagged for PR 5, which is already going to rework that inline list.

**4.5 — Icon-box fills dropped rather than inherited unbound.**
The cloned `chevron-forward` frame carries an **unbound opaque-white** fill — an icon-import artifact present throughout the existing frames. Rather than inherit an unbound paint (which would have made a clean audit impossible) or bind a decorative artifact to `color/background/surface`, the 16×16 icon-box fill was set to `[]`. Visually identical on a white page, more correct if the row is ever placed on a tint, and it keeps the unbound count at a true 0 rather than a cosmetically-satisfied one.

**4.6 — Placement appended to the end of the mobile Settings row, not inserted at its head.**
Logically a menu hub belongs first in the row. The mobile Settings row runs `x −4751 → 4829` on a 500px pitch, and inserting at the head would require moving existing frames — forbidden by this PR's scope. The frame is therefore appended at `x 4939` (the next slot on the same 500px pitch, same `y −8642` baseline). Re-ordering the row is a cheap follow-up for whichever later PR is already moving these frames.

---

## 5. Screenshot verification

Two screenshots taken of `6289:15068` (390×551 native, rendered at native resolution). Confirmed visually:

- Top bar renders correctly — green circular mark, navy "Soccernity" wordmark, hairline `color/icon/inactive` bottom divider.
- "Settings" heading and sub-copy render at the intended weights, no clipping, no overflow.
- All **5 rows render with a visible navy chevron** — confirming the §4.4 fix worked and none inherited the invisible white-bound chevron.
- Two-line descriptions (Privacy, Notification Preferences) wrap cleanly; the `counterAxisAlignItems: CENTER` on the row keeps the chevron vertically centred against both one- and two-line rows.
- No text node is clipped, no element overlaps another, nothing is cropped at the frame edge.
- **No Community-style sidebar content** anywhere — confirmed both visually and programmatically (see §6).

---

## 6. Paint audit — node-by-node, measured not estimated

Every node in the `6289:15068` subtree was walked and every visible fill and stroke inspected.

| Metric | Result | Target |
|---|---|---|
| Nodes in subtree | 40 | — |
| Visible paints (fills + strokes) | 22 | — |
| **Bound to a `Soccernity Theme` variable** | **22** | — |
| **Unbound paints** | **0** | 0 ✅ |
| **Off-palette paints** | **0** | 0 ✅ |
| **`brand/green-tint-28` usages** | **0** | 0 ✅ |
| **New colours introduced** | **0** | 0 ✅ |
| **Frame overlaps (vs. all page children)** | **0** | 0 ✅ |
| Admin Shell parked-zone clash (`x 37943–53343, y −16153→−14929`) | **none** | none ✅ |
| Community-sidebar content strings found | **0** | 0 ✅ |

### Token usage breakdown (all Light mode, collection `VariableCollectionId:5096:2`)

| Token | Paints |
|---|---|
| `color/text/secondary` | 7 |
| `brand/navy` | 6 |
| `color/text/primary` | 5 |
| `color/background/page` | 1 |
| `color/background/surface` | 1 |
| `color/icon/inactive` | 1 |
| `brand/green` | 1 |

Only the two brand colours and their derived tokens are used. No `semantic/alert`, no `brand/off-white`, no shadow token — none was needed.

The sidebar check searched the frame's full text inventory for `christine`, `Adeniyi`, `Trending News`, `Suggested`, `Who to follow` — **zero hits**. The frame's complete text content is the 13 strings listed in §3 plus "Soccernity", "Settings", and the header sub-copy.

---

## 7. Pre-flight and hygiene notes

- **Figma desktop app target confirmed before any write.** `figma.root.children` returned exactly the three documented pages — `1860:2500` (cover), `2155:1285` (dump), `0:1` (Soccernity) — and `VariableCollectionId:5096:2` was present with its 14 variables, matching CLAUDE.md's Figma notes. (`figma.root.name` reads `"Document"`, not `"Soccernity-MVP"`; the page IDs and collection ID are the reliable identity check.)
- **Font styles verified via `listAvailableFontsAsync()`, not guessed.** This file mixes `Montserrat|SemiBold` (no space) with `Inter|Semi Bold` (with space) — exactly the footgun the skill warns about. Both confirmed present before use.
- **Light-mode RGB resolved once up front and passed as the literal to `setBoundVariableForPaint`**, per the standing gotcha that the call keeps whatever literal it is given. No `{0,0,0}` placeholders were used anywhere.
- **`figma.createAutoLayout()` used for every authored container**, per the standing gotcha that `createFrame()` + `.layoutMode` alone silently stays 100×100. Sizing modes were set only *after* `appendChild`.
- **No existing frame was modified.** The only reads of existing nodes were `.clone()` sources (`6185:14548` top bar, `6186:14569` chevron) — cloning does not mutate the source.

---

## 8. Flagged, not fixed (all out of this PR's scope)

1. **Invisible chevrons on the existing inline `Category Nav`** (§4.4) — four of five chevrons on `6185:14547` and `5607:7813` are bound to `color/text/on-navy` (white) on white rows. Real, visible defect on existing frames. **PR 5** already touches that list.
2. **Back-affordance question** (§4.1) — deliberately left to founder review rather than invented.
3. **`Section Title — Settings (Mobile)` banner coverage.** The banner `5698:8239` spans `x −4751 → −2085`; the mobile Settings row now runs `x −4751 → 5329`. The banner has covered only the first handful of mobile frames for some time — this is **pre-existing**, not introduced here, and is the same class of gap as Decision Log #195/#206. Whichever later PR reflows this row should widen it.
4. **Row ordering** (§4.6) — the hub sits at the end of the mobile Settings row rather than its head.

---

## 9. No shell in this session

This session had no Bash/shell tool, so the following are **not** done and must be finalised in a follow-up session with shell access — the same pattern PRs #98 / #102 / #110 / #130 / #151 used:

- create branch `sprint-2/settings-mobile-menu-hub` off `main`
- commit this report
- transcribe the Decision Log entry in §10 into the Build Plan's live docx (Section 9), assigning it the next free number, and append a forward-pointer to **#230**'s Status cell (**#230 itself stays Open** — 9 of the 10 founder decisions are still unexecuted)
- open the PR

---

## 10. Draft Decision Log entry (number left for transcription)

> **#___ — Standalone `Settings — Menu — Mobile` hub built; mobile Settings navigation model resolved to option (a).**
> `sprint-2/settings-mobile-menu-hub`, 2026-09-06. Executes **founder decision #7** of the Settings-family consolidation set, resolving the mobile-navigation question raised as `docs/sprint-2-settings-family-consolidation-audit-report.md` §6.6: mobile Settings uses a **standalone hub screen → section sub-pages**, matching the shipped `/settings` → `/settings/privacy` route shape, rather than a single long scroll (option b) or the hub list repeated on every section page (option c).
> New frame **`Settings — Menu — Mobile` (`6289:15068`)**, 390 × 551 (Decision Log #86), Light mode only, on page `0:1`. Structure: cloned `Top Bar — Soccernity` (from the canonical `6185:14548`) + "Settings" heading + 5 tappable rows, each carrying label, a factual one-line description, and a chevron, with `ON_CLICK → NAVIGATE` wired **to node IDs** (so PR 2's planned rename of `5607:7813` cannot break them): Account → `5607:7813`, Security & Account Settings → `5695:8279`, Privacy → `6185:14547`, Notification Preferences → `5696:8340`, Display, Language & Region → `5649:8140`. Row labels apply founder decisions **#2** and **#3** verbatim, so they intentionally differ from the stale labels still on the existing inline `Category Nav` — aligning those is PR 5.
> **Deliberately NOT done:** the inline 5-row hub list on `Settings — Overview — Mobile` and `Settings — Privacy — Mobile` was left untouched (that is **PR 5**); no existing frame was modified in any way.
> **Judgment calls, all disclosed:** no back affordance (the two existing hub-list-bearing frames have none, the leaf `Back to Settings` pattern would be circular here, and the real entry point — `Navigation Drawer — Mobile` `5870:10689` — is an overlay, not a `NAVIGATE` destination; flagged for founder review rather than invented); no icon column (following the icon-less `Category Nav` rather than inventing 5 section glyphs); labels bound to `color/text/primary` and descriptions to `color/text/secondary`; the frame appended to the end of the mobile Settings row rather than inserted at its head, since inserting would require moving existing frames.
> **A real pre-existing bug was found and routed around, not inherited:** the chevrons inside the existing `Category Nav` bind their stroke to `color/text/on-navy` (white), making four of five invisible on white rows. This frame clones the correctly navy-bound chevron from `6186:14569` instead. The bug itself is **flagged for PR 5**, which already reworks that list.
> **Audit, measured node-by-node:** 40 nodes, 22 visible paints, **22 bound / 0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours**, **0 frame overlaps**, no clash with the parked Admin Shell zone, and **zero Community-style sidebar content**. Full detail: `docs/sprint-2-settings-mobile-menu-hub-report.md`.
> This is **PR 1 of 6**; **Decision Log #230 stays Open** — the other 9 founder decisions are still unexecuted.

---

## 11. Draft CLAUDE.md status bullet

> - **`sprint-2/settings-mobile-menu-hub` (figma-screen-builder, 2026-09-06) is
>   PR 1 of 6 in the Settings-family consolidation (Decision Log #230), and
>   executes founder decision #7 only — ONE net-new Figma frame, no app/backend
>   code, no existing frame touched.** Report:
>   `docs/sprint-2-settings-mobile-menu-hub-report.md`. Decision Log **#___**
>   added; forward-pointer on **#230**, which **stays Open** (9 of the 10 founder
>   decisions are still unexecuted).
>   - **New frame `Settings — Menu — Mobile` (`6289:15068`)**, 390 × 551
>     (Decision Log #86), Light mode only. The mobile equivalent of the shipped
>     `/settings` route — this **resolves the audit's §6.6 mobile-navigation
>     question as option (a)**: a standalone hub screen routing to section
>     sub-pages, matching the shipped `/settings` → `/settings/privacy` shape,
>     not a long scroll or a hub list repeated on every section page.
>   - **5 rows, each `ON_CLICK → NAVIGATE` wired to a node ID** (not a name, so
>     PR 2's planned rename of `5607:7813` can't break them), all read back from
>     fresh handles to confirm persistence and all destinations confirmed live as
>     real top-level frames: Account → `5607:7813`, Security & Account Settings →
>     `5695:8279`, Privacy → `6185:14547`, Notification Preferences →
>     `5696:8340`, Display, Language & Region → `5649:8140`. Labels apply founder
>     decisions **#2**/**#3** verbatim, so they intentionally differ from the
>     stale labels still on the existing inline `Category Nav` — PR 5 aligns
>     those. Rows 2–5 are clones of row 1, so every binding/font/sizing mode is
>     inherited rather than re-authored.
>   - **A real pre-existing bug was found and routed around rather than
>     inherited**: the chevrons inside the existing `Category Nav` on
>     `6185:14547` / `5607:7813` bind their stroke to `color/text/on-navy`
>     (**white**), so four of the five are effectively **invisible** on their
>     white rows. This frame clones the correctly `brand/navy`-bound chevron from
>     `6186:14569` instead. The bug is **flagged for PR 5**, not fixed here —
>     those are existing frames this PR is forbidden to touch.
>   - **Judgment calls, all disclosed rather than silently applied:** no back
>     affordance (the two existing hub-list-bearing frames have none; the leaf
>     `Back to Settings` pattern would be circular on the hub itself; and the real
>     mobile entry point, `Navigation Drawer — Mobile` `5870:10689`, is an
>     **overlay**, which cannot be a `NAVIGATE` destination — flagged for founder
>     review instead of invented); no icon column (follows the icon-less
>     `Category Nav` rather than inventing 5 section glyphs); the cloned
>     chevron's inherited **unbound** opaque-white icon-box fill was dropped to
>     `[]` rather than force-bound, so the 0-unbound count is genuine and not
>     cosmetically satisfied; frame appended to the **end** of the mobile Settings
>     row (`x 4939`, same 500px pitch, same `y −8642` baseline) rather than
>     inserted at its head, since inserting would require moving existing frames.
>   - **Audit, measured node-by-node, not estimated:** 40 nodes / 22 visible
>     paints / **22 bound, 0 unbound, 0 off-palette, 0 `brand/green-tint-28`, 0
>     new colours**; **0 frame overlaps**; no clash with the parked Admin Shell
>     zone; **0 Community-style sidebar content** (checked programmatically
>     against the frame's full text inventory, not just visually).
>   - **Flagged, not fixed:** the invisible-chevron bug above; the back-affordance
>     question; `Section Title — Settings (Mobile)` (`5698:8239`) covering only
>     `x −4751 → −2085` while the mobile Settings row now runs to `x 5329`
>     (**pre-existing**, same class as Decision Log #195/#206); and the hub
>     sitting at the end of the row rather than its head.
>   - Figma writes by the agent (no shell that session); branch, commit, docx
>     Decision Log transcription and PR finalised in a follow-up session with
>     shell access — same pattern as PRs #98 / #102 / #110 / #130 / #151.
