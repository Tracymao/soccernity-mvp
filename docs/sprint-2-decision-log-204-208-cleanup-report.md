# Decision Log #204–#208 Cleanup — Report

**Branch:** `sprint-2/decision-log-204-208-cleanup`
**Agent:** figma-design-system
**Date:** 2026-09-05
**File:** Soccernity-MVP (`weZWWqggy9j13eX8bhFgs6`), page `0:1`

Scoped edit pass on existing frames — no new screens, per the project's standing
figma-design-system/figma-screen-builder routing rule. Closes Decision Log #204, #205,
#207, #208; investigates #206 (found already resolved); folds #199/#201 into a new
standing Figma-authoring gotchas section.

---

## #204 — missing "Soccernity." footer wordmark pill

**Brief's node IDs for Articles Page were stale.** `54:434` (Articles Page Desktop) and
`87:80` (Articles Page mobile) are now the **archived, hidden** originals — superseded by
`sprint-2/articles-page-split-and-navbar`, which split them into `Blog — Article Detail
Desktop/Mobile — Logged In/Out`. Checked live rather than trusting the brief:

| Node | Frame | Live/visible? | Pill present? |
|---|---|---|---|
| `54:434` | ARCHIVED — Articles Page Desktop | No (hidden) | Yes (`85:63`) — left alone |
| `87:80` | ARCHIVED — Articles Page mobile | No (hidden) | No pill at all |
| `5997:10905` | Blog — Article Detail Desktop — Logged In | **Yes** | Yes (`5997:10984`) — **fixed** |
| `5997:11224` | Blog — Article Detail Desktop — Logged Out | **Yes** | Yes (`5997:11303`) — **fixed** |
| `6000:11346` / `6000:11377` | — Mobile — Logged In/Out | Yes | No pill (mobile footer already had the real wordmark) |

**Fix applied identically to #174's own recipe**, verified against the reference node
(`5987:10905` on `Blog Page Desktop — Logged In`): Montserrat ExtraBold 30px, fill bound
to `color/text/on-navy` (`VariableID:5182:6654`), centered on the former pill's bounds.

**8 live pills fixed:**

| Rect (deleted) | Frame | New text node |
|---|---|---|
| `6113:14086` | Contact Us Desktop — Logged In | `6131:15683` |
| `6113:14232` | Contact Us Desktop — Logged Out | `6131:15684` |
| `6114:14237` | Terms of Service Desktop — Logged In | `6131:15685` |
| `6114:14367` | Terms of Service Desktop — Logged Out | `6131:15686` |
| `6114:14486` | Privacy Policy Desktop — Logged In | `6131:15687` |
| `6114:14616` | Privacy Policy Desktop — Logged Out | `6131:15688` |
| `5997:10984` | Blog — Article Detail Desktop — Logged In | `6131:15689` |
| `5997:11303` | Blog — Article Detail Desktop — Logged Out | `6131:15690` |

**Paint audit (file-wide, page `0:1`):** searched all `RECTANGLE` nodes for 294×67
`#D9D9D9` solids. **0 remaining live/visible instances.** 5 remain, all confirmed to sit
inside already-archived (hidden) top-level frames — deliberately left untouched, matching
this project's established precedent for archived content (historical record, not
maintained):

- `1009:603` — ARCHIVED Blog Page Desktop (Decision Log #174 already flagged this one)
- `85:63` — ARCHIVED Articles Page Desktop
- `87:214` — ARCHIVED Contact Us Desktop
- `102:374` — ARCHIVED Terms of Service Desktop
- `104:460` — ARCHIVED Privacy Policy Desktop

Verified with a footer screenshot on Privacy Policy Desktop — Logged In: clean
"Soccernity." wordmark, centered, correct weight/color.

---

## #205 — rebuild the Contact Dropdown as a real connected open-state

**Investigated the orphan first.** `87:250` ("Contact Dropdown", 415×330 group, 10
children: background rect + 5 option texts + 4 divider lines) sat detached at
`(-18125, -31360)` — nowhere near any of its 6 archived-or-live host frames. Its own
415px width was sized for a select field that no longer exists at that width; the live
Contact Us frames' real "Choose a category" field is **1030px** (desktop) / **318px**
(mobile).

**Rebuilt as two new standalone components, not 4 duplicates** — one shared per
breakpoint, since both Logged In/Out variants of a given breakpoint have identical Form
geometry (confirmed directly):

- **`Contact Category Dropdown — Desktop`** (`6130:14653`) — 1030×330, corner radius 12
  (matching the real field's own radius, not the orphan's original 15), row height 66px
  (preserved from the orphan's own internal rhythm), font Montserrat Medium 24px (already
  matched the desktop field's own "Choose a category" label size — confirmed, not
  assumed), text fill `color/text/secondary` @ 70% opacity, divider lines
  `color/icon/inactive` @ 15% opacity — all cloned from the orphan's exact existing paint
  objects, not rebuilt via `setBoundVariableForPaint` (sidesteps that gotcha entirely).
- **`Contact Category Dropdown — Mobile`** (`6130:14664`) — 318×165, corner radius 6,
  row height 33px, font 12px — a disclosed, deliberate 2:1 scale-down from the desktop
  version, matching the mobile field's own "Select Category" label size (12px, confirmed
  directly) and this file's own established 2x mobile:desktop scale convention (the
  wordmark 15px→30px precedent from Decision Log #174).

