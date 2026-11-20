# sprint-2/admin-contest-screens — report

**Branch:** `sprint-2/admin-contest-screens` (off `main`)
**Agent:** figma-screen-builder, 2026-09-06
**Scope:** Figma design only. No `apps/admin`, no `apps/web`, no `services/api` code touched.
**Decision Log:** adds **#242**; appends a forward-pointer to **#239** (which stays **Open** — this is Task 2 of 3).

Task 2 of the 3-task sequence resolving **Decision Log #239**. Task 1
(`sprint-2/admin-contest-read-endpoints`, Decision Log #241) shipped the admin
read endpoints. Task 3 (`figma-to-code`) wires `apps/admin`'s Contest section
to these screens and the four write endpoints.

---

## 1. Screen-set proposal (stated before building, and how it changed)

The orchestrator's starting point was 6 screens + 2 dialogs. I confirmed the
shape but **refined it in four places**, each for a reason grounded in the real
response shapes rather than in symmetry:

| Change | Why |
|---|---|
| **The hub becomes 6 frames, not 1.** | The hub's entire job is phase-contextual — the primary action, which panels are populated, and which pills render all differ per phase. One frame cannot express that, and `figma-to-code` needs to see each branch. `week_1` and `weeks_1_2` are structurally identical (same layout, one more judged row), so they collapse into a single "Weeks In Progress" frame; the other five phases each get their own. |
| **"Crown Winners" lists DISTINCT users, not the 9 weekly winners.** | `CrownCycleDto` takes `userId` (not `entryId`) and rejects a repeated `userId`. So the finalist pool is the *deduplicated* set of weekly winners. In the sample data 9 weekly placings collapse to 6 finalists. Designing one row per weekly winner would have produced a screen that cannot submit. |
| **"Judge Week" becomes 4 frames.** | Open-round judging, the already-judged read-only view, the out-of-sequence block, and the zero-entry "thin week" are four genuinely different screens, and the thin week is an explicitly *supported* outcome (`winners` may be empty) rather than an error — worth its own frame so it isn't built as a blocked state by mistake. |
| **"Open the Final — blocked" and "Cycle History — empty" folded in, not built.** | The final's blocked state is just the hub's own disabled button, which the Vacant / Weeks-In-Progress frames already show. `{ items: [] }` on history is only reachable when no cycle has ever existed, which is exactly the "No Cycle" hub state. Two frames that would have carried no new information. |

Confirmed without change: no "Delete cycle" screen anywhere (no endpoint, and a
cycle cannot be deleted), and the blocked/409 states are rendered with the
backend's real message strings.

**Final set: 16 screens + 1 design-notes frame.**

---

## 2. Frame list

All on page `0:1`, all 1440 wide, all Light mode, all carrying a real instance
of the **Admin Shell** `COMPONENT_SET` `6014:12948` with `Active=Contest`
(variant `6014:12944`) and `Show Action Button=false`.

### Row A — Contest Console (hub), `y = -17700` · `GET /admin/contest/current`

| # | Frame | Node ID | x | Size | State rendered |
|---|---|---|---|---|---|
| 1 | Admin — Contest Console — No Cycle | `6271:15272` | 41239 | 1440×1184 | `cycle: null, phase: null`, all arrays empty |
| 2 | Admin — Contest Console — Vacant (No Week Judged) | `6269:14868` | 42859 | 1440×1184 | `phase: vacant` |
| 3 | Admin — Contest Console — Weeks In Progress | `6266:14767` | 44479 | 1440×1184 | `phase: week_1` / `weeks_1_2` |
| 4 | Admin — Contest Console — All Weeks Judged | `6269:15107` | 46099 | 1440×1213 | `phase: weeks_1_3` |
| 5 | Admin — Contest Console — Final Live | `6270:15070` | 47719 | 1440×1213 | `phase: final_live` |
| 6 | Admin — Contest Console — Crowned | `6270:15346` | 49339 | 1440×1213 | `phase: crowned` |

### Row B — Start / Judge, `y = -14700`

| # | Frame | Node ID | x | Size |
|---|---|---|---|---|
| 7 | Admin — Contest — Start a Cycle | `6272:15373` | 41239 | 1440×1184 |
| 8 | Admin — Contest — Start a Cycle (Custom Weekly Windows) | `6273:15474` | 42859 | 1440×1496 |
| 9 | Admin — Contest — Start a Cycle — Blocked (Cycle Already Running) | `6273:15664` | 44479 | 1440×1184 |
| 10 | Admin — Contest — Judge Week (Open Round) | `6274:15676` | 46099 | 1440×1184 |
| 11 | Admin — Contest — Judge Week (Already Judged) | `6275:15777` | 47719 | 1440×1184 |
| 12 | Admin — Contest — Judge Week (No Entries — Thin Week) | `6275:15985` | 49339 | 1440×1184 |
| 13 | Admin — Contest — Judge Week — Blocked (Out Of Sequence) | `6275:16182` | 50959 | 1440×1184 |

### Row C — Final / Crown / History / Notes, `y = -13200`

| # | Frame | Node ID | x | Size |
|---|---|---|---|---|
| 14 | Admin — Contest — Open the Final (Confirm) | `6276:16080` | 41239 | 1440×1213 |
| 15 | Admin — Contest — Crown Winners | `6276:16213` | 42859 | 1440×1184 |
| 16 | Admin — Contest — Cycle History | `6277:16282` | 44479 | 1440×1184 |
| 17 | Contest Admin Console — Design Notes | `6278:16383` | 46099 | 1440×1711 |

---

## 3. Per-frame endpoint / field mapping

**No frame renders a field the backend does not return.** Verified line by line
against `services/api/src/modules/contest/contest.types.ts` and the three DTOs.

### Frames 1–6 · Contest Console — `GET /admin/contest/current`

Renders: `cycle.title`, `cycle.status`, `cycle.startsAt`, `cycle.endsAt`,
`cycle.finalOpenedAt` (frames 5–6 only), `cycle.crownedAt` (frame 6 only),
`cycle.id`, `phase`, `rounds[].weekNumber`, `rounds[].opensAt`,
`rounds[].closesAt`, `rounds[].status`, `rounds[].judgedAt`,
`rounds[].entryCount`, `weeklyWinners[].weekNumber`, `weeklyWinners[].position`,
`weeklyWinners[].displayName`, `monthlyStandings[].position`,
`monthlyStandings[].displayName`.

Deliberately **not** rendered: `rounds[].entries[]` (detail-level data — the hub
shows counts only, and the Judge screens own the entries), `rounds[].id`,
`weeklyWinners[].entryId` / `.postId` / `.userId` (ids the UI carries but does
not print).

### Frames 7–9 · Start a Cycle — `POST /admin/contest/cycles`

Writes `title` (min 1), `startsAt`, `endsAt` (must be after `startsAt`), and the
optional `rounds[3]` of `{ weekNumber (1|2|3), opensAt, closesAt }`. Frame 7 is
the omit-`rounds` path (auto three 7-day windows); frame 8 is the explicit
`rounds[]` path; frame 9 renders the real 409.

### Frames 10–13 · Judge Week

Reads `GET /admin/contest/cycles/:id` → `rounds[n].entries[]`:
`entryId` (carried by each position chip, never printed), `submittedAt`,
`entrant.displayName`, `post.contentText`, `post.mediaUrls`, `post.likeCount`,
`post.commentCount`, `position`. Also `rounds[n].status`, `.opensAt`,
`.closesAt`, `.judgedAt`, `.entryCount`, plus `cycle.title`.

Writes `POST /admin/contest/cycles/:id/rounds/:week/results` →
`winners[]{ entryId, position }`, max 6, may be empty.

Deliberately **not** rendered: `entrant.userId`, `post.id`, `post.createdAt`
(`submittedAt` is the operationally meaningful timestamp; `post.createdAt` is
near-identical and would be noise).

### Frame 14 · Open the Final — `POST /admin/contest/cycles/:id/final/open`

No request body. Reads `weeklyWinners[]` only, to state the finalist count.

### Frame 15 · Crown Winners — `POST /admin/contest/cycles/:id/crown`

Pool = `weeklyWinners[]` **deduplicated by `userId`**; each row summarises that
user's `weekNumber`/`position` placings. Writes `standings[]{ userId, position }`,
min 1 / max 6. Also reads `cycle.title`, `cycle.finalOpenedAt`, `cycle.status`.

### Frame 16 · Cycle History — `GET /admin/contest/cycles`

Renders `items[].cycle.title`, `.status`, `.startsAt`, `.endsAt`,
`items[].phase`, `items[].rounds[].entryCount`. Explicitly does **not** show an
entries array — that is detail-only (`AdminContestCycleListItem` carries
`AdminContestRoundSummary`, not `AdminContestRoundDetail`).

---

## 4. Screenshot verification

Every frame was rendered and read back. Findings and fixes:

| Frame | Result |
|---|---|
| 1 No Cycle | Pass. Lifecycle callout + all-upcoming phase strip. |
| 2 Vacant | Pass. Empty weekly-winners panel; weeks 2–3 show "Judge week N after week N−1". |
| 3 Weeks In Progress | Pass. |
| 4 All Weeks Judged | Pass after fix — content exceeded the 1184 floor, frame grown to 1213 and the shell instance grown with it. |
| 5 Final Live | Pass after the same fix. |
| 6 Crowned | Pass after the same fix. Standings 1st/2nd/3rd populated. |
| 7 Start a Cycle | Pass after copy fix — "Send no rounds[] in the request" was dev-speak in UI, rewritten to "Three consecutive 7-day rounds are created from the start date." |
| 8 Custom Weekly Windows | Pass. Reused calendar renders as an open picker. |
| 9 Start Blocked | Pass. Form dimmed, submit removed, 409 banner with a real forward action. |
| 10 Judge (Open Round) | Pass after fix — context bar said "4 entries" against 3 rendered cards; corrected to 3. |
| 11 Judge (Already Judged) | **Pass after a real fix.** The clone carried week-3 entry text and 17–19 Sep dates under a "Week 1 Results / 1–8 Sep" header. Entry copy and all three `submittedAt` values corrected to week 1. |
| 12 Judge (Thin Week) | Pass. Empty state + a real "Close week 3 with no winners" action. |
| 13 Judge Blocked | Pass. Alert-bar banner, entries dimmed to reference-only. |
| 14 Open the Final | Pass. Scrim renders correctly; dialog carries the `elevation/menu` effect style. |
| 15 Crown Winners | Pass. 6 distinct finalists from 9 placings. |
| 16 Cycle History | Pass. |
| 17 Design Notes | Pass. |

---

## 5. Paint audit

Method: walked every node in every frame, counting SOLID fills and strokes by
bound-variable id, with a second pass excluding the `Admin Shell` instance.

- **Authored nodes: 0 unbound, 0 off-palette, 0 `brand/green-tint-28`, 0 new colours.**
  Proven directly — the Design Notes frame is the one frame with no shell
  instance, and it audits at **111 bound / 0 unbound**. Every other frame's
  excluding-shell audit is also 0 unbound (Judge Already Judged: 59 bound / 0
  unbound, and so on).
- **48 unbound paints per frame are the Admin Shell instance's own pre-existing
  component debt** — confirmed, not assumed, by auditing the `Active=Contest`
  variant `6014:12944` directly: **44 bound / 49 unbound / 1 image fill**, the
  unbound being `akar-icons:search`, `Rectangle 223` (the sidebar wash, a
  deliberate literal per Decision Log #199), the nine `carbon:*` nav glyphs,
  `fi:chevron-down`, `Star`, and the avatar `Ellipse`.
- **4 additional unbound paints on frame 8 only**, named `25` / `26` / `27` /
  `28`, are inside the reused calendar instance — the `opacity: 0`
  adjacent-month day numerals Decision Log #178 deliberately left unbound
  (binding them makes invisible days visible). Documented exception, not new debt.
- Tokens used: `brand/navy`, `brand/green-tint` (12%), `color/background/surface`,
  `color/text/primary`, `color/text/secondary`, `color/text/on-navy`,
  `color/icon/inactive`, `brand/off-white`, `semantic/alert`, and the
  `color/shadow/elevated`-backed `elevation/menu` effect style. `brand/green`
  appears only as the RGB underneath `brand/green-tint`.
- **All destructive/blocking buttons are navy, not red.** `semantic/alert` is
  used only as a 3px non-text indicator bar on the two blocked-state banners —
  never as a button or text fill.

**Layout audit:** 0 overlaps across all 17 frames versus every other top-level
node on page `0:1`.

---

## 6. A real placement bug found and fixed

The first overlap check reported all 7 Row B frames colliding with a node named
"Admin Shell". That was not a stray instance — it is the **parked
`COMPONENT_SET 6014:12948` itself**, which occupies `x 37943–53343,
y −16153 → −14929` on the canvas. Row B had been placed directly on top of it.

Fixed by relocating Row B to `y = −14700` (clear below the component set) and
Row C to `y = −13200`. Re-ran the check: **0 overlaps**. Row A was already
clear, sitting between the Moderation row (bottom `−17878`) and the component
set (top `−16153`).

---

## 7. Reference-check and archive of the 9 stale frames

Scanned **all 123,335 nodes** on page `0:1` for prototype reactions targeting
any of the 9 frames or any of their descendants, for instances whose
`mainComponent` lives inside them, and for page-level flow starting points.

| Stale frame | Node ID | Inbound refs | Archived |
|---|---|---|---|
| Contest - Contest Task tab | `2363:2244` | 0 | Yes |
| Contest - scheduled contest task tab | `2363:3446` | 0 | Yes |
| Contest - Create Task | `5403:6640` | 0 | Yes |
| Contest - Schedule Task | `5403:6753` | 0 | Yes |
| Contest - Edit Task | `5403:6866` | 0 | Yes |
| Contest - Search Task | `5403:6979` | 0 | Yes |
| Contest - Delete Task | `5403:7092` | 0 | Yes |
| Contest - Empty State | `5405:8277` | 0 | Yes |
| Contest - Task Scheduled (Success) | `5405:8390` | 0 | Yes |

None is a flow starting point (all 13 page flows checked; none targets a stale
frame). All 9 were hidden, renamed with the em-dash `ARCHIVED — ` prefix plus
`(superseded by the Contest admin console screens — the "task" model has no
backend entity)`, and moved to an archive strip at `y = −13200`, `x = 55000`
onward (verified clear before the move). **Nothing was deleted.**

### A consequence caught before archiving, not after

Archiving `Contest - Schedule Task` would have dropped the **`Calendar for
scheduled task`** component (`2365:2033`) to **zero live instances** — its only
instance in the file was inside that frame, and two prior passes (Decision Log
#53, #178) invested in token-retrofitting both its variants.

Rather than silently orphan it, I reused it: the **Custom Weekly Windows** frame
now carries a real instance of the `calendar 1` variant (`2363:2242`,
308×562) as the open-state date picker for Week 1's "Opens at" field, anchored
directly beneath the input with a caption naming the reuse. Its stale "Schedule"
button label is overridden locally to "Apply".

**Still flagged for `figma-design-system`:** the `calendar 2` variant
(`2365:2034`) is now at zero instances, and the component's internal sample data
still reads "January 2022". Neither is mine to resolve from a screen-design
task — whether to retire `calendar 2` or refresh the sample month is a
component-level call.

---

## 8. Judgment calls

1. **No top-bar action button anywhere** (`Show Action Button = false` on all 16
   shells). Every screen has an in-content primary action, which is exactly the
   KEEP/LOSE rule Decision Log #51 already set for the Admin Panel.
2. **Phase chips use human labels with the raw value as a caption.** "Weeks 1–2"
   reads correctly for a non-engineer admin; a caption underneath states
   `phase = "weeks_1_2" · derived by ContestService.derivePhase(), never stored`
   so `figma-to-code` keeps the exact mapping.
3. **Inputs reuse `brand/green-tint` fills**, matching the auth/email retrofit
   convention (PR #100) and the existing Settings input rectangles, rather than
   inventing an outlined input style.
4. **Primary buttons are navy + `color/text/on-navy`**, following the Admin
   Panel convention established when Decision Log #52 rebound the 12 `#3539df`
   in-content buttons — not green.
5. **The hub is the only entry point to every write action.** Judge / Open the
   Final / Crown are all reached from the hub's phase-contextual primary, which
   means the sequential-judging rule is enforced by the UI's own shape before
   the backend ever has to return a 409.
6. **`GET /admin/contest/current` falling back to the most-recently completed
   cycle** is why the Crowned hub state is a real, reachable screen and is where
   the next cycle is started from — rather than the console going blank after a
   crown.
7. **Sample data is internally consistent across frames**: one September 2026
   cycle, the same three round windows, the same entrants, 9 weekly placings
   collapsing to 6 finalists. Frame 11's cloned data was corrected specifically
   to hold this invariant.

---

## 9. Draft Decision Log entry

The live docx Decision Log ends at **#241**.

> **#242 — Contest admin console screens designed against the real state
> machine (Task 2 of 3 for #239).**
> Resolved / built. 16 desktop screens + 1 design-notes frame added to Figma
> page `0:1`, replacing the 9 archived "Contest - … Task" frames whose Task Name
> / Hashtag / Description / Target Entry Count model never had a backend entity.
> Screens are built against the real cycle → 3 weekly rounds → open-final →
> crown state machine and the endpoints merged in #241: a 6-state phase-driven
> Contest Console hub (`GET /admin/contest/current`), Start a Cycle in three
> states incl. the optional explicit `rounds[]` path and the real 409
> (`POST /admin/contest/cycles`), Judge Week in four states incl. the supported
> empty-`winners` "thin week" and the sequential-judging block
> (`POST .../rounds/:week/results`), an Open the Final confirm dialog
> (`POST .../final/open`), Crown Winners with the finalist pool **deduplicated
> by `userId`** because `CrownCycleDto` rejects a repeated user
> (`POST .../crown`), and Cycle History (`GET /admin/contest/cycles`). No
> "delete cycle" screen exists anywhere — there is no endpoint and a cycle
> cannot be deleted or re-judged. No frame renders a field the backend does not
> return. All 16 screens carry a real `Admin Shell` (`6014:12948`) instance with
> `Active=Contest` and `Show Action Button=false` (per #51, every screen has an
> in-content primary). Light mode only; 0 unbound / 0 off-palette / 0
> `brand/green-tint-28` on every authored node; blocked and destructive actions
> are navy, with `semantic/alert` used only as a non-text indicator bar. The 9
> stale frames were reference-checked across all 123,335 page nodes (0 inbound
> references, none a flow start) then hidden, `ARCHIVED — ` prefixed and moved
> to an archive strip — not deleted. Archiving `Contest - Schedule Task` would
> have orphaned the twice-retrofitted `Calendar for scheduled task` component
> (#53, #178); it is instead reused as the open-state date picker on the Custom
> Weekly Windows screen. **Open follow-ups:** the `calendar 2` variant
> (`2365:2034`) is now at zero instances and the calendar's internal sample
> month still reads "January 2022" — both component-level calls for
> `figma-design-system`. **#239 stays Open** — Task 3 (`figma-to-code`) must
> still wire `apps/admin`'s Contest section to these screens and the four write
> endpoints.

Forward-pointer to append to **#239**'s Status cell:

> Task 2 of 3 complete — see #242 (`sprint-2/admin-contest-screens`): the
> Contest admin console screens are designed in Figma against the real state
> machine, and the 9 stale "task" frames are archived. #239 remains Open pending
> Task 3 (`figma-to-code`), which wires `apps/admin`'s Contest section to these
> screens and the four write endpoints.

---

## 10. Draft CLAUDE.md status bullet

To be added to "Where things stand right now", in the Admin Console area,
directly after the `sprint-2/admin-contest-read-endpoints` bullet:

> - **`sprint-2/admin-contest-screens` (figma-screen-builder, 2026-09-06) is
>   Task 2 of 3 resolving Decision Log #239 — the real Contest admin console
>   screens, designed against the state machine rather than the stale "task"
>   model. Figma design only, no app/backend code. Decision Log #242.** Report:
>   `docs/sprint-2-admin-contest-screens-report.md`.
>   - **16 desktop screens + 1 design-notes frame** on page `0:1`, in three rows:
>     a **6-state Contest Console hub** (`GET /admin/contest/current` — No Cycle,
>     Vacant, Weeks In Progress, All Weeks Judged, Final Live, Crowned; `week_1`
>     and `weeks_1_2` share one frame, being structurally identical), **Start a
>     Cycle ×3** (auto windows / explicit `rounds[]` / the real 409 block),
>     **Judge Week ×4** (open round, already-judged read-only, the *supported*
>     empty-`winners` "thin week", and the sequential-judging block), **Open the
>     Final (Confirm)**, **Crown Winners**, **Cycle History**, and the notes frame.
>   - **Crown Winners lists DISTINCT users, not the 9 weekly winners** —
>     `CrownCycleDto` takes `userId` and rejects a repeated user, so 9 weekly
>     placings collapse to 6 finalists. Designing one row per weekly winner
>     would have produced a screen that cannot submit.
>   - **No "delete cycle" screen exists anywhere** — no endpoint, and a cycle
>     cannot be deleted or re-judged. This is the single biggest departure from
>     the archived frames, which had a Delete Task screen.
>   - **No frame renders a field the backend does not return** (checked against
>     `contest.types.ts` and all three DTOs). Blocked states carry the backend's
>     real message strings.
>   - All 16 screens use a real **`Admin Shell` `6014:12948`** instance,
>     `Active=Contest`, `Show Action Button=false` (Decision Log #51 — every
>     screen has an in-content primary). Light mode only. **0 unbound / 0
>     off-palette / 0 `brand/green-tint-28` / 0 new colours on every authored
>     node** — proven by the shell-less notes frame auditing at 0, with the
>     per-frame 48 unbound confirmed to be the Admin Shell component's own
>     pre-existing debt. Blocked/destructive buttons are **navy**;
>     `semantic/alert` appears only as a non-text indicator bar.
>   - **A real placement bug was caught by the overlap check**: the parked
>     `Admin Shell` COMPONENT_SET occupies `x 37943–53343, y −16153 → −14929`,
>     and a whole row had been built on top of it. Two rows relocated; final
>     check 0 overlaps.
>   - **The 9 stale frames** (`2363:2244`, `2363:3446`, `5403:6640`,
>     `5403:6753`, `5403:6866`, `5403:6979`, `5403:7092`, `5405:8277`,
>     `5405:8390`) were reference-checked across **all 123,335 page nodes** —
>     0 inbound references, none a flow start — then hidden, `ARCHIVED — `
>     prefixed and moved to an archive strip. **Not deleted.**
>   - **Caught before archiving, not after:** archiving `Contest - Schedule
>     Task` would have dropped the twice-retrofitted `Calendar for scheduled
>     task` component (Decision Log #53, #178) to zero instances. It is instead
>     **reused** as the open-state date picker on the Custom Weekly Windows
>     screen. Still flagged for `figma-design-system`: the `calendar 2` variant
>     is now at zero instances, and the calendar's internal sample month still
>     reads "January 2022".
>   - **Decision Log #239 stays Open** — Task 3 (`figma-to-code`) must wire
>     `apps/admin`'s Contest section to these screens and the four write
>     endpoints. Until then that section remains a disclosed stub.
