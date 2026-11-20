# Sprint 2 — Bants mobile categories-view state (My Bants)

**Branch (for the finalising session):** `sprint-2/bants-mobile-categories-view`
**Scope:** Figma design only. No application code touched. One net-new frame.
**Closes:** Decision Log #144 (the "second Bants mobile categories-view state" left open by PR #128).
**Agent:** figma-screen-builder. No shell available this session — git/gh/docx work is the finalising session's.

---

## 1. The new frame

| | |
|---|---|
| **Node ID** | **`5980:10881`** |
| **Name** | `Bants — Search Filter (Categories) — My Bants — Mobile` |
| **Page** | `0:1` ("Soccernity") |
| **Position / size** | x `54545`, y `29600` — 390 × 758 |
| **Layout** | VERTICAL auto-layout, `primaryAxisSizingMode: AUTO` (hugs), `counterAxisSizingMode: FIXED` 390 |
| **Frame fill** | `brand/off-white` (`VariableID:5182:6655`) |
| **Mode** | Light only |

Placed in the Bants mobile row on the existing 500px rhythm, between `5651:8253` (x 54045) and
`5803:8876` (x 55527). **0 overlaps** with any page-level node (verified by an absolute-bounding-box
intersection scan against all 436 page children, not by eye). Name is unique on the page.

Bants mobile row after this PR:

| x | node | |
|---|---|---|
| 51045 | `5650:8074` | Bants — All Feed — Mobile |
| 51545 | `5650:8161` | Bants — User's Own Created Bants (My Bants) — Mobile |
| 52045 | `5650:8221` | Bants — Search Filter (Categories) — Mobile |
| 52545 | `5650:8314` | Bants — Search Result — Mobile |
| 53045 | `5651:8166` | Bants — Create Topic — Mobile |
| 53545 | `5651:8207` | Bants — Create Topic with Attachment — Mobile |
| 54045 | `5651:8253` | Bants — Post Page with Comments — Mobile |
| **54545** | **`5980:10881`** | **Bants — Search Filter (Categories) — My Bants — Mobile ← NEW** |
| 55527 | `5803:8876` | Bants — Search Filter — Mobile |
| 56027 | `5803:8917` | Bants — No Results (Empty State) — Mobile |

### Section banner — no widening needed (checked, not assumed)

There are **zero `SECTION` nodes** on page `0:1`. The Bants "section banner" is a large TEXT node,
`2256:13242` ("Bants"), at x 56318 / y 21503 / 2304 × 939 — it sits *above* the Bants desktop row
(y 23463) and has never horizontally or vertically covered any frame in the mobile row (y 29600).
The nine pre-existing mobile siblings are equally outside it. The new frame is therefore consistent
with every sibling and no banner edit was made. Flagging this because the housekeeping precedent in
the brief assumes a SECTION-based banner, which this file does not use for Bants.

---

## 2. Navbar instance

| | |
|---|---|
| **Instance node** | `5980:10882` |
| **Instance name** | `Navbar (instance: header 4 — mobile)` |
| **Main component** | `5386:6576` — `Property 1=header 4 — mobile` |
| **Parent component set** | `Web app Navbar - Desktop and Mobile` (`2824:4309`) |
| **Size** | 390 × 64 |

**Confirmed identical to `5650:8221`'s own navbar**: source instance `5650:8222` also points at
`5386:6576` / `Property 1=header 4 — mobile` at 390 × 64. It is the logged-in mobile variant (logo +
search glyph + messages glyph + `Avatar` instance), which is correct here — "My Bants" is by
definition an authenticated view. `5650:8161` (the other My Bants mobile screen) uses the same
component, so all three screens agree.

---

## 3. What was reproduced from `2459:12447`, and what was not

### What the desktop reference actually is (investigated, not assumed)

`2459:12447` — "Banter homepage - search filter - categories - User's own created bants" — is a
1440 × 1820 desktop frame with **55 children**. Rendering it produces a near-blank white page with a
single "Filter" card, which initially looks like a broken screenshot. It is not: child index 53,
`Rectangle 134` (`2459:14444`), is a **full-bleed 1440 × 1820 white rectangle at 100% opacity**
sitting above every other layer, with the Filter dialog (`Group 404`, `2459:14445`) on top of it.
The Banter homepage underneath — hero copy, Create New Topic CTA, search field, the `Frame 5761`
bant list, profile rail, fixtures rail, footer — is fully occluded. See Decision Log candidate #185.

