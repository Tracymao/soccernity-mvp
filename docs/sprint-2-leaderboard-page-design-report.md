# Sprint 2 — Leaderboard Page Desktop (new screen design)

Figma-only design work in file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`),
page "Soccernity" (`0:1`), new top-level frame **"Leaderboard Page Desktop"**
(`5171:6633`), by the `figma-screen-builder` agent, branch
`sprint-2/leaderboard-design-new`. No application code was touched — this is
new Figma screen design only, and no existing frame was edited.

**Routing note**: this task was dispatched labelled "Agent: figma-design-system",
but the brief itself said "no existing frame to revise — this is new design
work." Per `.claude/agents/figma-design-system.md`/`figma-screen-builder.md`'s
own explicit boundary ("figma-design-system... do NOT use this for designing
brand-new screens that don't exist yet — that is figma-screen-builder's job"),
the work was routed to `figma-screen-builder` instead of the labelled agent.
Flagging this here rather than silently overriding the dispatch label.

## 0. Prerequisite check

`figma-design-system`'s token pass is complete: collection `Soccernity Theme`
(`VariableCollectionId:5096:2`), modes Light (`5096:0`) / Dark (`5096:1`), 10
variables. All 10 were read with their per-mode resolved values before use. No
new variable was created and no new colour was invented — the frame uses only:
`brand/green` (`5096:3`), `brand/navy` (`5096:4`), `brand/green-tint`
(`5096:5`), `color/background/page` (`5096:6`), `color/background/surface`
(`5096:7`), `color/text/primary` (`5096:8`), `color/text/secondary`
(`5096:9`), `color/text/on-green` (`5096:10`), `color/icon/inactive`
(`5097:2`), `brand/green-tint-28` (`5098:7071`).

Verified, not assumed: an audit script walked all 341 nodes in the frame and
found zero unbound solid paints (fills or strokes) outside the imported
`Header` instance — every colour traces to a token.

## 1. Frame identity

**`5171:6633`** — "Leaderboard Page Desktop", 1440 × 3221, canvas
`x = -25789, y = 16440`, explicit **Dark** mode on `Soccernity Theme`. Placed
directly beside `Home Page Desktop` (`2631:3951`) in the existing "Homepage"
section band — verified empty before writing via a collision test against all
288 top-level nodes (zero overlaps).

## 2. Existing patterns reused (read only, never modified)

| Source | What was taken |
|---|---|
| `2072:5584` "Users" / Contest Leaderboard | Table pattern only — header row, zebra rows, rounded clipped container, rank→name→metric order. Not reused or wired in directly, per the brief. |
| `2824:4309` `Header` component set, variant `2839:3583` (`header 5`) | Live component instance |
| `5108:6630` Guardian Consent — Restricted Pending | Dark visual language: surface cards, `color/icon/inactive` hairlines, green pills/buttons, inline annotation convention |
| `5116:6633` Guardian Consent — Design Notes | "Design Notes & Open Decisions" panel convention |
| `2631:4012` Home Page footer | Content/structure only — rebuilt, not cloned (see §6) |
| `2905:4798`, `1455:4362`, `2009:2913` | Dummy-data persona convention |

One correction to the original brief's framing: `2009:2913` is named
"leaderboard" but is the create-post modal with an unbuilt "Leaderboard" tab,
not a real leaderboard screen — checked directly before assuming this was
greenfield; it confirms no leaderboard screen existed anywhere in the file.
Separately, the "Contest (Taiwo)" band is not empty — it holds
`2349:1203`/`2355:4359` "Admin(leader board)" plus three "Users" frames,
worth correcting wherever that was recorded as empty.

**Header variant is a real judgment call**: Home Page Desktop uses `header 4`;
this frame uses `header 5` (`2839:3583`, 76px) instead, because it's the only
variant whose nav actually contains a LEADERBOARD item, and it's the
authenticated variant (avatar, no Login button) — appropriate for a board that
highlights "you." The shared component's internals were not overridden to add
an active-nav-item state.

## 3. Taxonomy and filter design

Global, Per-Club, Per-Competition, and Per-Time-Period are one filter bar
(`5172:6659`) inside one frame, not four screens — four labelled controls in a
row: `1 · SCOPE` (segmented: Global / By club), `2 · CLUB` (dropdown, inert
grey text while Scope = Global), `3 · COMPETITION` (dropdown), `4 · TIME
PERIOD` (segmented: Weekly / All-time).

Combination is made legible by an active-filter summary row (`5172:6685`)
beneath the controls — `Showing [Global] [All competitions] [All-time] ·
12,480 players ranked`, plus `Reset filters` — resolving all four axes in one
sentence so any combined state (e.g. "a club's weekly board") is just a
different set of pills, with no layout change.

**Competition ≠ Contest**, per the project's taxonomy: "Competition" is the
umbrella, "Contest" (skill-challenge videos, fed eventually by `2072:5584`,
not wired here) is one type among others (e.g. prediction & commentary, no
source screen yet). State Study B (`5176:6652`) shows the competition
selector expanded as a generic type list — `All competitions` (selected),
`Contest — video skill challenges · live`, `Prediction & Commentary — no
source screen yet, not designed` (disabled) — with a footnote that further
types are added as rows here with no layout change. Contest gets no
privileged position despite being the only type with real content today.

## 4. "Your rank" — both variants designed, deliberately not shown together

- **Inline (primary)**, row 7 (`5174:6668`) of the live board:
  `brand/green-tint` fill, 3px `brand/green` left bar (left padding reduced
  24→21 so text doesn't shift), avatar inverted to solid `brand/green` with
  `color/text/on-green` initials, green "You" pill beside the display name.
- **Pinned/sticky (secondary)**, documented in State Study A (`5175:6657`):
  viewer at rank 1,284, docked to the bottom edge of the table card for when
  their rank falls outside the loaded rows.

Both share the same visual formula (fill, left bar, pill) so they read as the
same object in two positions. They are not rendered simultaneously in the
live board — a viewer visible at rank 7 and pinned at the bottom would be a
contradictory state.

## 5. Ranking and data rules

Ranked strictly by a plain integer (`Inter Semi Bold 16`, right-aligned). No
badge/tier/token/trophy iconography and no podium — the Contest source frame
(`2072:5584`) puts gold/silver/bronze trophies on its top three; that was
deliberately not carried over, per Build Plan Section 2.2 (rewards economy is
Phase 2).

Real display names throughout, minors included, per Decision Log #45. Row 6
is "Sarah Bello" — the same persona used as a minor in the guardian-consent
screens — deliberately listed normally, making Decision Log #45 visible in
the artefact itself rather than only in prose. Restricted-pending minors are
simply absent from the data; there is no hidden-row visual state. This is
stated on-canvas via a `DATA RULE` annotation (`5174:7185`), using the same
inline-annotation convention the consent frames already use for "SCOPE OPEN."

## 6. Dummy data and footer

Dummy data matches the file's existing convention rather than inventing a new
one: Nigerian setting (Profile already uses "Port Harcourt, Nigeria"), names
in the file's established style (Emeka John, Abdul Yusuf, Chukwu James,
Adeniyi Christiana), `@handle` form as used in the feed. Adeniyi Christiana is
the viewer at rank 7 — she's already the logged-in persona across
Profile/Settings and the Header avatar face, so "You" stays consistent with
the header. Club names (Ikoyi Rovers FC, Surulere United, Port Harcourt
Blues, Ajegunle Stars FC, Yaba Athletic) are invented but grassroots-plausible
— the file's real Premier League fixture names (Chelsea, Liverpool) were
deliberately not reused, since this board is for unaffiliated grassroots
players and using real pro-club names would misrepresent who's on it.

**Footer was rebuilt, not cloned, and this surfaced a pre-existing gap,
flagged rather than fixed here**: the existing Home Page footer (`2631:4012`)
has 0 of 46 solid fills bound to variables — a hardcoded `#1e1e1e`
background. Cloning it would have injected 46 hardcoded colours into an
otherwise fully token-bound frame, so the footer here was rebuilt from the
same content (wordmark, 6 socials, 5 legal links, copyright) on `brand/navy`
with every fill bound. **The original Home Page footer still needs this
retrofit — that's `figma-design-system` work, not done here, not touched
here.**

