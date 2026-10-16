# Figma pass F2 - components, Create Post rebuild, admin archive

Agent: figma-design-system. Date: 2026-10-16. Branch: `figma/pass-f2-components-createpost-archive`.
Scope: Figma and docs only. No application code, schema, legal copy, DPIA or `.docx` was changed. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, Light mode only.

Pass F1 ran concurrently on the same canvas. Its frames were not touched (Age Gate, activation, Create Profile, other-user profile, contest voting / Between Weeks / Contest page, Create Contest, admin hold actions). Everything that appears on the canvas with a "W0 pass F1" label or an id from 6669 upward other than `6671:27364` and `6679:26292` is F1's.

This session was interrupted once by a session limit. On resume the file was re-read before any write: no duplicates, no half-built state (one Components frame, 19 text styles, all 10 Create Post frames converted exactly once).

## 1. What was delivered

### 1.1 Text styles (19, new)

`Admin/*` (Inter, 11): Page title 28, Section heading 16, Body 14, Body strong 14, Body small 13, Field label 12, Helper 12, Button 14, Pill 12, Table header 12 (upper-case), Note 12 (upper-case).
`Community/*` (Montserrat, 8): Title 20 Regular, Title selected 20 SemiBold, Body 14 Medium, Card heading 12 Medium, Post text 12 SemiBold, Meta 10 SemiBold, Caption 8 Regular, Stat value 14 Medium.
The Community set exists because the rebuilt Create Post frames use exactly those font/size pairs; where a cloned text matched a pair the style was applied.

### 1.2 "Components - Admin & Shared (Pass F2)" frame, `6671:27364` (3600 x 3544, at 40923,-3000)

