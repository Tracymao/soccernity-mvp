# Sprint 2 — Decision Log #133–#137 Follow-up (Contest, Admin Moderation, Message Recipient Picker, Sports Hub, Club Picker)

**Branch:** `sprint-2/decision-log-133-137-followup`
**Agent:** figma-design-system (founder-authorised audit-AND-build override, same category as PR #124)
**Figma file:** `weZWWqggy9j13eX8bhFgs6`, page **Soccernity** (`0:1`)
**Date:** 2026-09-01

---

## 0. Docx catch-up (done first, verified before any Figma work)

CLAUDE.md's PR #124 bullet already carried a "Follow-up resolution (post-merge)" paragraph
naming **Decision Log #138** (appeal routing — reviewed by a second admin/moderator, never the
original reviewer) and **#139** (recipient-picker shape — search bar + default follow-list,
combined) — both founder-decided in conversation, neither ever written into the live docx.

Transcribed both into Build Plan §9 (Table 6) via python-docx, deep-copying the last row's XML:

- **#138** — text matches CLAUDE.md's own wording exactly (see `Decision needed`/`Status`
  columns in the docx).
- **#139** — same.
- Forward-pointer appended to **#135**'s own Status cell: *"→ RESOLVED (appeal routing) by
  Decision Log #138: an appeal is reviewed by a SECOND admin/moderator, never the original
  reviewer; the moderation-queue design must make this routing legible…"*
- Forward-pointer appended to **#136**'s own Status cell: *"→ RESOLVED (recipient-picker shape)
  by Decision Log #139: ONE recipient-picker screen combining a search bar…with a default
  follow-list section…"*

**Verified programmatically before starting any Figma work**: the table runs **#1–#139**
contiguously, zero gaps, zero duplicates; #135 and #136 both carry the forward-pointer text
above.

---

## 1. CONTEST (Decision Log #134) — built

### 1.1 Retrofit of the 3 legacy frames — done first, as required

**Re-measured before touching anything** — the "100% unbound legacy frames" characterisation
in Decision Log #134 (inherited from PR #108's own flag) was **stale**. A live paint-binding
audit found all three frames were already mostly bound (from PR #107/#108's prior partial
work):

| Frame | Bound | Unbound | `brand/green-tint-28` |
|---|---|---|---|
| `2155:1062` Contest details | 78 | 0 | 8 |
| `2072:5584` Entries & ranking | 178 | 0 | 8 |
| `2094:994` Voting | 144 | 10 (`#d9d9d9`) | 8 |