One other pre-existing issue found and left alone: the shared `Header`
component's search field resolves to a solid mid-green against the dark bar
in Dark mode and reads louder than intended. Left unmodified rather than
overriding a shared component's internals from inside a screen-design task.

## 7. One addition beyond the brief, flagged

A 7-DAY CHANGE column (`+2`, `—`, `−3`) — earns its place on a Weekly board.
It's monochrome on purpose: the palette is exactly two brand colours with no
red/negative token, so a green-up/red-down treatment is unavailable by
construction; left uncoloured rather than reaching for a third accent. The
label stays "7-day" regardless of the selected time period, since movement is
always measured over 7 days.

## 8. Explicitly open — not decided here

Twelve items are written directly into the `Design Notes & Open Decisions`
panel (`5177:6652`) so they travel with the file. The three real blockers:

1. **What earns a point?** No points model exists anywhere — `User` has no
   points field in Build Plan Section 3, and no Section 4 endpoint computes
   or returns one. This board ranks by an integer the platform does not
   currently store. Needs a Decision Log entry before `figma-to-code` picks
   this up: which actions accrue points, and whether it's one global ledger
   (this design assumes so, filtered per view) or separate per-competition
   tallies.
2. **Which "club" does the club axis mean?** The schema has two distinct
   mechanisms — `ClubPage` membership via `_ClubMembership` (fan pages) and
   `User.clubAffiliationId` (declared identity, currently written by
   nothing) — and grassroots teams are an unbuilt third. The choice changes
   who appears on a club board; not a design decision.
