# sprint-2/create-post-sports-contest-mobile-admin-notif-fix — report

Founder-authorised audit-AND-build Figma pass. Routing override in effect (design-system agent built
wholly-new screens itself this pass). Figma file `weZWWqggy9j13eX8bhFgs6`, page **Soccernity** `0:1`.
No app/backend code touched.

All colour values traceable to the two brand hexes / existing `Soccernity Theme` tokens
(`VariableCollectionId:5096:2`, Light mode). Confirmed live: 13 COLOR variables
(the 12 from CLAUDE.md + `semantic/alert`). **0 `brand/green-tint-28` introduced anywhere.**
**0 new colours.**

Token literals resolved and passed before binding (per the known `setBoundVariableForPaint` gotcha):
`brand/navy` #282E65, `brand/green` #7BB929, `color/text/on-navy` #FFFFFF,
`brand/off-white` #F4F5FB, `semantic/alert` #FA0606.

---

## ITEM 1 — CREATE POST MOBILE — BUILT

Base `5701:8328` "Community — Create Post — Mobile" was **extended, not restarted**.

### Sub-finding: the two "feeds with pinned…" desktop frames
`2496:4462` (pinned **contest** post) and `2565:3951` (pinned **normal** post) were compared directly.
**The composer is byte-identical between them** — same inline composer (avatar + "What's happening?" +
icon row + Post button). They differ **only** in the badge on the first feed post:
navy "Contest post" pill vs. navy lowercase "post" pill.
**Therefore one mobile frame covers both** — built as a single "Feed Context (Pinned Post)" frame with
the "Contest post" badge; the normal-pin variant is the identical frame with the badge text set to "post".
Two near-identical composer frames were deliberately **not** built.

### Sub-finding: contest count number
`2009:2913` "Create a post - For Contest" shows a count badge reading **"1"** on the active "Contest" tab.
That exact value ("1") is used on the mobile Contest-mode frame — no number invented.
Badge visual language reused from the Notification Centre **"Unread Count Badge"** (`5640:7915`):
navy pill, `color/text/on-navy` numeral, Inter Semi Bold. No new badge pattern introduced.

### Frames

| State | Node ID | Mirrors desktop | Notes |
|---|---|---|---|
| Plain composer (MODIFIED) | `5701:8328` | `2008:655` | Added **"Mode Tabs"** row `5818:8956` ("Create a Post" active / "Contest") below the app bar so the set is coherent with the Contest state and with desktop (which shows tabs on every composer state). |
| With Attachment | `5818:8962` | `2009:5168` | Attached-media row: one 96×96 `brand/green-tint` thumbnail (image glyph) + a dashed `color/icon/inactive` "+" add-more box. "Attach" row relabelled "Add to your post". |
| Contest Mode | `5818:8997` | `2009:2913` | Mode Tabs with **Contest active** (green underline) + **count badge "1"**; "Create a Post" de-emphasised. Attach affordance swapped to "Upload file" + video glyph. Placeholder → "Add a caption for your contest entry…". |
| Feed Context (Pinned Post) | `5818:9031` | `2496:4462` **and** `2565:3951` | Cloned from the real `5701:8239` "Community — Home Feed — Mobile" (reuses its real inline composer + post cards). First post gets a navy "Contest post" pin pill (top-right); its 3-dot "More" affordance hidden on the pinned card to clear the badge. |

Location: Community-mobile row, `x` 12031 / 12531 / 13031, `y` 23522 (clear space past
"Community — Inactive Account — Mobile"; an earlier placement collided with Profile/Edit-Profile
mobile frames and was moved).