**5 options preserved verbatim, no new copy**: Technical issues, Editorial Complaints,
Data / Livescores Issues, Suggestions, Enquiries/Feedback. Both components
screenshot-verified clean before wiring.

**Wiring**: `ON_CLICK` → `OPEN_OVERLAY` via `setReactionsAsync` on all 4 chevron triggers:

| Trigger | Frame | Destination |
|---|---|---|
| `6113:14082` | Contact Us Desktop — Logged In | `6130:14653` |
| `6113:14228` | Contact Us Desktop — Logged Out | `6130:14653` |
| `6115:14577` | Contact Us Mobile — Logged In | `6130:14664` |
| `6115:14650` | Contact Us Mobile — Logged Out | `6130:14664` |

Confirmed persisted via a fresh read after wiring (all 4 reactions round-tripped
correctly).

**Disclosed plugin-API limitation, not silently worked around.** The intended UX is the
dropdown appearing directly below the field (computed relative offsets: desktop
`{x:-972, y:51}`, mobile `{x:-293, y:30}`, both measured from each chevron's own
top-left to the field's own top-left). Attempting to wire this with
`overlayRelativePosition` set failed:

```
Error: Actions only support overlayRelativePosition when navigation is "OVERLAY"
and the destination is a frame with overlayPosition equal to "MANUAL"
```

Attempting to set `overlayPositionType = 'MANUAL'` directly on either component then
failed with:

```
node.overlayPositionType: read-only property on COMPONENT node
```

This confirms `overlayPositionType` is genuinely read-only via the plugin API — the same
class of limitation Decision Log #103 already found for `overlayBackgroundInteraction`
("a one-checkbox job in the Figma desktop UI"). **The reaction is real and wired** (the
dropdown opens on click), but without `overlayRelativePosition` taking effect, it opens
at its default `CENTER` position rather than anchored under the field. **New Decision Log
candidate**: someone with Figma desktop UI access needs to open each dropdown component's
Prototype tab and set "Overlay position type" → Manual by hand; the relative-offset
numbers above are already computed and ready to apply once that one checkbox is flipped.

**Orphan deletion**: reference-checked first — scanned all ~110k nodes on page `0:1` for
any `INSTANCE` of the orphan's components or any `reaction` targeting it. **0 references
found.** Deleted `87:250` (not archived — it was never a real, reachable screen, so there
is no "historical record" value in keeping it, unlike an archived-but-once-shipped page).

---

## #206 — section banner over the Legal pages row

**Investigated before building anything — found the brief's premise was wrong.** The task
described "no section banner exists over this row." Direct verification found:

- **`Rectangle 194`** (`1869:2735`) — visible, `x:-21024, y:-32681, width:17280,
  height:1025` — already spans the live Legal Pages row (`-19926` to `-5946`) with margin
  on both sides.
- Bound to `VariableID:5096:10` = **`color/text/on-green`** (which resolves to navy RGB
  in Light mode — the same variable Blog's own banner rectangle uses, confirmed by
  cross-checking `5942:12065`'s binding).
- Paired with the pre-existing text label **`"Company pages"`** (`1870:2736`), sitting
  directly within the rectangle's band (`x:-15830, y:-32638`), confirmed via screenshot to
  render as a proper white title on the navy strip.

This is architecturally identical to the Blog/Articles pattern (separate Rectangle +
separate Text, not a merged "Section Banner —" named node) — it just already existed.
**No duplicate banner was built.** #206 closes as "investigated, found already resolved,"
not as new work — the original finding that prompted this Decision Log entry was based on
a stale read of the file, not on the frames' current live state.

---

## #207 — stale "Copyright © 2022" text, file-wide sweep

Searched every `TEXT` node on page `0:1` for `characters` containing both "2022" and the
word "copyright" (case-insensitive). **32 total matches.**

**22 live, visible instances updated to 2026**, via the canonical
load-styled-segment-fonts → `await` → mutate `characters` → return-IDs recipe (only the
`.replace("2022", "2026")` substring changed; entity name and rights-reserved language
untouched):

- Sports Page (not logged in `205:47`, logged in `1009:686`)
- Blog Page Desktop Logged In/Out (`5953:11239`, `5953:11832`)
- Blog Page Mobile Logged In/Out (`5956:11298`, `5956:11669`)
- Blog — Article Detail Desktop Logged In/Out (`5997:10995`, `5997:11314`)
- Blog — Article Detail Mobile Logged In/Out (`6000:11145`, `6000:11446`)
- All 12 Legal page frames (`6113:14097`, `6113:14243`, `6114:14248`, `6114:14378`,
  `6114:14497`, `6114:14627`, `6115:14600`, `6115:14673`, `6116:14615`, `6116:14673`,
  `6116:14722`, `6116:14780`)

**10 instances deliberately left untouched** — all sit inside already-archived, hidden
top-level frames (ARCHIVED Blog Page Desktop/Mobile, Articles Page Desktop/mobile, Contact
Us Desktop/Mobile, Terms of Service Desktop/mobile, Privacy Policy Desktop/mobile). Same
archived-content precedent as #204 — a disclosed judgment call (the task's own instruction
didn't explicitly exempt archived frames, but every other precedent in this project treats
archived content as preserved historical record, not maintained).

**Safety sweep**: a broader search for any remaining "2022" substring (not gated on the
word "copyright") confirmed every other hit is unrelated sample/placeholder date content —
article publish dates (`08/08/2022`, `25/10/2022`), match dates (`20 - 09 - 2022`), Admin
dashboard/media placeholder timestamps (`25/02/2022`, `September 11, 2022`). None of these
are in scope for a "Copyright © 2022" year correction and none were touched.

---

## #208 — footer link wiring

**Re-verified the scope live rather than trusting the brief's carried-over count.** The
task cited "203 occurrences" from Decision Log #202's older scan. A fresh scan for exact
text matches on `"Terms of Service"`, `"Privacy Policy"`, `"Contact Us"` found **263
occurrences across 71 distinct top-level host frames** — the file has grown since #202's
scan (the new Legal, Blog, and Article Detail frames alone account for much of the
difference).

**Classification** (per host frame, not per link):

| Category | Frame count | Link count | Treatment |
|---|---|---|---|
| Archived (hidden) frames | 10 | 46 | Skipped — left untouched, matching precedent |
| Live, classified frames | 61 | 217 | Wired (189) or correctly left unwired (28, see below) |

**Breakpoint** was determined by each host frame's own width (`≥900` → desktop target
set, `<900` → mobile target set) — not by name, since several Community/Bants frames
don't say "mobile" or "desktop" in their names but do have a real width.

