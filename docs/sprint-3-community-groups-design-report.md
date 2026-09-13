# Sprint 3 — Community Groups design report

**Branch:** `sprint-3/community-groups-design`
**Agent:** `figma-screen-builder`, 2026-09-13
**Scope:** Figma design only. No app or backend code touched. No schema exists yet for this
feature — this design defines the shape a future `backend-api` pass will build from, per this
project's own Grassroots precedent (design first, schema second), not the other way around.

## 1. Why this task exists

Decision Log #1 (Build Plan Section 9, sourced from Log Book Section 24.4) records the founder's
resolution that "Community groups" (Log Book Section 6.1 — interest-based groups by city, position
played, or career track) and "Banter Rooms" (club/league/national-team/topic-scoped forum-style
rooms) are two distinct features, and Soccernity needs both. Community Groups had no Figma screen
anywhere in the file before this task — confirmed directly (see §3) rather than assumed from the
brief.

## 2. Frames created

All on page **"Soccernity" (`0:1`)**, in a previously-empty band below all existing content (the
lowest pre-existing content ended at y 37225 — the Grassroots mobile row). Everything here sits at
**y ≥ 37500**.

### Section labels

- `Section Title — Community Groups` — `6450:18632` (x 0, y 37500)
- `Section Subtitle — Community Groups` — `6450:18633` (x 4, y 37680)

### Desktop row (y 38200, 1440px wide, 1640px pitch)

| # | Frame | Node ID |
|---|---|---|
| 1 | Community Groups — 1 Browse — Desktop | `6450:18580` |
| 2 | Community Groups — 2 Browse (No Groups Match Filter) — Desktop | `6452:18580` |
| 3 | Community Groups — 3 Browse (No Groups Yet for This City) — Desktop | `6452:18692` |
| 4 | Community Groups — 4 Group Page (Not Joined) — Desktop | `6453:18580` |
| 5 | Community Groups — 5 Group Page (Joined) — Desktop | `6454:18580` |
| 6 | Community Groups — 6 Create a Group — Desktop | `6454:18709` |
| — | Community Groups — Design Notes | `6459:18580` |

### Mobile row (y 41200, 390px wide — Decision Log #86, 500px pitch)

| # | Frame | Node ID |
|---|---|---|
| 1 | Community Groups — 1 Browse — Mobile | `6455:18580` |
| 2 | Community Groups — 2 Browse (No Groups Match Filter) — Mobile | `6456:18580` |
| 3 | Community Groups — 3 Browse (No Groups Yet for This City) — Mobile | `6456:18667` |
| 4 | Community Groups — 4 Group Page (Not Joined) — Mobile | `6457:18580` |
| 5 | Community Groups — 5 Group Page (Joined) — Mobile | `6458:18580` |
| 6 | Community Groups — 6 Create a Group — Mobile | `6458:18701` |

**Overlaps: 0** — verified by a strict pairwise AABB test of all 15 new top-level nodes against
every top-level child of page `0:1` (539+ nodes, no type exclusions, both directions). The Design
Notes frame is tall (2832px) but sits at x 9840, clear of the mobile row's x 0–2890 band.

## 3. Confirmed: no pre-existing Community Groups frame

Searched page `0:1` at every depth (not just top level) for `community group` / `communitygroup` /
`communit`+`group` before writing anything. Exactly one hit, and it is not a screen: `5116:6659`,
"Note — 8. 'Community groups' vs 'Banter Rooms'" — the Guardian-Consent design-notes annotation
that records the DL #1 open question itself. Every other `communit`-matching node was the existing
Community main-feed family and its archived mobile frames. No Community Groups screen has ever
existed. Post-build, the same search returns exactly these 13 frames.

## 4. Paint audit