So the only *visible* content of this state is the Filter dialog:

- Title "Filter" (Montserrat SemiBold 20) + a divider line
- **Categories** — two 114 × 42 r6 pills: `All` (de-emphasised, `color/text/secondary` @ 70%) and
  **`My Bants` (selected, `brand/navy`)**
- **Date** — `From` / `to` inputs
- **Tag** — `Input author name, club, et.c` input
- **Search** button (navy, r6)

### The diff that defines this state

I diffed `2459:12447` against its own sibling `2459:10083`
("…- categories - All feed", the state `5650:8221` was built from). **The only difference is which
Categories pill is selected** — in `2459:10083` the `All` pill is `brand/navy` and `My Bants` is
`color/text/secondary` @ 70%; in `2459:12447` those are swapped. Dialog structure, Date/Tag fields,
Search button, page-level Filter Tabs and the occluded underlying content are byte-for-byte the same
role in both. The mobile delta is therefore correspondingly narrow, by design and not by shortcut.

### Reproduced

Cloned `5650:8221` and swapped it to the My Bants state. The shell is inherited verbatim — 390px
width (Decision Log #86), the `header 4 — mobile` navbar, `Content` frame padding `20/20/36/20`,
`itemSpacing: 20`, the Inter type scale (26 Semi Bold heading / 15 Semi Bold buttons / 14 Regular
body / 12 Regular metadata / 11 Semi Bold section label), r6 buttons, r8 field, r16 chips, r10 rows.

Content blocks, in order — identical set to `5650:8221`:

1. **Header** — "Banter Rooms" + the standard subtitle
2. **Button — Create New Topic** (`brand/navy` / `color/text/on-navy`)
3. **Search Banter Field** (`color/background/surface`, 1px `color/icon/inactive`, magnifier + ⚙)
4. **Category Filter** — "FILTER BY CATEGORY" + the chip row (All / **Clubs [active]** / Leagues /
   Countries / Players / Events). Kept the same active chip as `5650:8221`, since the desktop delta
   is only the All/My-Bants pill — changing the chip too would be an invented difference.
5. **Button — Search Banter** (`brand/green` / `color/text/on-green`)
6. **Filter Tabs** instance `5980:10912` — **swapped to variant `2459:4839` (`Property 1=Group 828`,
   My Bants active)** via `setProperties`, not a manual fill override, so the instance stays a real
   variant of `Filter Tabs (All / My Bants)` (`2459:4841`). This is the same variant `5650:8161`
   already uses for its own My Bants state. **This is the single element that carries the
   "My Bants" framing on the desktop reference, and it is carried here the same way.**
7. **Bant List** `5980:10913` — the four all-feed rows removed, replaced with **clones of the two
   canonical user's-own rows from `5650:8161`**: `5980:10978` "English Premier League Room"
   (20:00 29th January 2023 · 12k Replies · 30k Views · Created by ArsenalChief) and `5980:10987`
   "Transfer Window Rumours" (09:15 25th January 2023 · 19k Replies · 61k Views · Created by
   ArsenalChief). Reused verbatim rather than authored — see the judgment call in §5.

The frame hugs to 758px after the list swap (down from the cloned 954px).

### Deliberately NOT reproduced

- **The modal-dialog presentation itself** (a floating card over a dimmed page). `5650:8221` already
  established the mobile adaptation for the *identical* dialog on the All-feed sibling: the dialog is
  flattened into the page as an inline "FILTER BY CATEGORY" chip row + a Search Banter button.
  Reproducing a modal here would make this screen structurally inconsistent with the very frame the
  brief names as its adaptation reference.
- **The Date (`From` / `to`) and Tag (`Input author name, club, et.c`) fields.** These are absent
  from `5650:8221` too — and they are not simply lost: they live on `5803:8876`
  "Bants — Search Filter — Mobile" (PR #128), which is the mobile of `2459:7671` and carries
  Filter / Categories / Date / Tag / Search in full. The mobile flow splits the desktop modal into a
  filter *panel* screen and a filter-*applied results* screen; this new frame is the second kind.
  Recorded as Decision Log candidate #187 so `figma-to-code` does not read the absence as an omission.
- **The occluded desktop page underneath the scrim** — hero paragraph, profile rail (followers /
  following / posts / "View profile"), Trending News rail, Fixtures rail, footer links. None of it
  renders in this desktop state, and the mobile Bants family has never carried the rails.
- **The desktop's 12 identical "English Premier League Room" placeholder rows.** Legacy lorem-grade
  repetition; the file's mobile convention (set by `5650:8161`) is a shorter differentiated set.
- **No new copy, labels, counts, empty state, or "My Bants" banner was invented.** Every string on
  this frame already exists in `5650:8221` or `5650:8161`.

---

## 4. Paint audit (new frame `5980:10881`, whole subtree)

| Metric | Count |
|---|---|
| Total paints (fills + strokes, all descendants) | **62** |
| Variable-bound | **61** |
| **Unbound** | **1** |
| **Off-palette** | **0** |
| **`brand/green-tint-28`** | **0** |
| New colours introduced | **0** |
| Dark-mode values authored | **0** (Light only) |

The single unbound paint is `I5980:10882;5387:7675;2819:4082` — `Ellipse 33`, the `IMAGE` photo fill
on the `Avatar` instance **inside the shared `header 4 — mobile` navbar instance**. Pre-existing
shared-component debt, not editable from an instance, and the known-acceptable exception named in the
brief. Zero unbound paints exist outside the navbar instance.

Bound-token breakdown: `color/text/secondary` ×14, `color/text/primary` ×11, `brand/navy` ×11,
`color/background/surface` ×6, `brand/green-tint` ×6, `brand/green` ×4, `color/icon/inactive` ×4,
`color/text/on-navy` ×3, `color/text/on-green` ×1, `brand/off-white` ×1.

No floating menu, dropdown or popover exists on this screen, so `color/shadow/elevated` /
`elevation/menu` was correctly not needed. `semantic/alert` is not used — nothing here is a genuine
loss/destructive/alert indicator.

Prototype reactions: 2 in the new frame, 2 in the source — inherited cleanly by the clone, no drift.

---

## 5. Judgment calls, conflicts, and Decision Log candidates

### Judgment calls (made, with reasoning)

1. **This screen is the mobile of `2459:12447` specifically, not a generic "My Bants" screen.**
   The Bants section already has `5650:8161` for the plain My Bants page (mobile of `2459:5234`).
   Mapping every desktop Bants frame to its mobile counterpart showed exactly one hole —
   `2459:12447` — which is the categories-filter state *applied to* My Bants. That is what was built.
2. **Bant List content reused, not authored.** The desktop reference gives no distinct My-Bants list
   data: `2459:12447`, `2459:10083` and even `2459:5234` all carry the same 12 identical
   "English Premier League Room" placeholder rows. Rather than invent plausible-looking own-bant
   content, the two rows `5650:8161` already established as this file's canonical
   "user's own created bants" set were cloned verbatim — including "Created by ArsenalChief" on both,
   which is that frame's existing signed-in-persona convention. The list being shorter than the
   All-feed screen's four rows reads correctly as "filtered to your own bants", without any invented copy.
3. **Active category chip left on "Clubs"**, matching `5650:8221`, so the frames differ only where
   the desktop pair differs.
4. **Variant swap over fill override.** The Filter Tabs instance was moved with `setProperties` to
   variant `2459:4839`, keeping a live component relationship instead of hand-painting an active state.
5. **Chip row overflow retained.** The chip row is wider than 390 and clips at the frame edge — it is
   named "Chips — Categories (horizontally scrollable)" in the source and behaves identically on
   `5650:8221`. Inherited, not a new defect, and deliberately not "fixed" inside a build task.

### New Decision Log candidates (continuing from #184 — please transcribe)

**#185 — The two desktop "search filter — categories" frames occlude their own page with an opaque
white scrim.** `2459:12447` and `2459:10083` each carry a full-bleed 1440 × 1820 **100%-opaque
white** rectangle (`2459:14444` / its sibling equivalent) beneath the Filter dialog, so the entire
Banter homepage behind the modal is invisible. Both frames consequently render as an almost-blank
page with one floating card — they read as broken screenshots and are actively misleading to anyone
reading them as a spec. A modal scrim should be translucent (the Navigation Drawer's stacked
`color/icon/inactive` technique from PR #145 is the file's working precedent, given that a
variable-bound paint takes its alpha from the variable). **Not fixed here** — retouching existing
screens is `figma-design-system`'s domain, and this is a build task. Recommend a scoped fix pass.

**#186 — The desktop filter dialog's divider still carries the off-palette `#034694` club-crest
blue.** `Line 66` (`2459:14472`) inside `Group 404` has an **unbound** `#034694` stroke — the same
copy-paste bug PR #99 root-caused and swept across Community / Create Post / Community Mobile. It
survives in both `2459:10083` and `2459:12447` because the desktop Bants frames were outside that
sweep. **Not fixed here** (existing-screen retouch, out of scope for a build task). Folds naturally
into the same `figma-design-system` pass as #185.

**#187 — Record that the desktop "search filter" modal is intentionally two mobile screens, not
one.** On desktop, Categories + Date + Tag + Search live in a single dialog. On mobile the file has
split this into `5803:8876` "Bants — Search Filter — Mobile" (the panel: Filter / Categories / Date /
Tag / Search) and the categories-applied results pages (`5650:8221` and now `5980:10881`: chip row +
Filter Tabs + list). This is deliberate and consistent, but it means Date and Tag do **not** appear
on the results screens, and the mobile flow has one more step than desktop. Recording it so
`figma-to-code` does not read the missing Date/Tag as an omission and re-add them.

### Non-blocking, already-open items touched but not changed

- **Decision Log #98** (Bants desktop room-row active/inactive status-dot variant) is unrelated to
  this screen and untouched. The mobile rows cloned here already carry the palette-compliant
  `brand/green` / `color/icon/inactive` dot treatment.

### Nothing was flagged that required a founder product decision to proceed

This screen introduces no new product concept — it is an existing desktop state at mobile width. The
standing Bants blocker (`/banter-rooms*` has no backend; it is unbuilt Sprint 3 work) is unchanged,
and `figma-to-code` must not wire this screen to data.

---

## 6. Does this close Decision Log #144?

**Yes — fully, on the design side.** #144 recorded "one further Bants mobile gap (a second
categories-view state)" left open by PR #128. That gap was the missing mobile counterpart of
`2459:12447`, and `5980:10881` is it.

Verified by enumerating every desktop Bants frame on page `0:1` and mapping each to a mobile
counterpart — the mapping is now complete with no holes:

| Desktop | Mobile |
|---|---|
| `2256:6802` Banter homepage - All feed | `5650:8074` |
| `2459:5234` Banter homepage - User's own created bants | `5650:8161` |
| `2459:7671` Banter homepage - search filter | `5803:8876` |
| `2459:10083` …search filter - categories - All feed | `5650:8221` |
| **`2459:12447` …search filter - categories - User's own created bants** | **`5980:10881` ← NEW** |
| `2448:2179` Banter - search result | `5650:8314` |
| `2355:2137` Banter - create topic | `5651:8166` |
| `2256:8925` Banter - create topic with attachment | `5651:8207` |
| `2256:11081` Banter - post page with all comments | `5651:8253` |
| *(no desktop equivalent)* | `5803:8917` No Results (Empty State) |

**What #144 does not cover and remains open** (do not read this PR as closing them): the Bants
section's *desktop* debt — #185 (opaque scrim) and #186 (`#034694` divider) raised above, plus the
pre-existing #98 (desktop room-row active/inactive variant). And the Bants pillar as a whole is still
backend-blocked: `/banter-rooms*` is unbuilt Sprint 3 work.

---

## 7. Handoff to the finalising session

- **Branch:** `sprint-2/bants-mobile-categories-view` off `main`.
- **Docx (Build Plan Section 9):** append a forward-pointer to **#144**'s Status cell —
  *"RESOLVED by `sprint-2/bants-mobile-categories-view` (PR): the second Bants mobile categories-view
  state is built as `Bants — Search Filter (Categories) — My Bants — Mobile` (`5980:10881`); every
  desktop Bants frame now has a mobile counterpart."* Then add new rows **#185**, **#186**, **#187**
  using the text in §5 above.
- **CLAUDE.md status bullet:** the new frame ID, the navbar instance it uses, the paint audit
  (62 paints / 61 bound / 1 unbound navbar-avatar `IMAGE` / 0 off-palette / 0 `green-tint-28`),
  that #144 is closed, and that #185–#187 are new open candidates.
- **PR:** push and open, do **not** merge.
- **No application code was touched.** `apps/web` and `services/api` are untouched — there is nothing
  to build, lint or test in this PR.