Fixed: **24× `brand/green-tint-28` → `brand/green-tint`** (Decision Log #47 — 8 per frame,
mostly the shared Navbar instance's search-pill *override* inside each frame, not the shared
component itself) and **10× unbound `#d9d9d9` fan-avatar placeholders → `brand/green-tint`**
(on `2094:994` only — matching the avatar-placeholder convention already used elsewhere,
Decision Log #113). Verified after: **all 3 frames 0 unbound, 0 `brand/green-tint-28`.**

### 1.2 Mobile — built (390px convention, Decision Log #86)

- **Contest — Details — Mobile** — new frame, reflows `2155:1062`'s three text sections
  ("How Contest works" / "Task for this week") + a full-width "Join Contest" button + a
  "View leaderboard ›" link, using the same `header 4 — mobile` navbar instance every other
  Community-pillar mobile screen uses.
- **Contest — Entries & Ranking — Mobile** — reflows `2072:5584`'s horizontal entry carousel
  into a vertical stack of navy entry cards, followed by the "Contest Leaderboard" table
  reflowed into stacked rank/name/votes rows (card-row pattern matching the Leaderboard mobile
  precedent).
- **Contest — Voting — Mobile** — reflows `2094:994`: video placeholder, author row, caption,
  Vote button + vote count, and a compact "Last Week on Contest" mini-table panel.

All three built with `figma.createAutoLayout()` throughout (not manual
`createFrame()+layoutMode`) specifically to avoid the sizing-mode bug documented in §4 below.
0 unbound paints in every new node.

### 1.3 New states — built (desktop only this pass; mobile deferred, see below)

- **Contest — Already Voted** — cloned from the voting page (`2094:994`) so every card/panel/
  token binding is inherited; the "Vote" button becomes a muted "Voted" label, and a new
  banner ("You've already voted this week. Come back Monday for the next challenge.") is
  inserted directly under the vote row, with the surrounding card resized so nothing overlaps.
- **Contest — Between Weeks** — cloned from the details page (`2155:1062`); the "Task for this
  week" section becomes "Between weeks" with copy explaining voting has closed and results are
  pending, and the "Join Contest" CTA becomes "View this week's results ›". Text-only edit, no
  new nodes inserted — chosen deliberately after the Already-Voted build showed that inserting
  new nodes into this frame's non-auto-layout (absolute-position) structure needs careful
  manual repositioning of every sibling below the insertion point.

**Deferred — Decision Log #140 (new).** Mobile equivalents of these two new states were
**not** built this pass. Both legacy source frames use absolute (non-auto-layout) positioning
internally, which made even the *desktop* edits require multiple correction passes to avoid
overlap (see §4) — reflowing the same edits into a fresh 390px mobile frame is real, additional
work, not a copy-paste. Scoped out as a conservative trim to keep this already-large pass
tractable; flagged as a fast-follow rather than silently treated as done.

### 1.4 Bants — built (2 of the flagged gaps; 1 remains, flagged)

- **Bants — Search Filter — Mobile** — the pre-categories "Filter" panel (`2459:7671`,
  Categories All/My Bants toggle + Date From/To + Tag input + Search button) had no mobile
  equivalent at all; built fresh at 390px using the same fields/order as the desktop panel.
- **Bants — No Results (Empty State) — Mobile** — Decision Log #134 flagged that Bants had no
  empty states anywhere; built one generic "No bants found" state (icon, message, "Create New
  Topic" CTA) covering both an empty search result and a filter that matched nothing.

**Still open — Decision Log #144 (new).** One of the two flagged missing-mobile-variant gaps
(a second "search filter categories" mobile state, mirroring `2459:12447`'s
"User's own created bants" categories view vs. the existing mobile's "All feed" categories
view) is **not** built this pass — the existing `5650:8221` already covers the categories
picker pattern once; a second near-duplicate state was judged lower value than the two items
actually built. Flagged, not silently dropped.

---

## 2. ADMIN MODERATION (Decision Log #135, resolved by #138) — built what's unblocked

Built on **fresh clones of the existing "Admin Shell" group** (`5402:7215` — the same shell
every other unified Admin screen uses), with a new **"Moderation"** nav row inserted right
after "Users" (reusing the `el:ban-circle` icon already present in this file for the
Users-frame's own block action — thematically apt, no new icon invented). **Admin Panel
colour/token treatment was not touched anywhere** — every fill on the shell itself is the
shell's own, unedited; only the new content areas and the one new nav row (built the same
way `Frame 5746`'s structural template already builds every other row) use the file's existing
tokens.

**Built (3 new screens, all 0 unbound in the new content):**

- **Admin — Moderation Queue** — a table (Reported / Type / Reason / Reporter / Status /
  Review) with 6 dummy `Report` rows (post/comment/user targets, varied reasons/statuses,
  matching §3's `Report` entity fields), an Open Reports / Appeals tab pair, and an **appeal-
  routing callout** stating the rule plainly: *"Appeals against your own reviews never appear
  in your queue — they're routed to another moderator automatically."* This makes Decision Log
  #138's routing rule legible in the design itself, not just a backend rule with no visible
  trace — per the brief's explicit requirement.
- **Admin — Report Detail & Action** — reported-content card (type, author, content preview)
  + report-details card (reporter, reason, submitted, status) + four action buttons (Dismiss
  Report / Remove Content / Warn User / Suspend User, all navy — no destructive-red token
  invented, matching the existing Admin precedent for delete actions, Decision Log #52) + a
  note stating both the reporter and reported user are notified of the outcome (§8.4).
- **Admin — Appeal Review** — a routing banner naming the original reviewer ("Adaeze M.") and
  stating why a different moderator is reviewing; a read-only "Original Decision" card; the
  appeal reason as submitted by the reported user; Uphold / Overturn actions; and a note that
  both users are notified of the final outcome.

**Correction to PR #124's own report — Decision Log #142 (new).** PR #124 flagged
`917:218` ("Users – team members") as "admin-role management, a different thing" from a real
`GET/PATCH /admin/users` list/detail view. Re-examined directly (screenshot + structure) before
building anything: **that flag was wrong.** `917:218` is already a real platform-user list —
Username / Date Joined / Status (Active/Inactive) columns, block and delete row actions — which
substantially serves `GET/PATCH /admin/users` today. No redundant user-list/detail screen was
built this pass; building one would have duplicated an existing, working screen. A user-*detail*
drill-down (beyond the existing list+inline-actions) remains a real, smaller gap, noted but not
built here — lower priority than the moderation-queue work this pass actually delivered.

**Genuinely out of reach — not built, per the brief's own instruction:**

- **Moderation-outcome and appeal-decision email templates.** Flagged as
  **Decision Log #143 (new)** rather than built — consistent with this file's existing
  precedent for the 5 already-unwired email templates (Decision Log #56/#59, PR #104): a
  template needs real backend send-trigger context and copy matching an actual event; inventing
  both for an event that doesn't exist server-side yet would misrepresent placeholder as
  built-and-ready.
- **Propagating the new "Moderation" nav item to the other 26 existing Admin shells** —
  **Decision Log #141 (new)**. Added only to this pass's own 3 new screens' shells, exactly the
  same "new item on new screens only, propagation is its own follow-up pass" precedent already
  established twice in this file for "Categories" (Decision Log #49) and "Competitions"
  (Decision Log #76, closed by PR #110). Not done here — retouching the other 26 Admin frames
  is exactly the kind of existing-frame edit the hard constraint (don't touch Admin Panel's
  colour/token treatment) counsels against doing incidentally inside an unrelated task.
- Any backend/schema work — Admin moderation is still Sprint 5; these three screens are ahead
  of the backend, the same relationship every other design-ahead-of-backend pass in this file
  has had.

---

## 3. MESSAGE RECIPIENT PICKER (Decision Log #136, resolved by #139) — built

**Message — New Conversation (Recipient Picker) — Desktop** (cloned from the real Message
Inbox shell, `5708:8184`, so the navbar + left conversation-list pane are the genuine, existing
Message pillar chrome — not a new visual language) and **— Mobile** (cloned from the real
Inbox — Chat List mobile frame, `5709:8354`).

Both combine, per Decision Log #139: a **search field** ("Search people by name or username")
and a **default "PEOPLE YOU FOLLOW" list** shown before any search term — 5 sample rows, each
with a "Message" affordance. Either path lets the person pick a recipient.

- **Backend-pending field, built anyway per convention** — the search bar is a real, present
  UI element even though no people-search endpoint (`GET /search?q=` or similar) exists yet.
  This follows the same "visually present, flagged, not omitted" rule Decision Log #58 already
  established for Bio/Location/Username/Avatar — the brief asked for exactly this treatment.
- **Restricted-pending exclusion is shown by absence, not by new copy** — the 5 sample
  follow-list people and the (unbuilt) search results are simply never populated with a
  restricted-pending user; no "this person is unavailable" message was invented, per the
  brief's explicit instruction ("show this exclusion happening… don't invent new copy").
- Reused the Message pillar's real shell (navbar, list-pane structure) rather than building a
  new one, per the brief.

---

## 4. A genuine, reusable finding from this pass: two Figma-authoring pitfalls, now documented

Building the Admin screens from scratch (rather than cloning) surfaced two real bugs, both
fixed and worth recording for future passes in this file (belongs alongside the existing
`setBoundVariableForPaint`-literal and paint-opacity/variable-alpha gotchas already noted in
CLAUDE.md's Figma notes):

1. **`setBoundVariableForPaint(paint, "color", variable)` keeps whatever literal `color` you
   passed in the paint object — and in this session, a screenshot taken immediately after
   binding several nodes in the same pass showed that placeholder literal, not the variable's
   real resolved colour**, even though `boundVariables.color` was correctly set underneath (a
   direct property read confirmed the binding was real). Passing a generic grey placeholder
   (`{r:0.5,g:0.5,b:0.5}`) — instead of the token's actual resolved RGB — turned a whole sidebar
   nav into visibly grey, unreadable boxes on first build. **Fixed by resolving each variable's
   real Light-mode RGB once (via `valuesByMode`) and using that as the paint literal before
   binding**, matching the precedent already flagged in this file for the homepage-rebuild
   pass ("pass the variable's resolved value, not a placeholder").
2. **`figma.createFrame()` + setting `.layoutMode` alone does *not* make the frame hug its own
   content** — it silently keeps Figma's default 100×100 size unless `primaryAxisSizingMode`/
   `counterAxisSizingMode` are explicitly set to `"AUTO"`. This produced literal 100px-tall
   "Field" rows with invisible content in the first Admin build. **Fixed** by explicitly setting
   both axis modes on every hand-built auto-layout frame, and — going forward in this same
   pass — by preferring **`figma.createAutoLayout()`** (which hugs both axes by default) over
   manual `createFrame()+layoutMode`; every frame built after this fix (all Contest and Bants
   mobile screens) used `createAutoLayout()` throughout and needed zero sizing-mode correction
   passes.

Neither bug affected the final, verified state of anything in this PR (both were caught and
fixed before any frame was left in a broken state), but both cost real rebuild cycles and are
worth a future pass folding into the file's own Figma notes in CLAUDE.md.

---

## 5. SPORTS HUB MOBILE (Decision Log #133) — confirmed still blocked, not touched

Checked Decision Log #6 (sports-data vendor selection) directly before doing anything: **still
`Open — blocks Sprint 4`**, unchanged since Decision Log #133 was raised. Per the brief's own
instruction, left entirely untouched — this is Sprint 4 scope. No forward-pointer needed beyond
noting the re-confirmation.

---

## 6. CLUB PICKER EMPTY-STATE WORDING (Decision Log #137) — built

**Club Picker — 6 No Clubs Available Yet** (desktop, cloned from the "No Clubs Match Filter"
frame) **and — Mobile**: the search-filter value is cleared (no filter text — this state means
the catalogue itself is empty, not "your filter matched nothing"), the empty-state message
becomes "No clubs available yet" with a new subtext explaining clubs are still being added and
the step can be skipped, the (now-meaningless) "Load more" button is removed, and the frame's
own design note is rewritten to record the distinction and cross-reference Decision Log #137
directly on the canvas.

---

## 7. New Decision Log candidates raised by this pass

Added to Build Plan §9 (Table 6) as rows **#140–#144**, continuing from #139. Forward-pointers
appended to **#133** (re-confirmed still blocked), **#134** (partially resolved — see detail),
**#135** (screens now built, cross-referencing this report), **#136** (screens now built,
cross-referencing this report), **#137** (resolved/built).

| # | Subject | Disposition |
|---|---|---|
| 140 | Contest "Already Voted" / "Between Weeks" mobile equivalents — not built this pass | Deferred; desktop states are real and correct, mobile reflow is real remaining work (the legacy frames' absolute-position internals make this non-trivial), not silently treated as done |
| 141 | New Admin "Moderation" nav item exists only on this pass's own 3 new screens' shells | Deferred — propagating to the other 26 existing Admin shells is its own follow-up pass, same precedent as "Categories"/"Competitions" (Decision Log #49/#76) |
| 142 | Correction: `917:218` ("Users – team members") is already a real `GET/PATCH /admin/users` list view, not admin-role management as PR #124 mischaracterised it | Resolved (correction recorded); no redundant screen built |
| 143 | Moderation-outcome / appeal-decision email templates — still not built | Deferred, consistent with the 5 other unwired-template precedent (Decision Log #56/#59) |
| 144 | Bants — one of two flagged missing mobile-variant states (a second categories view) still not built | Deferred, minor, flagged rather than silently dropped |

---

## 8. Verification

- **14 new frames built** across Contest (5), Bants (2), Admin (3), Message (2), Club Picker
  (2); plus in-place retrofit edits to the 3 legacy Contest frames (no new frames from that
  step).
- **0 unbound paints** in every node authored this session, confirmed by a final programmatic
  sweep across all 21 frames touched/built this pass (the only 12 unbound paints found belong
  to Reset Password — Success desktop's inherited `undraw` illustration skin/hair tones from
  the *prior* PR #124 pass — the already-documented, accepted exception, not new).
- **0 `brand/green-tint-28`** anywhere touched this pass (Decision Log #47), including the 24
  instances fixed inside the Contest retrofit.
- **0 new colours** — every authored paint bound to an existing Soccernity Theme Light
  variable.
- **Admin Panel colour/token treatment: untouched** on every pre-existing frame (hard
  constraint honoured) — the new Admin screens reuse the shell's existing, unedited fills.
- Screens visually verified via `get_screenshot` after each build step, with two real
  sizing/rendering bugs caught and fixed mid-pass (§4) rather than left in a broken state.
- **No application or backend code changed** — Figma + docs only.
