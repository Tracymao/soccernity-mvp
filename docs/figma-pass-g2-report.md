# Figma pass G2 - legacy-layer deletion, spacing/radius variables, component adoption trial

Agent: figma-design-system. Date: 2026-10-16. Branch: `figma/pass-g2-cleanup-spacing-components`.
Scope: Figma and docs only. No application code, schema, legal copy, DPIA or `.docx` was changed. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, Light mode only. No user-facing frame was touched (that is G1). The admin shell search bar was left as is (item 4).

Outcome in one line: item 1 done (21,896 hidden nodes deleted, proven unreferenced); item 2 done (13 FLOAT variables, 179 bindings on the nine components); item 3 **adopted nothing**: across 34 in-scope admin frames not one local Button, Pill, Field, Banner, Callout, Table, Dialog or Note matches its F2 component closely enough to swap without changing the look, so per the brief every local frame was left and is listed in section 4.

## 1. Item 1 - delete the ten hidden legacy layers

The one authorised exception to "never delete nodes". Only the hidden child `ARCHIVED — legacy absolute layer (superseded by auto-layout rebuild, Pass F2)` of each frame was removed. Each was checked by id, parent and name immediately before `remove()`; all ten passed.

### 1.1 Proof that nothing referenced them (done before any delete)

| Check | Result |
|---|---|
| Nodes inside the ten layers | 21,896: the ten layer frames plus 21,886 inside them (18,147 vectors, 1,223 groups, 466 frames, 1,140 text, 328 ellipses, 284 rectangles, 268 lines, 30 boolean operations) |
| Components / component sets / instances inside them | **0 / 0** (so no instance, swap property or variable alias can point at a component that lives in them) |
| Reactions inside them | 0 (nothing in them links out either) |
| Prototype reactions anywhere pointing in (page `0:1`, all 136,738 nodes outside the layers, 889 reactions: `ON_CLICK`, overlay, navigate, scroll-to, change-to) | **0 hits** |
| Page `0:1` flow starting points (16) | 0 in the layers |
| Text hyperlinks of type NODE (22,019 text nodes outside the layers) | 0 hits |
| Other pages: `dump` (42,201 nodes, 17 reactions) and the cover page (11 nodes, 0 reactions) | 0 hits |
| Variables | Variables cannot target a node. The layers held only bindings **to** variables; deleting them removes those bindings and changes no variable. `Soccernity Theme` still has 17 variables before and after |

No stop condition was hit.

### 1.2 Node counts

| Frame | Layer id | Nodes in layer | Frame total before | Frame total after | Delta |
|---|---|---|---|---|---|
| `2008:655` | `6672:29302` | 2,196 | 2,761 | 565 | -2,196 |
| `2009:5168` | `6673:27398` | 2,200 | 2,771 | 571 | -2,200 |
| `2009:2913` | `6673:27847` | 2,194 | 2,749 | 555 | -2,194 |
| `6171:14797` | `6673:28306` | 2,196 | 2,761 | 565 | -2,196 |
| `6171:16994` | `6673:30316` | 2,192 | 2,751 | 559 | -2,192 |
| `2496:4462` | `6673:30740` | 2,167 | 2,700 | 533 | -2,167 |
| `2565:3951` | `6673:31167` | 2,167 | 2,700 | 533 | -2,167 |
| `6660:28736` | `6673:31614` | 2,194 | 2,753 | 559 | -2,194 |
| `6660:31044` | `6673:32053` | 2,195 | 2,744 | 549 | -2,195 |
| `6660:33353` | `6673:32492` | 2,195 | 2,744 | 549 | -2,195 |
| **Total** | | **21,896** | | | **-21,896** |

Every frame's width and height are identical before and after (1440 x 1730.81, 1440 x 1738.11 on the two pinned-feed frames); each lost one child (hidden, so nothing moved). A screenshot of `2008:655` after the delete reads correctly.

### 1.3 Whole-canvas deltas (page `0:1`)