| Metric | Result |
|---|---|
| Total paints (fills + strokes, visible), all 13 frames | 854 |
| Variable-bound | 854 |
| Unbound | **0** |
| Off-palette | **0** |
| `brand/green-tint-28` (deprecated, DL #47) | **0** |
| New colours | **0** |
| Non-SOLID (image/gradient) paints | 0 |
| Explicit mode overrides | 0 — everything inherits Light (file default); Dark untouched |

Tokens used, all from `Soccernity Theme`: `color/text/primary` (214), `color/text/secondary` (177),
`color/icon/inactive` (135), `brand/green-tint` (98), `color/background/surface` (97), `brand/navy`
(64), `brand/green` (37), `color/text/on-green` (19), `brand/off-white` (13).

**Genuine 0 unbound — no disclosed reused-component-debt exception.** Every other recent net-new
pass has had to disclose one line of unbound debt (typically the shared navbar's avatar `IMAGE`
fill). This pass avoided it entirely by using the logo-only `Top Bar — Soccernity` (the same
provisional chrome Clubs — Browse used before its own nav question was resolved, DL #156) rather
than the `header 4` navbar.

## 5. Reused vs. built fresh, and how this stays visually distinct

**Reused (cloned, never edited at source):**
- `Top Bar — Soccernity` from Clubs — Browse (`5841:9241` desktop, `5841:9307` mobile) — provisional
  logo-only chrome.
- Post cards cloned from Club — Fan Page's feed (`6202:14553`, `6202:14583`).
- Member roster rows cloned from Club — Fan Page (`6202:14619` et al) — **the `@handle` line was
  deleted from all 8 roster rows**, since `User.username` has no column (a parked backend
  requirement, Decision Log #58) and the shipped `ClubFanPage.tsx` renders name only. Reproducing an
  unbacked field in brand-new design would have been worse than the omission — same discipline this
  project applies elsewhere (e.g. the "no group photo/crest field" call on the Create form below).
- Mobile layout conventions read off Clubs — Browse — Mobile (390 wide, 64px Top Bar, 350px column).
- Combinable-filter-bar pattern modelled on Leaderboard's `Filter Bar — 4 Combinable Dimensions`
  (`5172:6659`): numbered labels, collapsed dropdowns, active-filter chip summary, "Reset filters".
- Type ramp, radii, button/input geometry lifted from the Clubs/Leaderboard precedent.

**Built fresh:** the 3-across card grid; the dimension badge pill; both empty-state blocks; the
Create-a-Group form and its type→value conditional field; the "✓ Joined" indicator; the Design
Notes frame.

**Distinct from Banter Rooms, concretely:** Banter browses as a full-width room-list with
`Filter Tabs (All / My Bants)` and forum language (topics, threads, comments). Community Groups
browses as a 3-across card grid with a labelled, combinable, three-dimension filter bar plus
active-filter chips. No chat/thread language anywhere. **No Banter frame or component was opened
for edit, cloned, or touched.**

**Distinct from the Community main feed, concretely:** Community (`1306:7148`/`7149`) is a single
authenticated feed — three-column shell, composer first, Trends / Who-to-follow / Trending News
rails. Community Groups has **no composer anywhere, even in the Joined state**, no suggestion
rails, and is a multi-entity directory where every route resolves to a distinct entity with its own
membership and roster. **No Community feed frame or component was touched.**

The dimension badge ("City · Lagos" / "Position · Striker" / "Career track · Coaching") is the one
genuinely new UI element — neither neighbouring feature has a per-entity taxonomy tag. It's a
text-prefixed pill so all three dimensions read distinctly without a third accent colour.

Also deliberate: **no Join button on the Browse cards** (Clubs — Browse puts one on every card).
The whole card is the click target; membership lives only on the group page. This further separates
the two directories.

## 6. Judgment calls — flagged, not silently decided

Recorded on the Design Notes frame (`6459:18580`) as well as here.

| Call | Handling |
|---|---|
| Who can create a group | **Flagged, open.** Designed as open to any consent-confirmed user, but explicitly marked unresolved — unbounded user-named public groups on a minors' platform is the same spam/safeguarding surface already flagged for Banter Room creation (DL #275). |
| Content moderation | **Flagged, open.** Ordinary post moderation assumed for group posts. Group **names** are the genuinely new surface — user-authored, public, shown in a directory, not attached to a visible author the way a post is — with no existing moderation coverage. |
| Group size limits | **Flagged, open.** No cap designed or displayed; member counts are illustrative. |
| "Fantasy league" as a 4th dimension | **Flagged, open — neither added nor ignored.** Built to exactly three (City / Position / Career track). Fantasy league differs in kind: it's time-boxed with its own standings, closer to the Contest/Competition pillar than to a durable-attribute interest group. |
| Restricted-pending minors | **Applied existing precedent, stated explicitly.** Platform default from DL #21 / #275 / Section 5.7: browse and read, yes; create, join, post, no. No screen depicts a restricted state; whoever builds the backend should gate create/join/post with `GuardianConsentGuard` and leave reads on `JwtAuthGuard`. |
| Navigation placement | **Not designed, as instructed — fully open.** No navbar change, no nav entry. Screens use the logo-only Top Bar as provisional chrome, same as Clubs — Browse before DL #156. This is its own separate founder call — see the PR discussion / Decision Log #281 for the recommendation (a new top-level entry, since nesting under either Community or Bants would contradict DL #1's own ruling that these are distinct features). |

**Two further calls made and flagged rather than hidden:**
- **No group post composer**, even in the Joined state — mirrors Club — Fan Page, which has none
  because no scoped post-creation endpoint exists (DL #157). If a group feed should be postable,
  that's new endpoint + composer work, not assumed here.
- **Join/Leave built as two frame states, not a whole extra family** — frames 4 and 5 are the same
  page in its two membership states. No separate confirm/success screen. Whether leaving needs a
  confirm step (Clubs and Grassroots don't have one) is left open.

## 7. Gotchas hit

**(a) Design-fidelity catch.** The Club — Fan Page roster row carries an `@handle` second line
(`@marcusobi`). `User.username` has no column — a parked backend requirement (DL #58) — and the
shipped `ClubFanPage.tsx` renders name only. Deleted that line from all 8 roster rows rather than
reproduce an unbacked field in a brand-new design.

**(b) New gotcha — cloning *populated* content leaves stale data in non-obvious nodes.** Cloning
post cards and roster rows and updating the obvious text produced two silent defects the structure
gave no hint of: post avatar initials stayed as the source people's initials, and a loose
`characters.length > 3` predicate wrote the display name into both the name line and the `@handle`
line, rendering the name twice. This sharpens the existing DL #265 note ("cloned repeated content
still needs a screenshot") into a concrete rule: **match cloned text nodes by structural role**
(position within the named parent frame, font size/style), **not by a content heuristic** — and
screenshot immediately, since a binding/structure audit can pass clean while the content is visibly
wrong.

**(c) Minor, for inspection helpers.** `figma.mixed` is a symbol and can be returned by far more
scalars than typically guarded for (`fontSize`, `strokeWeight`, `itemSpacing`, `cornerRadius`,
paddings, not just `fills`/`fontName`). String-concatenating one throws `TypeError: cannot convert
symbol to string` from deep inside a `.map()`, with no indication which property caused it.
Read-only outline helpers should route every scalar through a `safe()` guard.

`use_figma` was confirmed to roll a failed read back with zero canvas side effects, consistent with
Decision Log #246.

## 8. Not done here (follow-up work)

- No schema/backend exists for this feature — a future `backend-api` pass builds the data model
  from this design, matching the Grassroots precedent.
- No `figma-to-code` conversion — this is design only.
- Navigation placement is unresolved (§6) — needs a founder decision before any nav wiring.
- The five other flagged judgment calls in §6 (creation access, moderation, size limits, the
  fantasy-league question) are open founder calls, not blockers to reviewing this design PR.
