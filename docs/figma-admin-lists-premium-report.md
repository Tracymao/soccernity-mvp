# Admin list pages: aligned to shipped code, then premium restyle (group 1)

Figma only (premium UI pass, step 2c-1). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No application code, schema, legal text or Build Plan docx changed. Founder decisions 2026-11-26: keep existing colours; the shipped code is the truth for these list frames; no code changes; about 50 newer frames not touched.

## Frames
- Users `917:218`, Articles `123:56`, Categories `128:488`, Categories - Add Category `138:93`: redrawn to the shipped pages, then restyled.
- New frame "Admin patterns (premium pass)" `7230:71662` (1440x1512, y 362696): table card, header band, row states (default, hover, pressed), six chips, four button states, delete-confirm row, empty table, load-error row, rules text.
- Admin Shell set `6014:12948`, Moderation Queue `5794:8635`, Articles - Create Post `124:313` and every other frame: not edited.

## Figma versus code, and how each was aligned
- Articles: Cover column and thumbnails removed (the code has none); Status column and Publish/Unpublish button added; per-row kebab removed; dates now `D Mon YYYY`; bold black three-line titles replaced by Web/Body navy, two lines max; truncated "Premier Lea..." fixed; grey stripes removed; Draft/Published tabs added.
- Users: icon-only actions replaced by the code's labelled actions; tabs and the link repositioned (they overlapped and were clipped).
- Categories: icon-only actions replaced by Activate/Deactivate; saturated pills replaced by the two chip styles; stray "Submit Post" button and empty area removed; tabs added.
- Add Category: now a standalone page. It was an overlay over a stale list.
- Page-level action buttons live inside the shell instance, so they were not added as children.

## Restyle applied
Page fill #f4f5fb; title Web/Title navy; white table card radius 12; header band green tint 12% with Web/Caption; 52px rows with a 1px `icon/inactive` hairline; 24px chips, radius full (Positive = green tint, Inactive/Draft = `icon/inactive`); row buttons navy 1px outline, radius 8, height 32. All bound to variables and styles; no new colours.

## Findings
- Create Post `124:313`: none of the four list frames has a prototype reaction pointing at it. Other frames were not checked.
- Hover and pressed states first rendered as solid navy (a bound paint takes its alpha from the variable). Fixed with unbound literal navy at 0.08 and 0.15 (Decision Log #199 precedent). That is an intentional exception: 3 unbound fills in the patterns frame, plus the shell's inherited `Rectangle 223`.
- Chip "navy 8%" uses the bound `icon/inactive` (15%).
- Secondary text on green tint is 4.54:1, close to the 4.5:1 limit.

## Not verified
- The overlay fix was checked by fill readback only; no screenshot afterwards (screenshot budget of 10 was used up).
- In earlier screenshots the page area looked white rather than #f4f5fb; not investigated.
- The last Categories row hairline may extend slightly past the card.
- Original-id hash not recomputed against a stored baseline; Moderation Queue and shell geometry were read, not compared to a stored baseline.
- Structure check against the before-snapshot was only partly done.

## Amendment 2026-11-26: layout follows code (x300, 1100 wide)
Founder rule: shipped code is the truth for layout too. In code `.us-page`/`.ac-page` is a flex column, gap 20px, max-width 1100px inside the content area (starts x300). Order in code: title row, search row, note/action row (tabs left, Create/Add right), table.

### Old and new positions (frame coordinates; also in `docs/figma-admin-lists-positions.json`)
| Frame | Item | Old | New |
|---|---|---|---|
| Users 917:218 | title | x428 y135 | x300 y129 |
| | tabs | y about 236 | x300 y250 (342, 406) |
| | link "Incorrect-details reports" | overlapped/clipped | x1250 y252, right edge 1400 |
| | table card | x428 w912 y236 | x300 w1100 y294 |
| Articles 123:56 | title / tabs / table | x428 w912 y236 | x300 y129 / y250 / x300 w1100 y294 |
| Categories 128:488 | title / tabs / table | x428 w912 | x300 y129 / y250 / x300 w1100 y294 |
| Add Category 138:93 | title / back link / card | x428 w912 | x300 y129 / x300 y250 / x300 w1100 y294 |

Row cells and header texts were scaled from 912 to 1100 wide (x offsets under 30 kept, row buttons shifted +188, other columns scaled). Row heights, chips, fills and styles unchanged.

### What was redone
The earlier restyle was done at the old x428/912 positions. Positions were changed afterwards on the same frames; nothing else was redone. The Admin Shell instances were not touched.

### Verification (read-only call)
- Every visible non-shell child of all four frames sits within x300 to x1400, including nested children of the table cards and the Add Category card: 0 violations.
- None overlaps the shell search bar area (x279 to 1300, y186 to 230): tabs start y250, tables y294.
- Shell instances unchanged (one per frame, 1440x1184 at 0,0).
- Standing check: top-level nodes 2,004; id hash 4245587728 (recomputed this session, no stored baseline to compare).

### Shell versus code (not changed, for the separate shell PR)
- Search bar: code renders it in page content under the title, from x300; the shell instance draws it at x279, 740 wide, y186 to 230.
- Create/Add: code renders it in the page action row beside the tabs (y about 250, right edge x1400); the shell draws a Create button at x1177 y45 on the Log Out row.
- Users: code also has a disabled "Add Member" stub next to the link and a note line; neither is drawn.
- Add Category: code has the "Back to Categories" link above the header; Figma now has it at x300 y250.
- Loading ("Loading users…") and empty cards ("No users", "Create the first one…", "Add the first one…") exist in code; only the patterns frame draws an empty table.

### Not verified
- No screenshot after the position change (not taken this session).
- Code-spec comparison read from source only.