**Auth state** was determined per frame, in three confidence tiers:

- **High confidence, explicit name**: "Sports Page — when user is not logged in/logged
  in", every `— Logged In`/`— Logged Out` suffixed frame (Blog, Article Detail, all 12
  Legal frames themselves), Leaderboard/Contest/Competition family (backed by an explicit
  Decision Log entry, not just the name).
- **Medium confidence, domain/Decision-Log-grounded, not from an explicit label**:
  - Leaderboard, Contest, and Competition tab frames → **Logged In**, per **Decision Log
    #129** ("the Leaderboard requires login... visible to any logged-in user, not exposed
    to logged-out visitors").
  - The two canonical Home Page frames (`5204:6728` desktop, `5543:7407` mobile) →
    **Logged Out**, per **Decision Log #46/#152** ("'/' is exclusively the logged-out
    marketing page").
  - Community and Bants family screens (Post comment view, Search/Trending, User's post
    feed, User's Media feed, View post's page, User's Saved Posts, Edit Profile, all
    Bants homepage variants) → **Logged In**, per the site-wide login-gating **Decision
    Log #152** establishes and the shipped `CommunityPage.tsx`'s own no-session behavior
    (`"Log in to see your feed"`, zero API calls).
- No frame was left in a genuinely unresolved/ambiguous state — every one of the 61 live
  frames got a classification, disclosed above with its confidence tier so a reviewer can
  spot-check the medium-confidence ones specifically.

**Destinations**:

| Breakpoint × auth | Terms of Service | Privacy Policy | Contact Us |
|---|---|---|---|
| Desktop, Logged In | `6114:14222` | `6114:14471` | `6113:14053` |
| Desktop, Logged Out | `6114:14352` | `6114:14601` | `6113:14199` |
| Mobile, Logged In | `6116:14627` | `6116:14734` | `6115:14611` |
| Mobile, Logged Out | `6116:14685` | `6116:14792` | `6115:14684` |

**Wiring**: `ON_CLICK` → `NAVIGATE` via `setReactionsAsync`, matching this file's own
existing pattern (verified against the Notification-row → Notification-Centre reaction,
`2841:5368`) — a full page navigation, not `OPEN_OVERLAY` (which is for dropdowns/modals).

