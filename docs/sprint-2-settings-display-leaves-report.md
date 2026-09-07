# Sprint 2 — Display, Language & Region leaves — PR 3 of 6

**Agent:** figma-screen-builder
**Date:** 2026-09-07
**Scope:** Executes **founder decision #10 only** — build the 4 Display-section leaf screens (desktop + mobile) and wire the hub rows to them. Part of the Settings-family consolidation, Decision Log #230.
**Figma design only** — no app code, no backend code.
**Branch (not yet created — see §9):** `sprint-2/settings-display-leaves`, stacked on PR 2's branch by the finaliser.

This is the **last Phase A PR**. Phase A (#7, #8, #10) is now complete; the founder reviews/merges PRs 1–3 before Phase B (the consolidation passes, #1–#6/#9).

---

## 1. What was built

**8 new frames.** The section hub's 4 rows previously navigated nowhere; they now all resolve.

| Leaf | Desktop | Mobile |
|---|---|---|
| Accessibility | `Settings — Accessibility` — **`6304:15181`** | `Settings — Accessibility — Mobile` — **`6303:15173`** |
| Display | `Settings — Display` — **`6304:15329`** | `Settings — Display — Mobile` — **`6303:15221`** |
| Language | `Settings — Language` — **`6304:15471`** | `Settings — Language — Mobile` — **`6303:15262`** |
| Data usage | `Settings — Data Usage` — **`6304:15615`** | `Settings — Data Usage — Mobile` — **`6303:15307`** |

Desktop leaves: 1440 × 2517, in a row at `y 6000` from `x −14989` on the family's 1480px pitch.
Mobile leaves: 390 wide (Decision Log #86), hugging height (380–493), in a row at `y 8800` from `x −14989` on the 500px pitch.

**8 reactions added** to the two existing hub frames — the only existing-frame edits in this PR. Nothing else on those frames was touched: no restructuring, no relabelling, no restyling, no sidebar removal.

---

## 2. Proposed content per leaf, then built

Content was proposed first, then built. One leaf changed during the build for a real, evidence-based reason — see §3.

### Accessibility — built as proposed
Header: "Accessibility" / "Adjust how Soccernity looks and moves to suit you."
| Row | Control |
|---|---|
| Reduce motion — "Limit animations and motion effects across the app." | toggle (Off) |
| Increase contrast — "Boost the contrast between text and backgrounds." | toggle (Off) |
| Text size — "Make text larger or smaller." | value "Default" + chevron |

**No backend.** There is no motion-preference, contrast-preference or text-scale store anywhere in `services/api`, and no client-side preference system in `apps/web`. All three are design-only stubs.

### Display — built, then deliberately reduced (see §3)
Header: "Display" / "Choose how Soccernity content is sized and spaced on your screen."
| Row | Control |
|---|---|
| Display density — "Fit more or less content on each screen." | value "Comfortable" + chevron |

Plus a wayfinding line: *"Text size lives under Accessibility."*

**No backend**, and **no light/dark theme toggle** — deliberately. The app ships light-only across every decision in this project; dark-mode tokens exist in the `Soccernity Theme` collection but nothing ships dark, so a theme switch would contradict an established decision rather than merely lack a backend.

### Language — built as proposed
Header: "Language" / "Choose the language you'd like to use Soccernity in."
Single-select list: **English (UK)** selected · French · Portuguese · Yoruba.
Plus an **on-frame** note: *"Only English is available today. The other options are illustrative — no translations ship yet."*

**No backend.** There is no i18n layer anywhere — no locale column, no translation files, no language endpoint. The three non-English entries are illustrative only, chosen to be plausible for the Nigeria/England launch markets. The disclosure is rendered **on the frame itself**, not just recorded here, so the screen cannot be mistaken for a shipping language set — the same on-screen-disclosure discipline the Contest Rules placeholder and the "Sample" feed captions already use.

### Data usage — built as proposed
Header: "Data usage" / "Control how much data Soccernity uses on your connection."
| Row | Control |
|---|---|
| Data saver — "Reduce data use across the app." | toggle (Off) |
| Autoplay videos — "Play videos automatically in your feed." | toggle (On) |
| Image quality — "Load higher or lower quality images." | value "Standard" + chevron |

**No backend.** No data-saver API, no media-quality setting, and no media-upload/streaming endpoint at all. Note that `PostComposer`'s media affordances are already disabled in code for the same reason.

**Every control on all four leaves is a design-only stub.** When `figma-to-code` converts these, each should render visibly but disabled with a "not wired" note — the pattern `PrivacySettingsPage.tsx` already established.

---

## 3. The Display leaf: a real finding, not a padding exercise

The brief anticipated Display might end up near-identical to Accessibility and said explicitly: *"if it ends up near-identical to Accessibility, say so in the report and propose merging them as a flag — don't pad it."*

I originally built Display with **two** rows: Text size + Display density. While wiring the hub I read each hub row's own text to avoid mis-wiring the generically-named desktop rows (`Frame 5915`/`5917`/`5918`/`5919`), and that surfaced the hub's own pre-existing copy:

| Hub row | Its own description |
|---|---|
| Accessibility | **"Adjust contrast, motion and text size"** |
| Display | **"Choose how content is laid out on your screen"** |
| Language | "Set the language Soccernity is shown in" |
| Data Usage | "Control media autoplay and download quality" |

So the hub itself already assigns **text size to Accessibility**, and scopes Display to **layout**. Keeping Text size on Display too would have been duplicating a control across two sibling leaves purely to stop Display looking thin — exactly the padding the brief prohibited.

**Corrected:** the Text size row was removed from both Display frames, leaving one honest row (Display density) plus a cross-reference line pointing to Accessibility. The cross-reference is wayfinding, not invented feature content.

**Flag — Display does not justify its own leaf.** With text size correctly homed under Accessibility, Display carries a single control. Recommendation: **merge Display into Accessibility** as one leaf (e.g. "Display & Accessibility") and drop the Display row from the hub, taking the section from 4 leaves to 3. This is a founder call, not made here — both frames are built and wired so either outcome is cheap. If the merge is taken, `6304:15329` / `6303:15221` are archived and the hub's Display row is removed.

---

## 4. Shells — how each was built

### Desktop
Not cloned wholesale from a sibling leaf, because every sibling carries the Community sidebar. Built the same way PR 2's landing was: a fresh 1440 × 2517 frame with only the shell pieces cloned in —

| Piece | Cloned from |
|---|---|
| `Web app Navbar` (header 4) | hub `2922:5928` |
| `Frame 5910` nav rail | hub `2922:5929` — already carries `clicked display` active |
| `Line 106` / `Line 107` dividers | sibling leaf `2926:8418` / `2926:8419` (canonical x 674 / 1239) |
| `arrow-back` | sibling leaf `2926:8400`, reaction re-pointed to the hub `2922:5832` |

Result: **5 direct children each** — navbar, rail, 2 dividers, content panel. **No Community sidebar**, confirmed by that child count and by a text sweep for `@christine001` / `Trending News` / `Suggested` / `Followers` / `View profile` / bio / location returning **zero hits on all four**.

Content panel at the canonical `(688, 125)`, 533 wide — matching the sibling *leaf* geometry (leaves sit higher and wider than the landing's `(688, 186)` / 396). Canonical rail/content x-positions and the family's 2517px height are kept, same reasoning as PR 2 §7.1/§7.2.

**Nav rail active = "Display, Language & Region"** on all four, using the set's real `clicked display` variant inherited from the hub (not a hand-restyled active look). The Display row correctly carries no navigation — it is the current section — while the other four rows keep their inherited targets.

### Mobile
Cloned wholesale from `Settings — Two-Factor Auth (SMS) — Mobile` (`5696:8213`), preserving its exact shell: `Top Bar — Soccernity`, `Content` (pad 20/20/40/20, gap 22), the `‹ Settings` back bar, and the `Settings Group` card. Only the header text and the group's rows were replaced. The `‹ Settings` back bar was additionally **wired** to the mobile hub `5649:8140` — the sibling's own back bar carries no reaction, so this is a small improvement on a frame I own, not a change to existing work.

### Components reused as real instances
- **`Settings Toggle`** (`5694:8219`) — 4 real instances across the toggle rows (`State=Off` ×3, `State=On` ×1), not hand-drawn.
- **The navy-bound chevron** (`6186:14569`) — cloned for every "value" row, never the invisible white-bound `Category Nav` chevron.
- **Radio control** — the one genuinely new small control (no radio/checkbox component exists in this file): a 20px ring bound to `color/icon/inactive` with a 10px `brand/green` dot when selected. Palette-only, no new colour.

---

## 5. Route mapping — 8 reactions, all read back

Each hub row was **identified by reading its own text**, not by index or by its generic frame name — the desktop rows are named `Frame 5915` / `5917` / `5918` / `5919`, so wiring by position would have been an unverified guess.

| Hub | Row | Row ID | → Leaf | Leaf name (read back live) |
|---|---|---|---|---|
| Desktop `2922:5832` | Accessibility | `2910:7427` | `6304:15181` | Settings — Accessibility |
| Desktop | Display | `2910:7436` | `6304:15329` | Settings — Display |
| Desktop | Language | `2910:7453` | `6304:15471` | Settings — Language |
| Desktop | Data Usage | `2910:7464` | `6304:15615` | Settings — Data Usage |
| Mobile `5649:8140` | Accessibility | `5649:8153` | `6303:15173` | Settings — Accessibility — Mobile |
| Mobile | Display | `5649:8159` | `6303:15221` | Settings — Display — Mobile |
| Mobile | Language | `5649:8165` | `6303:15262` | Settings — Language — Mobile |
| Mobile | Data Usage | `5649:8171` | `6303:15307` | Settings — Data Usage — Mobile |

Plus, on the new frames themselves: 4 desktop `arrow-back` → `2922:5832`, and 4 mobile `‹ Settings` → `5649:8140`.

---

## 6. Paint audit — node-by-node, authored vs inherited

### Authored nodes — the target metric

| Frame | Nodes | Authored paints | Bound | Unbound | Off-palette | `-28` | Overlaps |
|---|---|---|---|---|---|---|---|
| Settings — Accessibility | 143 | 15 | 15 | **0** | 0 | 0 | 0 |
| Settings — Display | 130 | 12 | 12 | **0** | 0 | 0 | 0 |
| Settings — Language | 139 | 17 | 17 | **0** | 0 | 0 | 0 |
| Settings — Data Usage | 143 | 15 | 15 | **0** | 0 | 0 | 0 |
| Accessibility — Mobile | 37 | 19 | 19 | **0** | 0 | 0 | 0 |
| Display — Mobile | 22 | 14 | 14 | **0** | 0 | 0 | 0 |
| Language — Mobile | 34 | 22 | 22 | **0** | 0 | 0 | 0 |
| Data Usage — Mobile | 37 | 19 | 19 | **0** | 0 | 0 | 0 |
| **Total** | **685** | **133** | **133** | **0** ✅ | **0** ✅ | **0** ✅ | **0** ✅ |

No Admin Shell zone clash on any frame. **Zero Community-sidebar content hits on all 8.**

### Inherited component-instance debt — disclosed, not hidden

348 inherited paints, 344 bound, **4 unbound** — one per desktop frame, all the same node: `Ellipse 33 [IMAGE]`, the **avatar image fill inside the shared Navbar instance**. This is the already-documented shared-component debt CLAUDE.md names repeatedly; it is not editable from an instance and was **not** force-bound. The four mobile frames have **zero** inherited unbound paints (their 4 `Settings Toggle` instances are fully bound).

### Token usage (Light mode, `VariableCollectionId:5096:2`)

`brand/navy` 250 · `color/text/primary` 66 · `color/text/secondary` 48 · `brand/green-tint` 36 · `color/icon/inactive` 33 · `brand/green` 20 · `color/background/surface` 12 · `color/background/page` 8 · `color/text/on-navy` 4.

Only the two brand colours and their derived tokens. No `semantic/alert`, no `brand/off-white`, no shadow token.

---

## 7. Screenshot verification

All 8 frames were screenshot-verified.

**Desktop (all 4):** navbar renders with full logged-in chrome; "Settings" H1 with the rail showing **"Display, Language & Region" highlighted navy** and the other four rows resting; the left gutter is empty (no sidebar); the content panel shows the back arrow, header and rows. Toggles render in their correct states (navy knob for Off, green track for On), value rows show their value + navy chevron, radios show the green dot on English (UK) only. No clipping, no overlap, no text collision.

**Mobile (all 4):** logo top bar, `‹ Settings` back bar, header, and the card-style `Settings Group` with dividers between rows. Language shows 4 radios with English (UK) selected plus the on-frame availability note. The corrected Display leaf shows one row plus the cross-reference line, hugging to 380px with no dead space.

---

## 8. Flagged, not fixed

1. **Display should probably merge into Accessibility** (§3) — the substantive design finding of this PR. Founder call.
2. **The rail's inherited targets point at frames slated for archival.** The cloned rail rows carry the file-wide wiring: Security → `2922:5143` and Notifications → `2922:5602`. The audit's §5 recommends archiving both (they are the redundant intermediate and the losing competing hub). PR 5/6 must re-point these file-wide — it affects ~20 frames, not just these 4.
3. **Rail labels applied as instance overrides again.** Decisions #2/#3 say those labels apply "everywhere", so the 4 new leaves use them rather than being born with copy the founder has already superseded — consistent with PR 2's landing. But that is now 5 frames carrying instance-level label overrides, which PR 6 will have to clear when it fixes the labels at component level. **Recommend PR 5/6 fix `Frame 5904` (`2906:7170`) at the component level and then strip these overrides**, rather than adding more.
4. **Neither section banner covers the new frames** — the new rows sit at `y 6000` / `y 8800`, well outside both Settings banners. Same pre-existing gap flagged in PRs 1 and 2; now affecting 12 frames across the three Phase A PRs.
5. **Navbar avatar `IMAGE` fill** (§6) — shared-component debt, not addressable from an instance.

---

## 9. No shell in this session

No Bash/shell tool was available. To be finalised in a follow-up session — same pattern as PRs #98 / #102 / #110 / #130 / #151 / #205 / #206:

- create branch `sprint-2/settings-display-leaves` (stacked on PR 2's branch)
- commit this report
- transcribe the §10 entry into the Build Plan's live docx (Section 9) as **#246**, and append a forward-pointer to **#230**'s Status cell (**#230 stays Open** — Phase A closes #7/#8/#10, so **7 of the 10 founder decisions remain**)
- open the PR

**Two `use_figma` authoring notes worth folding into the standing gotchas list**, both hit during this build:
- **`await` inside a `forEach` callback is a syntax error** in this environment — the callback is not async. Use `for…of` / indexed `for` loops when the body awaits.
- **`node.query()` selectors cannot contain non-ASCII characters.** `query('FRAME[name*=Row — ]')` failed with `Invalid selector: unexpected character (0xe2)` because of the em-dash — which matters in this file specifically, since the em-dash is the house naming convention. Use `findAll(n => n.name.indexOf('Row ') === 0)` instead. Usefully, that failure also confirmed **`use_figma` rolls writes back atomically on error** — the partially-built frame from the failed run did not persist (verified by reading the canvas before retrying, rather than assuming).

---

## 10. Draft Decision Log entry — #246

> **#246 — The four Display, Language & Region leaf screens are built, desktop + mobile, and the section hub's rows now navigate.**
> `sprint-2/settings-display-leaves`, 2026-09-07. Executes **founder decision #10** of the Settings-family consolidation set, closing the audit's finding that the Display hub listed 4 rows with no destination frames anywhere. **Phase A (#7, #8, #10) is now complete.**
> **8 new frames:** `Settings — Accessibility` (`6304:15181`) / `— Mobile` (`6303:15173`); `Settings — Display` (`6304:15329`) / `— Mobile` (`6303:15221`); `Settings — Language` (`6304:15471`) / `— Mobile` (`6303:15262`); `Settings — Data Usage` (`6304:15615`) / `— Mobile` (`6303:15307`). Desktop 1440 × 2517 at the canonical rail/content geometry; mobile 390 wide (#86).
> **Desktop leaves are built WITHOUT the Community-style left sidebar** (decision #4), like PR 2's landing — 5 direct children each (navbar, rail, 2 dividers, content panel), with a text sweep for `@christine001`/`Trending News`/`Suggested`/`Followers`/`View profile` returning zero hits on all four. Nav rail active = **"Display, Language & Region"** via the set's real `clicked display` variant. Mobile leaves clone `5696:8213`'s shell verbatim (`Top Bar`, `‹ Settings` back bar, `Settings Group` card), with the back bar additionally wired to the hub.
> **8 reactions wired on the two existing hub frames** (`2922:5832` desktop, `5649:8140` mobile) — the only existing-frame edits; nothing was restructured, relabelled or restyled. Every hub row was **identified by reading its own text**, not by index, because the desktop rows are generically named `Frame 5915`/`5917`/`5918`/`5919`. All reactions read back from fresh handles.
> **A real content finding, not a padding exercise:** Display was initially built with Text size + Display density, but reading the hub's own pre-existing row copy showed it already assigns **"contrast, motion and text size" to Accessibility** and scopes Display to **"how content is laid out"**. Keeping Text size on both would have duplicated a control across sibling leaves purely to stop Display looking thin. The row was **removed** from both Display frames, leaving one honest row plus a wayfinding cross-reference. **Consequence, flagged for the founder: Display does not justify its own leaf — recommend merging it into Accessibility, taking the section from 4 leaves to 3.** Both frames are built and wired either way.
> **No backend exists for any of these four leaves** — no motion/contrast/text-scale preference store, no i18n layer, no data-saver or media-quality API, and no media pipeline at all. Every control is a design-only stub for `figma-to-code` to render disabled with a "not wired" note, per `PrivacySettingsPage.tsx`'s precedent. **No light/dark theme toggle was designed** — deliberately, since the app ships light-only and a theme switch would contradict an established decision rather than merely lack a backend. Language's three non-English entries are illustrative and say so **on the frame itself**, not only in this report.
> **Components reused as real instances**, not hand-drawn: `Settings Toggle` (`5694:8219`) ×4, and the navy-bound chevron (`6186:14569`) — never the invisible white-bound `Category Nav` chevron. The only genuinely new control is a radio (no radio/checkbox component exists in this file): a 20px `color/icon/inactive` ring with a 10px `brand/green` dot, palette-only.
> **Audit, measured node-by-node across all 8 frames, authored vs inherited stated separately:** authored — **133 paints, 133 bound, 0 unbound, 0 off-palette, 0 `brand/green-tint-28`, 0 new colours, 0 overlaps**, no Admin-zone clash, 0 Community-sidebar content. Inherited component-instance debt — **4 unbound**, one per desktop frame, all the shared Navbar's avatar `IMAGE` fill, which is not editable from an instance and was deliberately not force-bound; mobile frames have **0**.
> **Flagged, not fixed:** the Display-merge recommendation above; the cloned rail's inherited targets still point at `2922:5143`/`2922:5602`, both slated for archival in PR 5 (a file-wide re-point affecting ~20 frames); rail labels applied as instance overrides for a fifth frame family, which PR 6 should replace with a component-level fix and then strip; and neither section banner covering the new rows (now 12 frames across Phase A).
> Full detail: `docs/sprint-2-settings-display-leaves-report.md`. **PR 3 of 6**; **Decision Log #230 stays Open** — Phase A closes #7/#8/#10, leaving **7 of 10** founder decisions for Phase B.

---

## 11. Draft CLAUDE.md status bullet

> - **`sprint-2/settings-display-leaves` (figma-screen-builder, 2026-09-07) is
>   PR 3 of 6 in the Settings-family consolidation (Decision Log #230) and
>   executes founder decision #10 — the four Display, Language & Region leaf
>   screens. Figma design only, no app/backend code. This is the LAST Phase A PR:
>   Phase A (#7/#8/#10) is complete and PRs 1–3 go to the founder before Phase B.**
>   Report: `docs/sprint-2-settings-display-leaves-report.md`. Decision Log
>   **#246** added; forward-pointer on **#230**, which **stays Open** — **7 of the
>   10 founder decisions remain**.
>   - **8 new frames**, closing the audit's finding that the Display hub listed 4
>     rows with **no destination frames anywhere**: `Settings — Accessibility`
>     (`6304:15181`) / `— Mobile` (`6303:15173`); `Settings — Display`
>     (`6304:15329`) / `— Mobile` (`6303:15221`); `Settings — Language`
>     (`6304:15471`) / `— Mobile` (`6303:15262`); `Settings — Data Usage`
>     (`6304:15615`) / `— Mobile` (`6303:15307`).
>   - **Desktop leaves built WITHOUT the Community sidebar** (decision #4, same as
>     PR 2's landing) — 5 direct children each, zero sidebar-content text hits on
>     all four. Rail active = **"Display, Language & Region"** via the set's real
>     `clicked display` variant. Mobile leaves clone `5696:8213`'s shell verbatim.
>   - **8 reactions added to the two hub frames** (`2922:5832` / `5649:8140`) —
>     the only existing-frame edits. Each hub row was **identified by reading its
>     own text, not by index**, because the desktop rows are generically named
>     `Frame 5915`/`5917`/`5918`/`5919`; wiring by position would have been an
>     unverified guess. All read back from fresh handles.
>   - **A real content finding rather than a padding exercise:** Display was first
>     built with Text size + Display density, but the hub's own pre-existing copy
>     turned out to already assign **"contrast, motion and text size" to
>     Accessibility** and scope Display to **"how content is laid out"**. Keeping
>     Text size on both would have duplicated a control across sibling leaves just
>     to stop Display looking thin. It was removed, leaving one honest row plus a
>     wayfinding cross-reference — and **Display therefore does not justify its own
>     leaf. Recommend merging it into Accessibility (4 leaves → 3); founder call,
>     both frames built and wired either way.**
>   - **No backend exists for any of the four** — no motion/contrast/text-scale
>     store, no i18n layer, no data-saver or media-quality API. Every control is a
>     design-only stub for `figma-to-code` to render disabled with a "not wired"
>     note (`PrivacySettingsPage.tsx` precedent). **No light/dark theme toggle was
>     designed** — deliberately, since the app ships light-only and a theme switch
>     would contradict an established decision rather than merely lack a backend.
>     Language's three non-English entries are illustrative and say so **on the
>     frame itself**, not only in the report.
>   - **Audit, authored vs inherited stated separately:** authored — **133 paints,
>     133 bound, 0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new
>     colours / 0 overlaps** across all 8 frames. Inherited debt — **4 unbound**,
>     one per desktop frame, all the shared Navbar's avatar `IMAGE` fill, not
>     editable from an instance and deliberately not force-bound; mobile **0**.
>   - **Flagged, not fixed:** the Display-merge recommendation; the cloned rail's
>     inherited targets still pointing at `2922:5143`/`2922:5602`, both slated for
>     archival in PR 5 (a file-wide re-point affecting ~20 frames); rail labels now
>     applied as instance overrides on a fifth frame family, which **PR 6 should
>     replace with a component-level fix on `Frame 5904` (`2906:7170`) and then
>     strip**; and neither section banner covering the new rows (now 12 frames
>     across Phase A).
>   - **Two `use_figma` authoring gotchas hit and worth folding into the standing
>     list:** `await` inside a `forEach` callback is a **syntax error** (the
>     callback isn't async — use `for…of`); and **`node.query()` selectors reject
>     non-ASCII characters**, so `query('FRAME[name*=Row — ]')` fails with
>     `Invalid selector: unexpected character (0xe2)` — which bites in this file
>     specifically because the **em-dash is the house naming convention**; use
>     `findAll` with a predicate. That failure also usefully confirmed
>     **`use_figma` rolls writes back atomically on error** — the partially-built
>     frame did not persist, verified by reading the canvas before retrying rather
>     than assuming.
>   - Figma writes by the agent (no shell that session); branch, commit, docx
>     Decision Log transcription and PR finalised in a follow-up session.