| | Before | After |
|---|---|---|
| Top-level nodes | 779 | 779 |
| Hash of the sorted top-level id list | 2374062666 | 2374062666 (identical: no top-level node added or lost) |
| Total nodes | 158,634 | 136,738 (-21,896 = exactly the deleted layers) |

The literal `get_metadata` on `0:1` at depth >= 4 was not run: the page holds about 158,000 nodes and the tool takes no depth parameter, so it cannot return the page (same limit pass F2 reported). Counts come from `findAll` per top-level child plus the id hash above. All temporary instances created for the trial in section 4 were removed; the equal top-level hash and the exact -21,896 total show none is left.

One node that still contains "legacy absolute layer" in its name is **not mine**: `6695:27342` inside `2094:994` (G1's Voting rebuild, "superseded by Already Voted layout, #403 item 7", hidden, 104 nodes). It is outside the ten frames of this brief and was left.

## 2. Item 2 - collection "Soccernity Spacing & Radius"

Collection `VariableCollectionId:6700:27276`, one mode **Light**, 13 FLOAT variables, scopes set (spacing `GAP`, radius `CORNER_RADIUS`), WEB code syntax `var(--space-N)` / `var(--radius-sm)` etc.

| Variable | Value | | Variable | Value |
|---|---|---|---|---|
| `space/2` | 2 | | `space/16` | 16 |
| `space/4` | 4 | | `space/20` | 20 |
| `space/6` | 6 | | `space/24` | 24 |
| `space/10` | 10 | | `radius/sm` | 6 |
| `space/12` | 12 | | `radius/md` | 8 |
| `space/14` | 14 | | `radius/lg` | 12 |
| | | | `radius/full` | 999 |

Names are px-based on purpose: the values the nine components already use (2, 4, 6, 10, 12, 14, 16, 20, 24 and 6 / 8 / 12 / 999) do not form a clean t-shirt scale, and renaming them to one would have meant changing a value.

Bound on the nine F2 components (Button, Pill, Field, Callout, Banner, Note, Dialog, Table Row, Table; 47 frames/variants, nodes inside nested instances inherit):

| Property | Bound | Left unbound |
|---|---|---|
| Padding (top/right/bottom/left) | 122 | zeros only (no `space/0`) |
| Gap (`itemSpacing`) | 29 | zeros only |
| Corner radius (four corner fields each) | 28 nodes | zero radius only |

Audit after binding: 0 non-zero padding, gap or radius still unbound inside the nine components. A before/after geometry fingerprint (width, height, x, y of every node, per component) is **identical** for all nine, so the bindings changed no value. Not bound: the showcase layout around the components (component-set containers, usage notes, the "Dialog on scrim" example). The `Soccernity Theme` collection was not touched.

The intro text on the components frame (`6671:27366`) still said spacing was literal and pointed at the F2 report; it now says the values are bound to this collection and that screens are not swapped (see section 4).

## 3. Item 4 - shell search bar

Untouched, as instructed. No Admin Shell instance was edited anywhere in this pass.

## 4. Item 3 - component adoption trial (result: no swap)

### 4.1 Method

Frames in scope (34): Create / Edit Contest and their validation and error states (`6643:21602`, `6643:21973`, `6644:21820`, `6644:22188`), Overview x4 (`6644:22559`, `6644:22852`, `6644:23174`, `6644:23391`), Cycle History x3 (`6645:22444`, `6645:22705`, `6645:22922`), Held Investigations x4 (`6647:23351`, `6647:23603`, `6647:23831`, `6647:24060`), Flagged Images x5 (`6647:24318`, `6647:24566`, `6647:24833`, `6647:25103`, `6647:25320`), User Detail and revoke dialogs x4 (`6647:25540`, `6647:25789`, `6649:24462`, `6649:24714`), DOB correction x5 (`6649:24980`, `6649:25217`, `6649:25463`, `6649:25721`, `6649:25952`), Bad faith / Legal hold / Lift hold dialogs and the Report Detail / Appeal Review hold states (`6672:27278`, `6672:27349`, `6672:27420`, `6672:28898`, `6672:29059`). The impression-view frames (`6646:*`) are not in the brief's list and were not touched.

For every candidate local frame (found by name: Button, Pill, Field, Banner, Callout, Table, Dialog) a temporary instance of the matching component variant was created off-canvas, given the same text, measured, and removed. A swap was allowed only if the look would not change: same radius, padding, type size and weight, fill and stroke tokens, and width and height within 1 px. Nothing reached that bar, so no swap was made and no screen was edited.

### 4.2 Candidates found, and why each family cannot match

Counts are local frames inside the 34 frames. "Screens" is what the local frames use; "Component" is the F2 component.

| Family | Local count | Screens | Component | Verdict |
|---|---|---|---|---|
| Button | 134 | radius 6 (106) or 8 (28); padding 10/20 (52), 8/16 (36), 7/14 (18), 12/18 (28); text 13 (82) or 14 (52); heights 30-40; no fixed line height (14 px text is 17 high) | radius 6, padding 10/16, 14 Semi Bold on a 20 px line height, 40 high (Secondary 42 with its stroke) | None matches. The nearest are 28 navy buttons on the hold dialogs and hold-active states (`6672:*`): height 40 equals and width is off by 1-9 px, but they are 13 px text, radius 8, padding 12/18, so they fail on radius and type size. (The first dry run counted 9 of them as "within 1 px" on size alone; they do not pass the full test) |
| Pill | 86 | radius 999 (same), padding 3/10, 12 Medium (same), height 21 (66) or 23 (20 with a stroke) | radius 999, padding 4/10, 12 Medium on a 16 px line height, 24 high; Alert 26 | **Closest family.** Width equals for all 66 tint / navy pills, height is +3 px (24 vs 21). Cause: the Admin/Pill text style has a fixed 16 px line height (screens: auto, 15) and padding 4 vs 3 |
| Field | 93 (64 with a Label + Input structure, 40 of them with helper text) | label 12 Medium (same), gap 8, input padding 13/14, input 43 high, radius 6 (same), textareas up to 112 high | label 16 high, gap 6, control padding 10/12, 40 high, one-line value | 0 of 64 within 1 px (height deltas from -81 to +18 px; the component's value is one line, the screens' textareas are up to 112 high). The 93 "Field" frames also include rows that are not inputs |
| Banner | 10 | radius 10, padding 14/16, one 13 px text line, 44 high | radius 6, padding 12/16, Title 14 Semi Bold + Body 13, 64 high, optional action | No: radius, padding, no title line |
| Callout | 21 | radius 10, padding 14/16, one 13 px text (the consequence text), 44 / 48 / 60 high | radius 6, padding 12/16, Title + Body, 66-68 high | No: same reasons; the screens have no title text and would need one invented |
| Table | 8 (+ 8 header rows and 62 frames named Row, some of them not table rows) | radius 10, header row 58 high, padding 14/20, rows 49-60 with a 1 px divider rectangle and pill / button cells, text 12 and 13 | radius 8, header 41, data 45, padding 12/16, 14 px body, exactly four text cells per row | No: radius, row height, padding, type size, and the screens' rows hold pills, buttons and wrapped text |
| Dialog | 9 | radius 16, header 76 high (padding 24/28/20/28) with a 20 px Semi Bold title and an 8-radius close box, body padding 22/28, actions padding 0/28/24/28, 560 wide (620 on the two DOB dialogs) | radius 12, header 72 (padding 20/24), 16 px Section heading title, 6-radius close box, body padding 20/24, footer 0/24/24/24, 560 wide | No: radius, padding, title size; the screens' dialogs also hold fields, which the component body does not take as a slot |
| Note | 0 inside the 34 frames; about 120 note frames beside them on the canvas (for example `6650:25169`, `6650:25244`) | solid green-tint box, no outline, padding 14, several 12 px bullet lines, tag text mixed into the first line | dashed navy outline, padding 12/14, upper-case Tag + one Body text | No: the notes are separate top-level frames next to the screens, not on them, and have no dashed outline or Tag line |

The Create Contest frame is the clearest single example: its "Button — Create contest" is 141 x 37 (padding 10/20, 14 px on a 17 px line) and the component Primary Disabled for the same label is 133 x 40; its pills are 21 high, the component 24.

### 4.3 What was left, and what is needed to adopt

Everything above stays a local auto-layout frame with all paints bound. Nothing in a screenshot changed: the only canvas edits of the whole pass are the hidden-layer deletion (no render effect), the variable bindings on the components (geometry fingerprint identical) and one sentence of text on the components frame. Screenshots taken after the changes: the components frame `6671:27364` and Create Post `2008:655` (both read correctly). Per-family before/after screenshots of the admin frames were not taken because no admin frame was edited.

To make adoption possible without a visible change, one side has to move; this pass did not choose (candidates 1 and 2 below):
- Cheapest: Pill. Set the Admin/Pill line height to auto and the pill padding to 3/10, and the component is 21 high like the screens.
- Buttons: the screens carry four paddings and two radii; the component has one of each. Two or three more Button variants (or a Size property) would be needed.
- Field, Banner, Callout, Dialog, Table: radius (10 and 16 in the screens, 6 / 8 / 12 in the components), padding and type sizes all differ; each needs its own decision.

## 5. Decision Log candidates (none resolved here)

1. Which side moves for component adoption: change the F2 components (and the Admin/* line heights) to match the 34 screens, rebuild the screens on the components and accept the visible change (Pill +3 px, Button +3 px, Field +3 to +8 px, rounded corners 10 / 16 to 6 / 12), or keep both and stop calling the components "adopted"?
2. Radius scale: screens use 6, 8, 10 and 16; `Soccernity Spacing & Radius` has 6, 8, 12 and 999 only (the values the components used). Add `radius/10` and `radius/16`, or change the screens?
3. Banner and Callout: screens have a single text line, the components a Title plus Body. Make Title optional?
4. Notes: should the 120 on-canvas notes be rebuilt on the Note component (changes their look: dashed outline, Tag line), and should they move inside the frames they annotate?
5. Spacing variables are primitives in one mode (as briefed). Add semantic aliases (for example `space/field-gap`) or dark mode later? Not needed today (Light only).
6. The remaining hidden "legacy absolute layer" in `2094:994` (`6695:27342`, G1) is the same case as item 1; delete it under the same exception?
7. Closes F2 candidates 1 (no FLOAT variables) and 8 (archived legacy layers kept in the file). F2 candidate 9 (Settings Shell divider lines) and the others are unchanged.

## 6. Verification summary

| Check | Result |
|---|---|
| Ten layers deleted, identity checked by id / parent / name / hidden | 10 of 10 |
| Inbound references (reactions, flow starts, hyperlinks, instances, components) | 0 on all three pages |
| Canvas before / after | 779 / 779 top-level, id hash identical, 158,634 -> 136,738 total (-21,896) |
| Spacing & Radius collection | 1 collection, 1 mode (Light), 13 FLOAT variables, scopes and code syntax set |
| Bindings on the nine components | 122 padding, 29 gap, 28 radius; 0 non-zero value unbound; geometry fingerprint unchanged on all 9 |
| Component swaps on admin frames | 0 (no exact match; reasons in 4.2) |
| Admin Shell / search bar | untouched |
| New copy | none written; no `[COPY PENDING LEGAL REVIEW]` tag added |
| New colours | none |

## 7. Not done

- No component was applied to any admin frame (section 4).
- Literal whole-page `get_metadata` at depth >= 4 (section 1.3).
- No per-family before/after screenshots of the admin frames (no admin frame changed).