**189 links wired successfully.**

**28 correctly left unwired — not a defect.** All 28 are same-type self-references: a
"Contact Us" text node on a Contact Us page, a "Terms of Service" text node on a Terms of
Service page, etc. Inspecting the actual text nodes found this category includes **both**
genuine duplicate footer links pointing at their own page, **and** each page's own H1
title (e.g. `6113:14071`, the literal "Contact Us" heading at the top of the Contact Us
form) — my exact-string match filter correctly caught both, since both literally contain
the matched string. Figma's own `NAVIGATE` action rejects same-top-level-frame navigation
outright:

```
Reaction at index 0 was invalid (destination ... was rejected ... for NAVIGATE actions,
destinations must be a different top-level frame on the same page)
```

Confirmed via direct re-check that all 28 are exactly this pattern (no genuine, unexplained
failures). Leaving these unwired is the correct behavior — a page's own nav link to itself
functioning as a no-op (or simply not being interactive) is standard, expected behavior on
real sites, not a broken link.

**Spot-checked, not just aggregate-counted**: fresh reads on `205:38` (Sports Page logged
out → ToS Desktop LO), `1009:678` (Sports Page logged in → PP Desktop LI), a Leaderboard
Mobile Contact Us link (→ Contact Mobile LI), and a Bants homepage ToS link (→ ToS Desktop
LI) all confirmed exactly the expected destination IDs.

---

## Documentation: #199 and #201 folded into standing Figma-authoring gotchas

**A real gap found before doing this**: the task's own brief assumed a "standing
Figma-authoring notes section" already existed (referencing "the same place the
`frame.resize()`-on-GROUPs gotcha... lives"). Direct inspection of `CLAUDE.md`'s "Figma
notes" section found it contains only file/variable metadata — no gotchas subsection at
all, despite at least five prior sessions each writing some variant of "belongs in the
file's standing Figma notes" or "recommend folding into the file-wide Figma-notes gotcha
list" for their own individually-discovered gotchas.

**Fixed by creating the missing subsection** (`### Figma-authoring gotchas`, under
`## Figma notes`), seeded with exactly three entries:

1. The `frame.resize()`-on-`GROUP`s-in-absolute-layout-frames gotcha (previously only
   inline in the `sprint-2/legal-pages-navbar-retrofit` bullet — the one this cleanup
   task's own brief pointed at).
2. **Decision Log #199** — a paint bound to a non-alpha-carrying variable combined with a
   separate fractional paint opacity resets to `opacity: 1` at `createInstance()` time.
3. **Decision Log #201** — `figma.union()`/`figma.subtract()` discard input shapes' own
   fills, resetting the boolean result to default gray.

**Explicitly not done**: a full sweep of every other scattered "belongs in Figma notes"
gotcha mentioned inline elsewhere in `CLAUDE.md` (the variable-bound-paint-alpha rule, the
manually-set-`.y`-on-an-auto-layout-child rule, etc.) into this new section. That's real,
disclosed follow-up work, out of this pass's scope — only #199, #201, and the one gotcha
this task's own brief specifically named are consolidated here.

---

## Verification summary

- **#204**: paint audit before/after — 8 live pills found and fixed, 0 remaining live
  instances, 5 remaining archived-frame instances deliberately untouched. Screenshot
  verified.
- **#205**: both new components screenshot-verified before wiring; all 4 reactions
  confirmed persisted via fresh read; orphan reference-checked (0 hits) before deletion.
  Overlay-positioning limitation disclosed, not silently left broken.
- **#206**: investigated via direct read + screenshot; confirmed already resolved; no
  Figma writes made for this item.
- **#207**: 22 live instances fixed and verified via returned `newChars`; safety sweep
  confirmed no other "2022" instances were mistakenly caught or missed.
- **#208**: 263 total matches (of a stated 203) re-verified live; 189 wired, 46 correctly
  skipped (archived), 28 correctly left unwired (self-reference); spot-checked across
  breakpoints and auth states via fresh reads.
- No new colours introduced anywhere in this pass. No `brand/green-tint-28` touched. No
  frame overlaps introduced (the 2 new dropdown components were placed in verified-empty
  canvas space).

## Open items raised by this pass, not resolved here

- **New Decision Log candidate**: `overlayPositionType` on both new Contact Category
  Dropdown components needs to be set to `Manual` by hand in the Figma desktop UI
  (plugin-API read-only limitation) before the already-computed `overlayRelativePosition`
  offsets take effect and the dropdowns anchor under their fields instead of opening
  centered.
- A full sweep of the remaining scattered Figma-authoring gotchas into the new standing
  notes section is still open.