| Component | Id | Variants / properties |
|---|---|---|
| Button | `6671:27383` | Type Primary / Secondary / Text x State Default / Disabled; text property Label. No red variant (non-negotiable #3). |
| Pill | `6671:27397` | Tone Neutral / Positive / Strong / Alert (alert = surface + `semantic/alert` dot, label stays navy); Label. |
| Field | `6671:27431` | State Default / Focus / **Error** / **Read-only** / Disabled; Label, Value, Helper text, Error message. |
| Callout | `6671:27493` | Tone Info / Alert; Title, Body. |
| Banner (shared) | `6671:27519` | Tone Info / Neutral / Alert; Title, Body, boolean Show action. |
| Note (shared) | `6671:27533` | Kind Scope open / Copy pending legal review / Decision candidate; Body. |
| Dialog | `6671:27569` | Tone Default / Alert (adds alert Callout); Title, Body; uses `elevation/overlay`; a worked "Dialog on scrim" example (`6671:28734`) uses `color/overlay/scrim`. |
| Table Row | `6671:27584` | Type Header / Data; Cell 1-4. |
| Table | `6671:27585` | Composed header + 3 data rows (instances of Table Row). |

Audit of the whole frame: 207 solid paints, **0 unbound**; 127 text nodes, **0 without a text style**. Usage notes sit on the frame under each component, plus a text-style specimen.
Not swapped into any existing screen.

Read-only vs Disabled: Read-only keeps full-contrast text on an off-white well with a solid outline and a "Read-only" tag; Disabled is dimmed with a dashed outline.

### 1.3 Create Post desktop frames rebuilt on auto-layout

Ten frames, each 1440 wide, were legacy absolute-layout with 1,769-1,770 unbound paints. 1,761 of those (99.5%) sat in one place: the club-crest vectors of the Fixtures card. The mobile Create Post frames (`5701:8328`, `5818:8962`, `5818:8997`, `5818:9031`, `5982:10905`, `5982:10932`, `6660:35662`, `6660:35699`, `6660:35737`) were already vertical auto-layout with 0 unbound paints: no work needed, none done.

Frames: `2008:655`, `2009:5168`, `2009:2913`, `6171:14797`, `6171:16994`, `2496:4462`, `2565:3951`, `6660:28736`, `6660:31044`, `6660:33353`.
Not converted: `6661:26929` (Community home feed, Final week showcase - named "Community", not "Create Post"; same legacy background, 1,769 unbound). It is listed as an adoption candidate below.

Method (identical on every frame; frame ids unchanged, so no link broke):
- All legacy children moved, not deleted, into a hidden child frame named `ARCHIVED - legacy absolute layer (superseded by auto-layout rebuild, Pass F2)`.
- The frame is now vertical auto-layout, hugging height: `Navbar` instance (fill width) then `Page body` (horizontal: left rail, centre column, right rail; cards are auto-layout; images, avatars and icon frames are clones of the originals).
- Modal: `Modal stack` (absolute overlay) holding the existing "Final week banner" (reparented) and a rebuilt `Modal` (tabs with selected underline, input, attachments, toolbar, Post button). Each variant was derived from that frame's own legacy modal (visible tabs, placeholder, toolbar label, icons, closed message), so the six modal states are unchanged in content.
- Pinned-feed frames (`2496:4462`, `2565:3951`) have no modal or scrim in the legacy file; none was added. Their centre column reorders the posts and carries the original pinned badge.
- Scrim: one absolute rectangle bound to `color/overlay/scrim`, stretch constraints.
- Frame height: 1731 px (1738 on the pinned frames with the badge); was 1820. Hug sizing, so the rebuilt page is shorter.

Measured on live (visible) content, per frame: **0 unbound solid paints** (323-340 paints each), down from 1,769-1,770. 39-46 plain (non-auto-layout) frames remain per frame: 24x24 icon holders from the icon sets, the profile cover stack, the video overlay frame and the attachment tile. Those are overlays/icon frames by nature.
Unbound gradient: the video overlay `GRADIENT_LINEAR` paint is not a solid and was left as in the original.

Three judgment calls, flagged on canvas (note `6679:26292`) and below:
1. Scrim: the legacy scrim was white at 71%. It is now `color/overlay/scrim` (navy 27.75%), the file's shared scrim token (Decision Log #353). This is a visible change.
2. Fixtures card: club crests replaced by typographic marks (circle with the club initial). This follows Decision Log #85 / #97 and is the only way to reach 0 unbound without keeping licensed crest art.
3. Muted metadata text ("2m", counts) now uses `color/text/secondary` (navy 70%) instead of navy at 31%; slightly stronger contrast.

### 1.4 Admin archive and Design Notes

- Ten old Contest console frames archived (hidden, `ARCHIVED - ` prefix, moved into the Contest archive strip at y -13200, x 79300-93880): Console hub x6 (`6271:15272`, `6269:14868`, `6266:14767`, `6269:15107`, `6270:15070`, `6270:15346`), Start a Cycle x3 (`6272:15373`, `6273:15474`, `6273:15664`), Cycle History (`6277:16282`). They are superseded by pass C: Create Contest / Edit Contest, Overview (Running, Final (No Winner), No Contest, Load Error), Cycle History (list, Empty, Load Error). A page-wide scan found 0 prototype links, 0 flow starts and 0 components inside them. The strip was checked clash-free before the move.
- The six judging frames were already archived by pass B; their text "Open the Level 1 Final?" (`6276:16202` in `6276:16080`) is now hidden.
- Design Notes `6278:16383`: intro and sections 1-3 rewritten to `docs/contest-spec.md` (Decision Log #381, #399-#402): screen -> source -> fields (all backend sources marked NOT BUILT with their B-IDs), fixed Europe/London calendar phases (week 1-3 lock 20:00:00 days 7/14/21, 08:00:00 openings, Between Weeks 12 h, week 4 upload window and reveal, forfeit / no winner), validation rules. Section 4 is kept and labelled HISTORICAL; its last bullet was updated. Frame grew 1767 -> 1842 px; the tag now reads "UPDATED - Pass F2". Wording comes only from the spec and Decision Log rows.

### 1.5 Targeted fixes

- Desktop 2FA frames (`2926:8294`, `6655:2`, `6655:41`, `6655:85`, `6655:137`, `6655:173`): were 2517 px, now sized to content (rail or content bottom + 96): 477, 762, 622, 646, 611, 544 px. The Settings Shell instance in each was resized to match. The two shell divider lines still report length 2238 (an instance-level resize had no effect); the frame clips them, so nothing shows. Other Settings frames stay at the family's 2517 px on purpose.
- Stray green "Search Soccernity" band: it is the shell's search bar peeking from behind the cards. Hidden (instance override on `Frame 5768`) on Report Detail `5796:8635` and Appeal Review `5796:8753`. Moderation Queue `5794:8635` and every other Admin Shell screen still show the search bar, as the brief asked only for those two.
- `6660:31044` was found `visible = false` after the conversion run, although it was visible in the first audit and the script never sets frame visibility. Cause unconfirmed (F1 was editing the same file). Restored to visible.

### 1.6 Register

Status lines appended (no row removed or reordered): B-080 (withdrawal frames exist since pass D, listed by id), B-087 (authenticator 2FA frame ids and the new heights), B-012, B-015, B-041, B-095.

## 2. Canvas deltas (page 0:1)

Before (baseline saved before any write): 746 top-level nodes, 153,948 nodes in total.
After: 773 top-level nodes, 158,448 nodes in total (+27 top-level, +4,500).

`get_metadata` on the whole page (about 154,000 nodes) is far over what the tool can return, so counts were taken with `findAll` per top-level child instead; this is not the literal depth >= 4 metadata dump the brief asked for.

Attribution (estimate; F1 worked in parallel):
- Mine, top-level: +2 (`6671:27364` Components frame, `6679:26292` note). F1: +25 new top-level frames and notes.
- Mine, nodes: Create Post frames +4,466 (+427 to +465 each: new auto-layout tree plus the hidden legacy layer); Components frame +235; note +4. Sub-total about +4,705.
- Hidden-count drop on the ten archived console frames: about -1,109 (97 per frame, 236 on `6273:15474`). No node was deleted; once a frame is hidden the nodes inside its Admin Shell instance are no longer enumerated (the six judging frames archived earlier show the same behaviour). Not proven node by node.
- -12 on `5796:8635` / `5796:8753` (hidden band subtree in the instance).
- Remainder, about +910, is F1's.
No baseline top-level node is missing: 746 baseline + 27 new = 773.

Nothing deleted anywhere.

## 3. Component adoption candidates (not swapped in)

- Button: primary / secondary buttons on every pass C and F1 admin frame (Create Contest "Create contest" / "Cancel", Reject image dialog, Report Detail actions, "Back to console").
- Pill: Phase 1 / Phase 2 chips on the Create Contest week rows, "Awaiting review", status cells in Cycle History and Users.
- Field: Create / Edit Contest (title, minimum tally, watch limit, placement points), Reject image reason, Revoke username reason, DOB correction. Read-only: date of birth on Create Profile, Register and Account Information (those are Montserrat user-facing frames, so a Montserrat variant would be needed first).
- Callout: the consequence text on Bad faith / Legal hold / Lift hold frames, the "Once actioned..." explainer on Report Detail.
- Banner: "4 required fields need attention" on Create Contest - Validation; every Load Error frame.
- Note: the on-canvas SCOPE OPEN / COPY PENDING notes from passes A-F1.
- Dialog: Reject image, Revoke username, DOB Confirm, F1's Bad faith / Legal hold / Lift hold confirms, Settings - Delete Role.
- Table: Held Investigations, Flagged Images, Cycle History, Moderation Queue, Users.
- The same Page body could rebuild `6661:26929` and the large Community frames (`1306:7149`, `2256:6802`, ...) that still carry the legacy absolute layout.

## 4. Decision Log candidates (none resolved here)

1. No FLOAT variables exist (radius, spacing); components use literal values. Add a spacing/radius collection?
2. Create Post scrim changed from white 71% to `color/overlay/scrim` (visible change) - confirm.
3. Fixtures crests replaced by typographic marks on the Create Post frames - confirm; crest licensing stays open (#85, #97).
4. Gradient scrim on video posts is not variable-bound (gradient, not solid).
5. Admin components are Inter, Community components Montserrat; should one family be chosen for read-only / Field in user-facing frames?
6. `6661:26929` not converted (not a Create Post frame) - include in a follow-up?
7. The shell search bar still shows on Moderation Queue and the other admin screens; hide it in the Admin Shell set itself?
8. Archived legacy layers (about 2,300 hidden nodes inside each of the ten frames) keep the old unbound paints out of sight but still in the file; delete them once the rebuild is approved (needs a decision because deletion is forbidden here).
9. Settings Shell divider lines in the six 2FA frames keep their old length (clipped).
10. Cause of `6660:31044` turning hidden is unknown.
11. Design Notes section 4 is historical, not rewritten.

## 5. Not done

- No component was applied to an existing screen.
- Whole-page `get_metadata` at depth >= 4 (see section 2).
- No new guardian-, minor- or data-processing wording was written, so no new `[COPY PENDING LEGAL REVIEW]` tag was added; the Note component only carries the existing tag text.