3. **Is the board public to logged-out visitors?** The authenticated Header
   variant was used here, but the stated reason for showing minors' real
   names is scout/club visibility, and scouts may not have accounts. Full
   board / truncated / nothing at all is safeguarding-adjacent, not a layout
   question.

Also flagged, more briefly: Scope and Club arguably collapse to one control
without losing function; Weekly/All-time only, since no decision exists yet
on week-reset timing/timezone; and this frame is explicit Dark mode (matching
consent/verify-email) while Community/Settings/Contest remain Light — the
platform-wide light/dark default is still unresolved. Because every fill is
token-bound, flipping this frame to Light later is a single mode switch, not
a redraw.

## 9. Explicitly NOT done (per brief)

- `2072:5584` was not wired in as a live/linked component — future
  integration work once other competition types exist.
- No badge/tier/token reward iconography anywhere in the frame.
- No other existing frame in the file was touched.

## 10. Node IDs

Root `5171:6633` · Header instance `5171:6634` · Body `5171:6654` · Footer
`5171:6655` · Title block `5172:6652` · Filter bar `5172:6659` (controls
`5172:6660`, summary `5172:6685`) · Board `5173:6652` (column header
`5173:6653`) · Rows 1–5 `5173:6664 / 6679 / 6694 / 6709 / 6724` · Rows 6–10
`5174:6652 / 6668 / 6686 / 6702 / 6718` (row 7 = your-rank) · Table footer
`5174:6734` · Data-rule note `5174:7185` · Annotation zone `5175:6652` ·
State Study A `5175:6654` (pinned bar `5175:6657`) · State Study B
`5176:6652` (menu `5176:6659`) · Design notes `5177:6652`.

Nodes read but not modified: `2631:3951`, `2631:4012`, `2009:2913`,
`2072:5584`, `2824:4309`, `2839:3583`, `5108:6630`, `5116:6633`, `2905:4798`.

## 11. Verified vs. assumed

**Verified**: variable collection/modes/values; zero unbound paints across
341 nodes; no zero-size or clipped text; placement collision-free; font style
strings confirmed via `listAvailableFontsAsync` (Inter uses `"Semi Bold"`
with a space, Montserrat uses `"SemiBold"` without — a real footgun);
Header component's fills are variable-bound (26–34 of ~40 per variant); Home
Page footer's are not (0 of 46); rendering confirmed via full-frame and
detail-crop screenshots.

**Assumed, not verified**: that `header 5` is the intended app-shell header
for an authenticated in-app page — chosen on the LEADERBOARD-nav-item
evidence, but no spec names a canonical header variant per page type; that
the annotation zone below the footer, inside the same page frame, is
acceptable — the guardian-consent pass used a separate top-level notes
frame, but this brief specified one frame only, so notes were kept inside it
behind an explicit "the page ends above" divider.

## 12. CLAUDE.md "Where things stand right now" — deliberately not updated

This PR is new Figma design work with a real dependency (no points model,
club-axis ambiguity, public-visibility question — §8) before `figma-to-code`
can build it. It doesn't resolve an existing Decision Log item or close a
Sprint 2 line item Build Plan Section 6 already lists as done — Leaderboard
design wasn't previously tracked as in-progress there. Per CLAUDE.md's own
rule, a status-section update is warranted here specifically to flag the new
open Decision Log candidates from §8 (points model, club-axis definition,
public-visibility). That update is being made in the same PR, in
`CLAUDE.md`'s "Where things stand right now" section — not deferred to a
later sweep.