**Paint-binding audit: 0 unbound paints** on all four frames (excludes the shared `header 4 — mobile`
navbar instance's own avatar `[IMAGE]` fill — pre-existing component debt).

---

## ITEM 2 — SPORTS / LIVESCORES MATCH-CENTRE MOBILE — BUILT WITH DUMMY DATA

Founder override of Decision Log #6 (sports-data vendor, still Open, still blocks Sprint 4):
8 mobile match-centre screens built now with **dummy match data copied from the desktop frames**.
No endpoint wired, no vendor-specific data shape invented.

Dummy match (verbatim from desktop): **Liverpool 1 – 3 Chelsea**, 20-09-2022 20:00, FULL TIME.
Referee Herera D. (Arg). Venue Old Trafford Stadium (England).
**Typographic club marks only** ("L", "C" discs) — no licensed crests, per Decision Log #85. The
real-crest licensing question is untouched (legal/business, not a design-token problem).

Font: **Inter** (matches the existing Sports/Livescores mobile section `5647:8169`, not the
Montserrat used by Community).

### Shared component
`5819:8976` **"Match Centre Header — Mobile"** — COMPONENT (teams + score card), instanced in all 8
frames. Parked at `x` 15000 `y` -30000.

### Frames (all 390px wide, `x` 14235, stacked below the existing Sports mobile frames)

| # | Screen | Node ID | Mirrors | Content |
|---|---|---|---|---|
| 1 | Match Details | `5820:8976` | `632:943` | Primary tabs (Match) + sub-tabs (Match Summary) + FIRST HALF 1-1 / SECOND HALF 1-1 event rows + MATCH INFORMATION (Referee, Venue). |
| 2 | Match Statistics | `5822:9075` | `640:3737` | Sub-tab Statistics, half-selector **MATCH**. 18 stat bar-rows (Possession 44/56 … Dangerous Attacks 46/24) — home bar `brand/green`, away bar `brand/navy`. |
| 3 | First Half Statistics | `5823:9108` | `667:151` | Same 18 rows, half-selector **FIRST HALF**, values scaled ≈0.52 (possession 46/54). The legacy desktop half-split frames carry no distinct data; plausible splits used and flagged. |
| 4 | Second Half Statistics | `5823:9317` | `667:1511` | Half-selector **SECOND HALF**, remaining split (possession 42/58). |
| 5 | Lineups | `5825:9207` | `667:1952` | Sub-tab Lineups + simplified pitch (green Liverpool / navy Chelsea dots in 4-3-3, centre line/circle) + formations + STARTING XI / SUBSTITUTES / COACH lists for both teams. |
| 6 | H2H | `5824:9174` | `756:11` | Primary tab H2H + LAST MATCHES · LIVERPOOL / LAST MATCHES · CHELSEA / HEAD TO HEAD (5 rows each) with W/D/L result badges. |
| 7 | Standing | `5821:9068` | `756:6433` | Primary tab Standings + table (# / Team / MP / W / D / L / PTS), 14 rows, position badges (green top-4, navy mid, `semantic/alert` relegation) + legend. Desktop "FORM" last-5 column omitted at mobile width (flagged). |
| 8 | Video | `5821:9009` | `760:11533` | Primary tab Video + MATCH HIGHLIGHTS band + 16:9 `brand/green-tint` video placeholder with a `semantic/alert` play button + caption. |

**Result-badge / table colour mapping** (H2H #6, Standing #7): W / promotion = `brand/green`,
Draw / mid-table = `brand/navy`, Loss / relegation = `semantic/alert`.
Desktop uses **yellow** for draws and mid-table — deliberately **not** reproduced (off-palette).
Flagged (new DL candidate).

**Paint-binding audit: 0 unbound paints** on all 8 frames + the header component (excludes the shared
navbar instance internals). No frame overlaps (verified against every frame on `0:1`).

---

## ITEM 3 — CONTEST MOBILE (Decision Log #140) — BUILT

Closes Decision Log #140, which had deferred these two. Both 390px, matching the 3 built Contest
mobile screens (`5801:8635`, `5802:8655`, `5802:8726`), Inter, all tokens bound.

| Screen | Node ID | Mirrors desktop | Built from | Changes |
|---|---|---|---|---|
| Contest — Already Voted — Mobile | `5815:8916` | `5802:8978` | clone of `5802:8726` (Voting mobile) | "Vote" button → **"Voted"** + thumb-up glyph (navy pill). Added green-tint **"Banner — Already Voted"**: "You've already voted this week. Come back Monday for the next challenge." Kept "Last Week on Contest" panel. |
| Contest — Between Weeks — Mobile | `5815:8948` | `5802:9183` | clone of `5801:8635` (Details mobile) | "Task for this week" → **"Between weeks"** + body ("Voting for this week's challenge has closed…"). Button relabelled **"View this week's results ›"**. Kept "How Contest works" + monthly-mechanic copy + "View leaderboard ›". |

Location: `x` 27044 / 27544, `y` 9700 (below the existing Contest mobile row). No overlaps.
**Paint-binding audit: 0 unbound paints.**

---

## ITEM 4 — ADMIN PANEL SIDEBAR — FIXED (both bugs)

**Hard constraint honoured:** no colour/token/palette change, no rebinding, no retouching anywhere in
Admin Panel. Only label text, layer names, icon-node structure, and nav-item insertion were touched.

### Admin Panel screen coverage

| | Count |
|---|---|
| Admin Panel screens on page `0:1` with an Admin Shell sidebar (nav list `Frame 5744`) | **29** |
| — already had a "Moderation" nav item (the 3 new Moderation screens) → **Bug A** applied | 3 |
| — had no "Moderation" nav item → **Bug B** applied (row inserted at nav index 3) | 26 |
| **Screens now carrying a correct "Moderation" nav item** | **29 / 29** |

The 26 Bug-B screens: `2363:2244`, `2363:3446` (2 legacy Contest-tab frames), `110:5`, `123:56`,
`124:313`, `128:488`, `1658:2303`, `1658:2456`, `1658:2592`, `917:218`, `361:553`, `916:2362`,
`917:24`, `396:442`, `138:93`, `5403:6640`, `5403:6753`, `5403:6866`, `5403:6979`, `5403:7092`,
`5403:7205`, `5403:7327`, `5405:8277`, `5405:8390`, `5566:8033`, `5569:7813`.
(Same class of propagation PR #110 did for "Nav — Competitions"; #110 estimated 15, actual there was 24,
here it is 26 — the file has more Admin screens than earlier passes assumed.)

### Bug A — broken Moderation nav item (`5794:8635`, `5796:8635`, `5796:8753`)

Findings on inspection:
- The **label text already renders "Moderation"** on all 3 (`characters` = "Moderation"); only the
  **layer name** was stale ("Categories"). Renamed the layer to "Moderation"
  (`5794:8707`, `5796:8707`, `5796:8825`).
- The icon was **triple-nested**: `Frame — Moderation` › `u:apps` (frame) › `el:ban-circle` (frame) ›
  `Vector`. Flattened to match the sibling pattern (`Nav — Competitions` = frame › Vector):
  the `Vector` was reparented directly into the outer icon frame, the intermediate `el:ban-circle`
  frame deleted, and the outer frame renamed `u:apps` → **`el:ban-circle`**
  (`5794:8705`, `5796:8705`, `5796:8823`).
- **Not fixed (flagged):** the ban-circle icon `Vector` is bound to `color/text/primary` (navy). On
  these 3 screens the Moderation row is the **active** row (navy background), so the icon renders
  invisible. Every sibling active-row icon (e.g. the Contest active row, `5403:6697`) binds to
  `color/text/on-navy` (white). Rebinding is a one-line change to an **existing** token (not a palette
  change) but the hard constraint forbids any rebinding in Admin Panel — left for the finalising
  session / founder. New DL candidate.

### Bug B — Moderation nav item missing everywhere else

A master **inactive** "Nav — Moderation" row was built once (cloned from an inactive `Nav — Competitions`
row: surface fill, `color/text/primary` icon+label, Montserrat Medium 20, `el:ban-circle` icon cloned
from the fixed Bug-A icon), then inserted at **nav index 3** (between "Users" and "Categories" —
matching the order on the 3 Moderation screens) into all 26 nav lists. Master deleted afterward.
Nav order on every Admin screen is now:
Dashboard · Articles · Users · **Moderation** · Categories · Contest · Competitions · Media · (Settings pinned).

New row node IDs: `5814:8922`, `5814:8926`, `5814:8930`, `5814:8934`, `5814:8938`, `5814:8942`,
`5814:8946`, `5814:8950`, `5814:8954`, `5814:8958`, `5814:8962`, `5814:8966`, `5814:8970`, `5814:8974`,
`5814:8978`, `5814:8982`, `5814:8986`, `5814:8990`, `5814:8994`, `5814:8998`, `5814:9002`, `5814:9006`,
`5814:9010`, `5814:9014`, `5814:9018`, `5814:9022`.

No sidebar clipping introduced: verified on a 1024-tall frame (Dashboard) and the shortest 655px
`SPACE_BETWEEN` sidebar (Moderation Queue) — Settings still pins to the bottom, no overflow. The
legacy Contest-tab frames (`2363:*`, own shell, not clones) took the insert cleanly.

### Also flagged (pre-existing, not caused by this pass, out of scope per the constraint)
`fi:A_users` — the "Users" nav icon — has 4 `Vector` children with **empty fills**, so it renders
nothing on every Admin Panel screen (~29). Belongs with the Admin content-area retrofit debt (DL #52).

---

## ITEM 5 — NOTIFICATION CENTRE ICON — FIXED

Removed the orphaned floating "Nav Entry Point — Notifications (bell + unread badge)" overlays from
**all 4** Notification Centre frames (checked the empty-state frames too, per brief):

| Frame | Removed nodes |
|---|---|
| `5640:7815` Feed — Desktop | `5640:7962` (bell), `5640:7964` (Unread Badge) |
| `5643:8003` Feed — Mobile | `5643:8084` (bell), `5643:8087` (Unread Badge) |
| `5642:7898` Empty State — Desktop | `5642:7994` (bell, no badge) |
| `5642:7997` Empty State — Mobile | `5642:8028` (bell, no badge) |

**Underlying navbar verified before removal** (not assumed): the `header 4 — logged in` (desktop) and
`header 4 — mobile` instances on these frames already carry the correct avatar-notification treatment
from PR #113/#114 — logo · search · messages glyph · **avatar** (the avatar is the notification
indicator; there is no bell). Screenshotted both after removal: correct, no blank navbar.

---

## PAINT-BINDING AUDIT SUMMARY (frames built/modified this pass)

| Frame | Unbound paints |
|---|---|
| All 4 Create Post mobile (`5701:8328`, `5818:8962/8997/9031`) | 0 |
| `Match Centre Header — Mobile` `5819:8976` | 0 |
| All 8 Sports mobile (`5820:8976`, `5822:9075`, `5823:9108`, `5823:9317`, `5825:9207`, `5824:9174`, `5821:9068`, `5821:9009`) | 0 |
| Both Contest mobile (`5815:8916`, `5815:8948`) | 0 |

Excludes the shared `header 4 — mobile` navbar instance's own avatar `[IMAGE]` fill (pre-existing
component debt, not editable from an instance — same as every prior mobile PR).
Item 4 rows and Item 5 removals introduced no paints.

---

## FOR FINALISING SESSION

### (a) Proposed new Decision Log rows (continuing from #144)

| # | Decision needed | Raised in | Status |
|---|---|---|---|
| 145 | Sports/Livescores match-centre mobile (8 screens) built with dummy match data (Liverpool 1–3 Chelsea, verbatim from the desktop frames) ahead of a sports-data vendor. Confirm the design work is unblocked while real vendor wiring stays blocked on Decision Log #6 — `figma-to-code` must not wire any Sports match-centre screen to data until #6 resolves. | `sprint-2/create-post-sports-contest-mobile-admin-notif-fix` | Open — design unblocked (founder-authorised); data wiring blocked on #6 |
| 146 | Moderation nav item — active-row icon colour. On the 3 Moderation screens the active (navy) Moderation row's `el:ban-circle` icon vector is bound to `color/text/primary` (navy) and renders invisible; every sibling active-row icon binds to `color/text/on-navy` (white). Not fixed this pass — the Item 4 hard constraint forbids any rebinding in Admin Panel. Proposed: rebind those 3 vectors (`5794:8709`, `5796:8709`, `5796:8827`) to `color/text/on-navy` — an existing token already used by every other active-row icon, not a palette change. | `sprint-2/create-post-sports-contest-mobile-admin-notif-fix` | Open — needs founder sign-off (one-line rebind, trivially reversible) |
| 147 | `fi:A_users` "Users" nav icon renders nothing (4 `Vector` children with empty fills) on all ~29 Admin Panel screens. Pre-existing, not caused by this pass; left untouched per the Admin colour/token constraint. Fold into the Admin content-area retrofit (Decision Log #52). | `sprint-2/create-post-sports-contest-mobile-admin-notif-fix` | Open — deferred to the DL #52 Admin retrofit family |
| 148 | Create Post mobile — base `5701:8328` gained a "Create a Post / Contest" mode-tab row (extension for parity with the desktop composer states and with the new Contest-mode mobile frame). Confirm the tab row belongs on the plain composer, or should appear only once Contest mode is entered. | `sprint-2/create-post-sports-contest-mobile-admin-notif-fix` | Open — minor; conservative choice (tab row present, "Create a Post" active) made meanwhile |
| 149 | H2H / Standing mobile use a palette-compliant result/position colour scheme (W·promotion = `brand/green`, Draw·mid-table = `brand/navy`, Loss·relegation = `semantic/alert`). The desktop screens use yellow/amber for draws and mid-table — deliberately not reproduced (off-palette, no token). Confirm the navy-for-draw substitution. | `sprint-2/create-post-sports-contest-mobile-admin-notif-fix` | Open — palette-compliant deviation from desktop, flagged not silently applied |

### (b) Forward-pointer to append to Decision Log #140's Status cell

> RESOLVED by `sprint-2/create-post-sports-contest-mobile-admin-notif-fix` — mobile equivalents built:
> Contest — Already Voted — Mobile (`5815:8916`) and Contest — Between Weeks — Mobile (`5815:8948`),
> 390px, matching the three existing Contest mobile screens.

### (c) Draft CLAUDE.md "Where things stand right now" bullet

- **`sprint-2/create-post-sports-contest-mobile-admin-notif-fix` is a founder-authorised
  audit-AND-build Figma pass (routing override: the design-system agent built the wholly-new
  screens itself this pass) covering five items** — Figma design only, no app/backend code. Full
  detail: `docs/sprint-2-create-post-sports-contest-mobile-admin-notif-fix-report.md`.
  - **Create Post mobile parity (Item 1)** — base `5701:8328` extended with a "Create a Post /
    Contest" mode-tab row; three new 390px frames: **With Attachment** (`5818:8962`),
    **Contest Mode** (`5818:8997`, count badge "1" verbatim from desktop `2009:2913`, reusing the
    Notification Centre "Unread Count Badge" pattern), **Feed Context (Pinned Post)** (`5818:9031`,
    cloned from the real Home Feed mobile). **Sub-finding:** desktop `2496:4462` and `2565:3951`
    have identical composers — differ only in the feed pin badge ("Contest post" vs "post") — so one
    mobile frame covers both, not two.
  - **Sports/Livescores match-centre mobile (Item 2, Decision Log #145)** — 8 new 390px frames
    (Match Details, Match/First-Half/Second-Half Statistics, Lineups, H2H, Standing, Video) built
    with **dummy match data copied verbatim from the desktop frames** (Liverpool 1–3 Chelsea) ahead
    of the still-open Decision Log #6 sports-data vendor blocker — same convention as the
    Contest/Leaderboard boards. New `Match Centre Header — Mobile` component (`5819:8976`).
    Typographic club marks only (Decision Log #85); real-crest licensing untouched. `figma-to-code`
    must not wire these to data until #6 resolves.
  - **Contest mobile (Item 3)** — **closes Decision Log #140**: Contest — Already Voted — Mobile
    (`5815:8916`) and Contest — Between Weeks — Mobile (`5815:8948`).
  - **Admin Panel sidebar (Item 4)** — Bug A: fixed the broken Moderation nav item on the 3
    Moderation screens (`5794:8635`, `5796:8635`, `5796:8753`) — flattened the triple-nested icon to a
    single `el:ban-circle`, corrected the stale "Categories" layer name (render was already
    "Moderation"). Bug B: propagated a correct inactive "Nav — Moderation" row (nav index 3, between
    Users and Categories) to the **26** other Admin Panel screens — **29/29** now carry it. Hard
    constraint honoured: no Admin Panel colour/token/rebind changes. Flagged (Decision Log #146):
    the active-row Moderation icon is invisible (navy-on-navy) on the 3 Moderation screens because it
    binds `color/text/primary` where every sibling active-row icon binds `color/text/on-navy` — a
    one-line rebind left for founder sign-off. Also flagged (Decision Log #147): the `fi:A_users`
    "Users" nav icon renders nothing file-wide (empty fills) — pre-existing, DL #52 family.
  - **Notification Centre icon (Item 5)** — removed the orphaned floating bell + unread-badge overlay
    frames from all 4 Notification Centre frames (`5640:7815`, `5643:8003`, `5642:7898`, `5642:7997`).
    Verified the underlying `header 4` / `header 4 — mobile` navbar instances already show the correct
    avatar-notification treatment (PR #113/#114) — no blank navbar left behind.
  - 0 unbound paints on every frame built fresh (excludes the shared navbar instance's avatar
    `[IMAGE]` fill). 0 `brand/green-tint-28`, 0 new colours, 0 frame overlaps. New Decision Log
    candidates **#145–#149**; forward-pointer appended to #140.
  - Not merged — pending review. Branch `sprint-2/create-post-sports-contest-mobile-admin-notif-fix`.
