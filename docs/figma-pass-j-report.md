# Figma pass J - resync of existing frames and component alignment

Agent: figma-design-system. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`. Existing frames only; no new screens (the two Between Weeks clones in item 8 are the one brief-named variant).

Source of the decisions: Decision Log #403 and #404 (items 1, 3, 9, 11, 12, 14, 17 of #404 as listed in `docs/build-register.md` Sections 14 and 15). Register rows touched (status lines added): B-007, B-012, B-014, B-015, B-045, B-060, B-082, B-083, B-087, B-095, B-096, B-098, B-099, B-104, B-108, B-113. No B-ID added or removed.

## 1. Canvas audit (standing check, Decision Log #404 item 14)

No whole-canvas depth-4 `get_metadata` was run. Before and after, per top-level node: a `findAll` count and a hash of the top-level ids.

| Check | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 838 | 844 |
| Hash of the 838 original top-level ids (new ids excluded) | 3090656040 | 3090656040 (identical, same order) |
| Total nodes on `0:1` | 139,240 | 137,733 |
| Nodes removed by the two authorised deletions | | 2,204 (`1620:8975`) + 105 (`6695:27342`) = 2,309 |

The six new top-level nodes: the two Between Weeks variants and their two notes (item 8), and the two third-page carousel variants moved out of their component sets, hidden and prefixed `ARCHIVED -` (item 9). Nothing else was deleted. Every other change is a hide, an edit in place, or a clone.

Measured on the new or edited nodes: 0 unbound solid paints on the 11 newly authored nodes and the 9 new component variants checked (clones of bound nodes, or bound explicitly); 0 overlaps among the new, moved and resized top-level nodes after one correction (the desktop Between Weeks variant first clashed with `5545:7394` and was moved to clear space); no frame of the 34 admin frames changed size. The two Between Weeks variants are clones of legacy absolute-layout frames and keep the unbound paints those frames already had (inherited, not authored).

## 2. Items 1 to 10

| # | Result |
|---|---|
| 1 | Final-week banner. On the three desktop frames (`6660:28736`, `6660:31044`, `6660:33353`) the banner sat inside the Modal stack but had a 12% tint fill with nothing behind it, so the dimmed page and the composer showed through. The Modal stacks (`6673:32037`, `6673:32476`, `6673:32915`) now have an opaque `color/background/surface` fill, radius 12, clipped. The banner is inside the stack above the scrim and clear of the modal card. The three mobile frames (`6660:35662`, `6660:35699`, `6660:35737`) already carry the banner in an opaque in-flow wrapper above the content; no change. Checked by screenshot on `6673:32037`, `6660:31044` and `6660:35662`. A page search found the banner text only on these six frames. |
| 2 | Account Information (Edit). The Country field is hidden on `2924:7112` (`2924:7243`) and `5649:8176` (`5649:8200`), both renamed `ARCHIVED -` (the mobile frame shrank from 775 to 707 px, auto-layout). Notes `6628:23286` and `6628:23287` are rewritten as RESOLVED and say where the profile country is edited (Edit Profile, label "Country") and that the safeguarding country is IP-derived. The stale in-frame note `5649:8206` was reworded, which the brief did not name but which otherwise still described the Country field. |
| 3 | Country line. On the six Pass H frames (`6706:26750`, `6707:26595`, `6707:26727`, `6707:26938`, `6709:26922`, `6709:27056`) the sample is now a blank-country user: the "Nigeria" line is hidden (renamed "Country line (hidden: blank-country sample, shown only when filled, #403 item 17)"). Mobile frames shrank by 20 px (auto-layout). `1620:8975` ("Desktop - 9", a 1440x1820 frame with 2,203 descendants, positioned at x 1363 in a 1440-wide clipped frame) was hidden, then deleted after the reference check in section 3. |
| 4 | Desktop Block confirmation. The body of `6655:29589` (inside `6655:27355`) now matches the mobile dialog `6655:29669`: the consequences text and the optional Reason field are clones of the mobile nodes (`6706:26926`, `6706:26927`), with the handle changed to the profile on the desktop background (`nelson_iheagwam`). The old placeholder frame is hidden and prefixed `ARCHIVED -`. The dialog grew from 266 to 411 px and was re-centred in the 900 px viewport. Screenshot checked. |
| 5 | Settings > Privacy. A "Blocked users" row (clone of the "Your Post" row) after "Direct Message", on desktop (`6714:28454` in `6178:14437`) and mobile (`6714:28464` in `6185:14547`). Description "You can unblock someone at any time." (a substring of the existing page text). `ON_CLICK > NAVIGATE` to `6705:26172` (desktop list) and `6706:26580` (mobile list), read back from fresh handles. |
| 6 | 2FA. "Can't scan? >" link on `6655:2` and `6655:27159` (to the manual-key frames `6711:26922` / `6712:27330`); "Turn off" control on `6655:173` and `6655:27322` (to `6711:27333` / `6712:27465`). Backup codes moved on the canvas between the code step and the success step: desktop `6711:27117` to x -12240 (success `6655:137` to -10620, on `6655:173` to -9000), mobile `6712:27387` to x -15600 (success `6655:27288` to -15100, on `6655:27322` to -14600); no overlap. Prototype links wired: Continue to Enter code; "Turn on two-factor authentication" to backup codes; "I've saved my codes" to the success step (was: to "2FA is on"); Done to "2FA is on"; both mobile twins the same. All 12 reactions read back. |
| 7 | Edit Profile. Date of Birth is read-only on `1466:15934` (box `1565:2438`) and `5702:8317` (`5702:8353`): `brand/green-tint` well, `color/text/secondary` value, and a hint "Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]" (existing wording from the Account Information frames). |
| 8 | Between Weeks, day 1, 00:00 to 08:00. Clones of `5802:9183` and `5815:8948`: desktop `6716:27347` (at x 72989, y 8683: the first slot beside the mobile frame clashed, so it sits at the first clear slot in that band), mobile `6716:27491` (x 28044, y 9700). The body line reads "Week 1 opens at 08:00."; the week result and the "View this week's results" link are removed from the clones (no week has run yet). A note beside each (`6717:27474`, `6717:27475`) records that this window is 8 hours and carries one SCOPE OPEN point (section 6). |
| 9 | Carousel. The Final week module sets (`6697:26234` desktop, `6697:27448` mobile) are now 2 pages of 3 cards: footers read "Showing 1-3 of 6 finalists" and "Showing 4-6 of 6 finalists" (the feed instances inherit), the third dot is hidden, and the `Page=3` variants (`6697:26197`, `6697:27409`) are moved out of the sets, hidden and prefixed `ARCHIVED -`. The sets were resized to fit (1616 and 748 wide). The G1 note `6698:26187` is updated. The archived Contest-page showcase frames still say 9 (archived, left). |
| 10 | `6695:27342` ("ARCHIVED - legacy absolute layer", hidden, 104 descendants) deleted from `2094:994` after the same check. Parent size unchanged. |

## 3. Inbound-reference proof for the two deletions

Both subtrees were tested together on all three pages: a set of 2,309 node ids (both roots and every descendant) was compared with every node on `0:1` (139,240 scanned), `1860:2500` (11) and `2155:1285` (42,201):

- reactions on any node outside the subtrees whose destination is in the set: 0 hits;
- text hyperlinks of type node pointing into the set: 0 (no text on those pages carries one);
- flow starting points: none of the 25 on `0:1` is in the set; the other two pages have none;
- instances or components: neither subtree contains a component, so no instance elsewhere can depend on it.

Identity was re-checked immediately before each `remove()` (name, parent id, descendant count, hidden state for `6695:27342`). `6695:27342` had two outbound reactions of its own, which leave with it.

## 4. Item 11 - components aligned to the screens, then adopted family by family

### 4.1 Collection and styles

- `Soccernity Spacing & Radius` gains `space/3`, `space/7`, `space/8`, `space/18`, `space/22`, `space/28`, `radius/10`, `radius/16` (as briefed) and `radius/2` (the 20 px callout bar needed a 2 px radius). The first six were not in the brief's list; the screens use those paddings. Scopes and code syntax copied from the existing variables. The collection now has 22 FLOAT variables; `Soccernity Theme` is untouched (17).
- Text styles with a fixed line height changed to auto (the screens use auto): `Admin/Pill`, `Admin/Button`, `Admin/Body small`, `Admin/Table header`. New styles: `Admin/Button small` (13 Semi Bold), `Admin/Dialog title` (20 Semi Bold), `Admin/Body small medium` (13 Medium), `Admin/Table cell`, `Admin/Table cell strong`, `Admin/Dialog body` (14 Regular), all auto. No screen used an `Admin/*` style, so no screen text changed.

### 4.2 Component changes (set `6671:27364` on the components frame)

| Component | Change |
|---|---|
| Pill `6671:27397` | Padding 3/10 (bound to `space/3`), auto line height (height 21; 23 with a stroke). New tone `Outline` (surface, 15% outline, secondary text) for Scheduled / Forfeited. |
| Button `6671:27383` | New `Size` property: Large (10/20, 14 px; all six existing variants), Medium (8/16, 13 px), Small (7/14, 13 px), Dialog (12/18, radius 8, 13 px). New `Type=Neutral` (surface + 15% outline + primary text). Five variants added (11 in total), set wraps at 1100 px. |
| Banner `6671:27519` | Radius 10, padding 14/16, new boolean `Show title` (Title optional), new `Tone=Error` (tint with the alert bar). |
| Callout `6671:27493` | Same radius, padding and `Show title`; new `Bar` property (Full or Short: a centred 3x20 bar, radius 2); new `Tone=Error`. Existing variants renamed `..., Bar=Full`. |
| Dialog `6671:27569` | Radius 16, header padding 24/28/20/28, title 20 Semi Bold, close box 32 px radius 8 with a "✕" glyph, body padding 22/28 gap 16, body text 14 Regular, footer 0/28/24/28 with Neutral Cancel. |
| Table Row / Table | Radius 10, padding 14/20, header text auto, cell text 13 px (first cell Semi Bold). |
| Field, Note | Not changed (not in the brief). |

### 4.3 Adoption method

A swap was allowed only if the look was unchanged. For every candidate local frame a temporary instance was built off-canvas with the same text and overrides, both were exported as PNG at 2x and the bytes compared. Only identical bytes were swapped, and the new instance's bounding box then had to match the original's within 1 px, with the parent frame size unchanged. The replaced local frame is kept as a hidden sibling renamed `ARCHIVED - <name> (replaced by <Component> instance, pass J)` (no deletion). All 34 admin frames of pass C and F1 (list in `docs/figma-pass-g2-report.md` 4.1) were processed.

### 4.4 Result per family

| Family | Local frames | Adopted | Not adopted |
|---|---|---|---|
| Pill (incl. "Marker") | 91 | 91 | none. 88 pixel-identical; 3 "Legal hold" markers differ by at most 3 of 255 on one channel, because the original's stored colour under the variable binding is 1/255 off the token; geometry identical |
| Button | 134 | 134 | none. 129 straight swaps; 4 "Lift hold" buttons need the instance alignment overridden to MIN (fixed 110 px, left-aligned text); 1 "Revoke username" needs instance opacity 0.5 |
| Banner | 10 | 10 | none (needed the new Error tone for the nine validation / load-error banners) |
| Callout | 21 | 21 | none (needed Bar=Short and the Error tone) |
| Dialog | 9 | 1 (Revoke username, text-only body) | 8: the body holds a field, a banner or a summary block, and an instance has no slot for them (Reject image x2, Revoke username with banner, Confirm date of birth correction x2, Reporter acted in bad faith, Legal hold, Lift hold). Also: dialog body text is 13 Medium in the hold dialogs and 14 Regular elsewhere; the component carries 14 Regular, the only size the one adoptable dialog uses |
| Table | 8 | 0 | The component is four text columns by three rows. Every local table has a pill or button cell in each row, and 4 to 7 columns (the only 4-column table has 6 rows); the weeks table also has a 58 px two-line header |
| Field | 93 (22 plain label + input) | 0 | 22 comparable frames tried, 0 within 1 px: the component is 40 px high with gap 6 (screens: 43 px, gap 8, textareas to 112 px); 71 more carry helper text or another structure. Field was not in the brief's list of components to change |
| Note | 0 on the frames | n/a | the notes are separate top-level frames |

Total: 257 instances placed (91 + 134 + 10 + 21 + 1), matching the 257 original/instance pairs found by the equivalence test.

### 4.5 Before and after

Whole-frame equivalence test on all 34 frames: render with the instances, then with the hidden originals restored and the instances hidden, compare bytes. 29 frames are byte-identical. 5 differ only by the stored-colour rounding above: `6643:21602` and `6643:21973` (the disabled "Create contest" button, 125 and 118 pixels, max 2 of 255), and `6647:23351`, `6672:28898`, `6672:29059` (the "Legal hold" marker, up to 3 of 255). Screenshot pairs (get_screenshot, 1600 px, pixel diff in Python):

| Family | Frame | Result |
|---|---|---|
| Pill | `6644:22559`, `6643:21602`, `6647:23351` before vs after | identical, identical, 1,455 px in the 80x21 Legal hold marker (max 3) |
| Button | same three | identical, 125 px (max 2) on "Create contest", same marker |
| Banner, Button, Pill | `6643:21973` originals vs instances | 118 px, max 2 ("Create contest") |
| Callout, Button, Dialog (kept local) | `6672:27278` | identical |
| Dialog | `6647:25789` (Revoke username) | identical |
| Callout, Pill | `6644:22559` | identical |

### 4.6 Not done in item 11

- The shell search bar and the Admin Shell instances were not touched.
- Field, Table and eight Dialogs stay local frames (4.4).
- The on-canvas notes (about 120) were not rebuilt on the Note component (no change requested).
- The hidden `ARCHIVED -` originals (257) stay in the frames. Purging them needs a deletion exception.

## 5. Copy

No new guardian-, minor- or data-processing wording was written. The one new string that touches minors' data, the Date of Birth hint on Edit Profile, reuses the existing Account Information wording with its tag. The other new strings are existing text or labels ("Blocked users", "Can't scan?", "Turn off", "Week 1 opens at 08:00", "You can unblock someone at any time.").

## 6. SCOPE OPEN and Decision Log candidates (none resolved here)

On canvas: one SCOPE OPEN line on each Between Weeks day-1 note: whether the previous month's crowned result is shown in the 00:00 to 08:00 window.

Candidates:
1. Day 1, 00:00 to 08:00: does the Between Weeks variant show last month's crowned result, or nothing?
2. Hidden originals: purge the 257 `ARCHIVED -` frames inside the admin frames (and the other hidden legacy layers) under a deletion exception?
3. Dialog body type size: the hold dialogs use 13 Medium, the others 14 Regular; one size for the system?
4. Dialog and Table composition: add slots (a field row, a banner, a summary block, free cells) so the eight field-bearing dialogs and the eight tables can adopt the components, or leave them local?
5. Field: change the component to the screens (padding 13/14, gap 8, multi-line value, helper row) so 93 frames can adopt it, or change the screens?
6. The pill, button and marker originals store a colour 1/255 off the token under the binding (navy and 15% outline). Instances render the token. Rebind the originals everywhere?
7. Blocked users row icon: it reuses the information icon of the sibling rows; no dedicated icon exists.
8. Desktop Between Weeks variant sits at x 72989: move it next to the mobile variant once the band at x 28000 to 34600 is cleared?
9. Stale canvas notes from Pass H still say the existing 2FA frames were not rewired, the Privacy page has no Blocked users row and the desktop Block body is a placeholder; they are now out of date.
10. The two archived Contest-page showcase frames (`6661:29122`, `6661:29321`) still show "9 finalists".

## 7. Not touched

The legacy desktop profile frames and the large Community frames (a later pass, as briefed); user-facing contest frames other than the carousel sets; legal frames; every `.docx`; application code.
