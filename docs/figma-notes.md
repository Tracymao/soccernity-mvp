# Figma notes (moved out of CLAUDE.md)

Moved verbatim from CLAUDE.md on 2026-11-27. The first 6 notes (file key, pages, tool gotchas) also stay in CLAUDE.md.
Use grep -n and sed -n ranges. Do not open the whole file.

## Figma notes

- File: "Soccernity-MVP", key `weZWWqggy9j13eX8bhFgs6`. It has three pages: **"soccernity Cover page"** (`1860:2500`, cover only — logo and background, nothing else; originally named "soccernity"), **"Soccernity"** (`0:1`, this is where every real screen lives — Community, Sports Hub, Admin Console, Auth, Banter Rooms, ~263 nodes; originally named "Page 1"), and **"dump"** (`2155:1285`, unused scratch, ignore it). Page IDs are stable across the rename — if referencing a page, prefer the ID over the name where possible.
- `get_metadata`'s default, un-scoped page listing is unreliable on this file — it only ever surfaces the cover page (`1860:2500`), not the real content page (`0:1`). Don't trust it to enumerate pages. Fetch page `0:1` directly instead, or use `use_figma` to run `figma.root.children` directly if you need to confirm what pages exist.
- `use_figma` operates on whatever the Figma desktop app currently has open locally — a completely separate connection from key-based reads like `get_metadata`. If a read via file key returns real content but `use_figma` doesn't match, the desktop app almost certainly has the wrong file or page active, not a permissions or data problem. Confirm the correct file is open and frontmost before trusting any `use_figma` result.
- This file has one real Figma variable collection: **`Soccernity Theme`**
  (`VariableCollectionId:5096:2`), modes **Light** (`5096:0`, default) /
  **Dark** (`5096:1`), **17** COLOR variables (`sprint-2/drawer-shadow-and-scrim-token` added `color/overlay/scrim`; `sprint-2/elevation-overlay-effect-style` added `color/shadow/overlay-ambient` and `color/shadow/overlay-key`, Decision Log #182) — Sprint D created the original
  ten, PR #96 added `color/text/on-navy` and `brand/off-white`, PR #114
  added `semantic/alert` (`VariableID:5670:8226`, `#FA0606`, Light=Dark,
  Decision Log #99), and `sprint-2/design-cleanup-tokens-renames` added
  `color/shadow/elevated` (`VariableID:5973:2`, Light `brand/navy` @ 14% /
  Dark `#0D0F21` @ 45%, scope `EFFECT_COLOR`, Decision Log #118) — the
  file's first shadow token, paired with a new **effect style**
  `elevation/menu` (`DROP_SHADOW` x0 y4 blur16 spread0) that binds its
  colour to that variable. Confirm this
  directly (`get_variable_defs` / `figma.variables.getLocalVariableCollectionsAsync()`)
  before assuming any brief's claim about whether variables exist in this file
  — one already has gotten this wrong (`sprint-2/homepage-rebuild`'s second
  pass, which asserted the file had no variables at all; it didn't, and the
  agent caught it by checking live rather than trusting the brief). Full
  variable/value table in `docs/sprint-2-homepage-rebuild-report.md` §0.1 and
  `docs/sprint-2-homepage-rebuild-variables-report.md` §2.

### Standing Figma check (Decision Log #404, item 14)

Do NOT pull the whole canvas with `get_metadata` at depth 4 or more: page `0:1` holds about 139,000 nodes and the call cannot return (passes F2, G1, G2, H and I all hit this). The before/after check for any Figma pass is instead a `findAll` count per top-level node plus a hash of the top-level node ids, taken before and after the pass (ids unchanged and in order, or every difference explained). Nothing deleted unless the brief names it.

### Figma-authoring gotchas

**This subsection did not exist before `sprint-2/decision-log-204-208-cleanup`,
despite at least five prior sessions each independently finding a gotcha and
writing "belongs in the file's standing Figma notes" or "recommend folding
into the file-wide Figma-notes gotcha list" — the exact drift this project's
own "Keeping this file current" section exists to prevent.** Decision Log
#199 and #201 were the two most recently flagged as explicitly still open
pending this fold-in; both are closed by their entry here. The other
scattered gotchas named inline in individual session bullets throughout
"Where things stand" (the manually-set-`.y`-on-an-`AUTO`-positioned-auto-layout-
child rule, etc.) were **not** swept into this list by this pass — only
#199, #201, and the `frame.resize()`-on-GROUPs gotcha this same cleanup
session's own task text pointed at (which, on inspection, also did not
actually live in a real standing-notes section yet) are consolidated here.
A full sweep of the remaining scattered gotchas into this section is a
real, still-open follow-up, not done by this entry.

- **`frame.resize()` on a `layoutMode: NONE` (absolute-layout) frame applies
  each leaf's own constraints, and `GROUP`s have no constraints of their
  own** — their leaves resolve independently and drift by differing amounts
  when the parent frame is resized. Reparenting children into a fresh,
  correctly-sized shell (then re-asserting each child's snapshotted `x`/`y`)
  is the safe way to change a frame's width without corrupting
  absolute-positioned legacy content. Found independently by both the
  Articles Page split and `sprint-2/legal-pages-navbar-retrofit` sessions on
  different content, corroborating each other.
- **A paint bound to a variable that does not itself carry alpha (e.g.
  `brand/navy`, a plain opaque RGB), combined with a separate fractional
  paint-level `opacity`, silently resets to `opacity: 1` specifically at
  `createInstance()` time** — not only at `setBoundVariableForPaint()`
  construction time, which is the only timing this file's notes previously
  covered. Variables that carry their own alpha (`brand/green-tint`,
  `color/text/secondary`) are unaffected. Fix: use a literal, unbound paint
  at the same resolved value/opacity instead of a bound one for that specific
  paint — same visual result, no new colour introduced, immune to the bug.
  Found on the Admin Shell sidebar wash (Decision Log #199,
  `sprint-2/admin-shell-componentization`). No exhaustive file-wide audit
  for other occurrences of this exact pattern has been done. See also the
  bind-time alpha gotcha below (Decision Log #117) — a different bug with a
  different fix.
- **A paint bound to a variable takes its alpha from the variable's own
  value, not from any fractional `opacity` set on the paint.** `{opacity:
  0.3}` followed by `setBoundVariableForPaint(..., brand/navy)` yields a
  fully opaque paint, because `brand/navy` is `#282E65` at alpha 1 — the
  translucency is silently discarded at bind time, with no error. Consequences:
  (a) translucency must come from a token that carries its own alpha
  (`brand/green-tint` 12%, `color/icon/inactive` 15%, `color/text/secondary`
  70%), or opacity must be re-applied to a copy of the paint *after* binding;
  (b) a prior "0 unbound paints" audit can pass while a paint still renders at
  the wrong alpha — the binding metadata is correct, the rendered alpha isn't.
  Found in `sprint-2/mobile-settings-community-message-rebuild` (Decision Log
  #117), where it silently produced two solid-navy scrims. See also the
  `createInstance()`-time opacity reset above (Decision Log #199) — a different
  bug with a different fix.
- **`figma.union()` / `figma.subtract()` (and presumably
  `figma.intersect()`/`figma.exclude()`) discard the input shapes' own
  fills**, resetting the resulting `BOOLEAN_OPERATION` node to Figma's own
  default gray (`#D9D9D9`) regardless of what colour the input primitives
  were filled with. The fix must be applied to the resulting boolean node
  itself, not its now-irrelevant, consumed input primitives — always
  re-verify with a screenshot after any boolean operation, since this
  produces no error, only a silently wrong colour. Found while building the
  8 new Admin Shell nav icons (Decision Log #201,
  `sprint-2/admin-panel-fast-follow`) — all 8 initially rendered pale gray
  before this was caught.
- **`await` inside a `Array.prototype.forEach` callback is a no-op / syntax
  error** in the `use_figma` environment — the callback is not async, so an
  `await` there either throws or is silently ignored and the loop races
  ahead. Use `for…of` or an indexed `for` loop whenever the body awaits.
  Found in `sprint-2/settings-display-leaves` (Decision Log #246).
- **`node.query()` / `figma.currentPage.query()` selectors reject non-ASCII
  characters** — `query('FRAME[name*=Row — ]')` fails with
  `Invalid selector: unexpected character (0xe2)` on the em-dash. This bites
  in this file specifically because **the em-dash is the house naming
  convention** ("Settings — …", "Nav Row — …"). Use
  `findAll(n => n.name.indexOf('Row ') === 0)` (or an `.includes()`
  predicate) instead. The same session confirmed **`use_figma` rolls a
  failed run's writes back atomically** — a partially-built frame from a
  selector that threw mid-run did not persist (verified by reading the
  canvas before retrying, not assumed). Decision Log #246.
- **`NAVIGATE` reactions cannot be set on any descendant of a `COMPONENT`**
  (a variant, or a standalone component) — Figma rejects with *"the source
  may not be a valid prototype source … destinations must be a different
  top-level frame"*. Same family as the `OPEN_OVERLAY`-destination limit in
  Decision Log #103. Set `NAVIGATE` as a **per-instance override** on each
  instance instead; `ON_HOVER → CHANGE_TO` is fine on component descendants.
  Decision Log #249 (`sprint-2/settings-shell-componentization`).
- **`node.clone()` parents the clone under `figma.currentPage`, not under
  the original's parent** — and `figma.currentPage` **resets to the first
  (cover) page on each `use_figma` call**. Clones can silently land on the
  cover page; `page.appendChild()` them back onto `0:1` before any operation
  that requires same-page nodes (e.g. `combineAsVariants`). Decision Log #249.
- **`instance.setProperties({...})` invalidates the node handle** — a
  `.reactions =` (or other mutation) on the *same* handle immediately after
  fails ("invalid prototype source"). Re-fetch the node from its stable
  parent (by index) between a variant swap and any further mutation.
  Decision Log #249.
- **`component.clone()` drops instance-level reaction overrides on nested
  instances** — inherited reactions (e.g. `ON_HOVER` from an underlying
  variant component) survive the clone, but overrides you set on a nested
  instance do not. Re-apply nested-instance reactions explicitly on every
  cloned variant. Decision Log #249.
- **`component.clone()` on a variant `COMPONENT` also drops
  `componentPropertyReferences` on its child nodes that point to a
  set-level property key.** Cloning a variant to seed a new variant, then
  `set.appendChild(clone)`, produced a clone whose child (`Group 825`) had
  `componentPropertyReferences: {}` even though the source variant's same
  child was bound to a set-level property key. Re-apply the reference on
  the clone's child after the append. Distinct from the nested-instance
  *reaction* drop above — this is a `componentPropertyReferences` binding
  on a plain child node. Found in `sprint-5/grassroots-calendar-component-fix`
  (Decision Log #263). **Reassuring companion finding:** adding a BOOLEAN
  component property bound to `node.visible` on an existing set does NOT
  force instances that already carry a manual `visible` override to the
  property default — Figma migrates the manual override into the property
  value, preserving appearance (verified on the Grassroots-desktop calendar
  instances, DL #262).
- **A repeated card/row list cloned from another screen is not necessarily
  structurally uniform — don't index into children positionally, and
  re-audit cloned fills for *semantic* correctness, not just binding.**
  Cloning `Clubs — Browse`'s four visually-identical cards threw
  `TypeError: cannot set property 'characters' of undefined` because one
  card's logo slot was a different variant (`Club Logo — Placeholder (no
  logoUrl)`) with no text child; that same card's tile was also bound to
  the wrong token (`color/icon/inactive` rather than `brand/green-tint`) —
  a correctly-bound but semantically wrong paint that a "0 unbound / 0
  off-palette" audit passes silently. Prefer `findOne(n => n.type ===
  'TEXT')` with a clone-a-donor fallback over `children[0]`, and always
  screenshot cloned repeated content. Found in
  `sprint-5/grassroots-teams-browse` (DL #265). (Also re-confirmed there,
  already under DL #246: `use_figma` rolls a failed run's writes back
  atomically — the `TypeError` left zero partial writes on the canvas.)
- **`setBoundVariableForPaint(paint, 'color', variable)` can leave the
  paint rendering the literal placeholder colour you passed in, even
  though the binding metadata itself is genuinely correct** — reproduced
  directly: two icon-disc rows, built with a `{r:0,g:0,b:0}` (black)
  placeholder base paint bound to `brand/green-tint`, rendered solid
  opaque black in the screenshot despite `avatar.fills[0].
  boundVariables.color.id` correctly reporting the right variable ID both
  immediately after assignment and on a later independent read. Two
  sibling rows built the exact same call but with a *resolved* base paint
  (the variable's own Light-mode RGB+alpha, fetched via
  `variable.valuesByMode[modeId]`) rendered correctly from the first
  screenshot. Fix: always resolve the token's real current-mode RGB(+A)
  once and pass *that* as the base literal before binding — never a
  placeholder, not even `{0,0,0}` — corroborating the scattered
  "generic grey placeholder renders as visibly grey" gotcha already noted
  inline in the `sprint-2/all-sections-followup-mobile-field-audit`
  bullet elsewhere in this file (not yet swept into this consolidated
  list), now confirmed to also apply when the placeholder is a
  *different* colour from the target, not just a visibly-wrong shade of
  the same family. Found in `sprint-3/notification-centre-design-finalize`.
- **`sprint-3/banter-messaging-to-code` (figma-to-code, 2026-09-13) wires
  both Banter Rooms and Direct Messaging into `apps/web` — both backends
  were fully built and tested (`BanterModule` DL #275/#276,
  `MessagingModule` DL #277) but had zero frontend presence:
  `BanterPage.tsx` was still a disclosed sample-data stub and Messaging
  had no page, route, or client at all. Also closes a real backend gap
  with founder sign-off — see below. Decision Log **#280**;
  forward-pointers appended to **#139, #166, #275, #277**.**
  - **New `api/banter.ts`** — the full client (create/list/search/mine/
    join/leave/post-to-room), mirroring `api/grassroots.ts`'s shape
    (own `BanterApiError`, `errorMessageFrom`, cursor pagination).
    **`BanterPage.tsx` rewritten to real data** — `banterData.ts`'s
    dummy `ROOMS` constant is gone; the room list, join/leave and room
    creation are all real. **Search judgment call**: "All" switched
    from the old client-side-only filter to the real server-side `?q=`
    filter (`GET /banter-rooms`, debounced 300ms — the `GrassrootsPage`
    city-filter precedent), since a real search endpoint now exists;
    "My Bants" stays a client-side filter over the loaded
    `GET /banter-rooms/mine` page, since that route takes no `q` param.
    Trending News / Fixtures (Decision Log #6) / Suggested remain
    illustrative — unchanged, no endpoint exists for any of them.
  - **New `BanterRoomPage.tsx` (`/banter/:roomId`)** — a single room's
    feed + posting. **No Figma frame exists for this screen** (the
    Bants frames only ever show the room *list*) — built plain and
    flagged, the same "no dedicated screen exists, built plain"
    precedent `ClubFanPage.tsx`/`EditProfileModal.tsx` already
    established. Reuses the real `PostCard.tsx` for the room feed
    (`GET /banter-rooms/:id/posts` — identical `FeedPage` shape to
    `GET /posts/feed`, since `BanterController` delegates server-side
    to `FeedService.getBanterRoomFeed`) and a plain, contentText-only
    composer (`POST /banter-rooms/:id/posts`) — membership-gated
    server-side, rendered as a "Join this room to post in it." prompt
    for a non-member rather than a broken form.
  - **New `api/messaging.ts`** — the full client covering every
    `messaging.service.ts` endpoint (start/find conversation, list
    conversations, list/send messages, mark-read), same conventions.
  - **New `MessagesPage.tsx` (`/messages`)** — the inbox
    (`GET /conversations`), each row showing the other participant's
    real name, a last-message preview, and a real per-caller
    `unreadCount`; a hard-deleted other participant (Decision Log #44's
    cascade) renders "Deleted user" rather than crashing.
  - **New `NewConversationPage.tsx` (`/messages/new`)** — the recipient
    picker, converting Decision Log #139's design. **Search judgment
    call, flagged**: no people-search endpoint exists anywhere in
    Section 4, so the search field is a client-side filter over the
    caller's own `GET /users/:id/following` page (the only "who can I
    message" data source that exists) — labelled "Search people you
    follow", never implying a site-wide directory. Selecting a person
    calls the real, idempotent `POST /conversations` (find-or-create).
  - **New `ConversationPage.tsx` (`/messages/:conversationId`)** — the
    thread. `GET /conversations/:id/messages` returns newest-first
    (matching `GET /clubs/:id/feed`'s direction); each page is reversed
    here so the screen reads oldest-at-top, newest-at-bottom, and "Load
    earlier messages" *prepends* the next (older) page. **Thread-header
    identity is a genuine, disclosed limitation**: there is no
    `GET /conversations/:id` (`messaging/README.md`'s own "Not built"
    list) and `Message` itself carries only an opaque `senderId`, never
    a display name — so `MessagesPage.tsx`/`NewConversationPage.tsx`
    both pass `otherParticipant` via router `state` on navigation, and
    a direct visit / hard refresh (no state) falls back to a generic
    "Conversation" heading rather than inventing a name. `PATCH
    /conversations/:id/read` fires once, non-blocking, right after the
    thread's first page loads.
  - **Nav wiring**: `navigation.ts`'s `Messages` drawer item flipped
    `available: true` (same precedent as Clubs/Grassroots/Settings);
    `Header.tsx`'s top-bar messages icon is now a real, enabled `Link`
    to `/messages` — **closes the messages half of Decision Log #166**
    (Notifications stays disabled — separate module, no `apps/web`
    conversion of the finalised Notification Centre design yet).
  - **A real backend gap closed, with founder sign-off (the one
    exception to this PR's otherwise `apps/web`-only scope)**:
    `messaging.service.ts`'s own `sendMessage` comment had flagged that
    nothing ever marked the collapsed `'message'` `Notification` read
    when the recipient opened the conversation — and there is no
    notifications endpoint at all for a frontend to call instead
    (`notifications/README.md` is still a bare placeholder).
    `markConversationRead` now also runs one additional, tightly-scoped
    `notification.updateMany` (`userId: callerId, type: 'message',
    payloadRefId: conversationId, read: false → true`) in the exact
    same request `ConversationPage.tsx` already calls on thread-open —
    no new endpoint, no schema change, no Figma touched.
    `messaging/README.md`'s stale "No `Notification` on message send"
    section (it predated `sprint-3/notification-triggers-message-
    fixture-contest`'s actual wiring) is corrected in place in the same
    PR, along with its test count (30 → 34, since that same trigger PR
    added 3 tests here and never updated this line — another instance
    of the drift this file's own "Keeping this file current" section
    describes).
  - **Verified**: `services/api` mocked suite **52 suites / 738 tests, 0
    failures** (up from 737 — 1 new `messaging.service.spec.ts` case);
    `nest build` + `npm run lint` clean. **e2e suite not re-run** — no
    Docker in this session; the change is a second, independent
    `updateMany` inside an already-e2e-covered request (no new raw SQL,
    relation, or isolation-level reasoning), the same class of change
    `test/README.md`'s own guiding principle keeps at the mocked layer
    — flagged for whoever next runs the real e2e suite to confirm
    `messaging.e2e-spec.ts` still passes unchanged (14 tests,
    untouched). `apps/web`: `npx tsc --noEmit` clean, `npm run lint`
    clean, `npm run build` clean, `npx vitest run` **36 files / 244
    tests, 0 failures** (up from 32/215 — `BanterPage.test.tsx`
    rewritten 5→8 tests for the real client, new `BanterRoomPage.test.tsx`
    +6, `MessagesPage.test.tsx` +6, `NewConversationPage.test.tsx` +5,
    `ConversationPage.test.tsx` +8, `Header.test.tsx` +1).
    Dev-server smoke test: `/`, `/banter`, `/banter/:roomId`,
    `/messages`, `/messages/new`, `/messages/:conversationId` all HTTP
    200, clean log. No real browser/Playwright check available — same
    ceiling as every prior `apps/web` PR.
  - Not merged — founder's call after review.
- **`sprint-3/community-groups-design` (figma-screen-builder, 2026-09-13)
  designs Community Groups (Sprint 3, Decision Log #1) — the first Figma
  screens this feature has ever had. Figma design only, no app/backend
  code; no schema exists yet either (a future `backend-api` pass builds
  it from this design, same as Grassroots' own precedent). Decision Log
  #281; forward-pointer appended to #1 and to Section 6's Sprint 3 task
  text.** Report: `docs/sprint-3-community-groups-design-report.md`.
  - **13 new frames + a Design Notes frame**, parked at `y ≥ 37500` on
    page `0:1` (verified 0 overlaps against every existing top-level
    node): Browse (D `6450:18580` / M `6455:18580`), Browse — No Groups
    Match Filter (`6452:18580` / `6456:18580`), Browse — No Groups Yet
    for This City (`6452:18692` / `6456:18667`), Group Page — Not Joined
    (`6453:18580` / `6457:18580`), Group Page — Joined (`6454:18580` /
    `6458:18580`), Create a Group (`6454:18709` / `6458:18701`), Design
    Notes (`6459:18580`). **Confirmed no Community Groups frame existed
    anywhere in the file before this task** (a depth-first name search
    turned up only the DL #1 annotation note itself, `5116:6659`).
  - **Grouping dimensions: City, Position Played, Career Track** — the
    exact three the founder named resolving DL #1. "Fantasy league"
    (named in Log Book Section 6.1's original description) was
    deliberately **not** added as a 4th dimension — flagged instead as
    a real open question, since it's time-boxed with its own standings
    and reads closer to the Contest/Competition pillar than to a
    durable-attribute interest group.
  - **Visually distinct from both neighbouring features, by design, not
    assumption**: Banter Rooms browses as a full-width room-list with
    `Filter Tabs (All/My Bants)` and forum language — untouched, not
    opened for edit. The existing Community main feed (`1306:7148`/
    `7149`, DL #152) is a single authenticated feed with a composer and
    suggestion rails — also untouched. Community Groups is instead a
    3-across card-grid directory with a combinable City/Position/
    Career-Track filter bar (modelled on Leaderboard's own combinable-
    filter pattern) and has **no composer anywhere, even on a joined
    group's own page**. Browse cards carry no Join button (unlike Clubs
    — Browse) — membership lives only on the group page itself.
  - **Reused, not rebuilt**: the logo-only `Top Bar — Soccernity` (same
    provisional chrome Clubs — Browse used before DL #156), Club — Fan
    Page's header+feed+roster layout pattern for the individual group
    page (with the roster's `@handle` line deliberately **removed** —
    no `User.username` column exists, DL #58 — rather than reproducing
    an unbacked field), and Leaderboard's combinable-filter-bar pattern.
  - **Paint audit: 854 authored paints, 854 bound, 0 unbound, 0
    off-palette, 0 `brand/green-tint-28`, 0 new colours** — a genuine 0
    with no disclosed reused-component-debt exception (avoided by using
    the logo-only Top Bar instead of the shared `header 4` navbar, which
    would have pulled in that navbar's own known avatar `IMAGE`-fill
    debt).
  - **Restricted-pending minors**: applied the existing platform default
    (browse/read `JwtAuthGuard`-only; create/join/post would need
    `GuardianConsentGuard`) per DL #21/#275/Section 5.7 — stated as
    applying existing precedent, not a new rule.
  - **No group post composer designed**, even in the Joined state —
    mirrors Club — Fan Page's own no-composer state (DL #157, no scoped
    post-creation endpoint exists for this feature either).
  - **Five judgment calls flagged, none silently decided** (all on the
    Design Notes frame and in the report): who may create a group (open
    to any consent-confirmed user in the design, but the unbounded-
    user-named-public-groups spam/safeguarding surface — same category
    already flagged for Banter Room creation, DL #275 — is named as a
    real concern); content moderation (ordinary post moderation assumed
    for posts, but group **names** are a genuinely new, uncovered
    surface); group size limits (none designed); the fantasy-league
    4th-dimension question above; and **navigation placement — left
    fully open, not designed here**. There is no existing nav home (the
    current 7-icon desktop nav + drawer have Community and Bants but
    nothing for this); nesting under either would directly contradict
    the founder's own DL #1 ruling that these are distinct features, so
    a new top-level nav entry is this design's own inclination but
    **not** a decision — the same explicit founder-call treatment
    Grassroots' own nav placement got (DL #258). **Now resolved — see the
    `sprint-3/nav-drawer-groups-dropdown` bullet directly below (Decision
    Log #282): the founder decided Groups does not get a navbar icon at
    all, it goes into the account dropdown/drawer instead.**
  - Not merged — founder's call after review.
- **`sprint-3/nav-drawer-groups-dropdown` (figma-design-system, 2026-09-13)
  is a founder nav decision, not a design proposal — resolves Community
  Groups' navigation-placement question (Decision Log #281) and removes a
  redundant row from the mobile drawer. Figma design only, no app/backend
  code. Decision Log #282; forward-pointer appended to #281.**
  - **Home removed from `Navigation Drawer — Mobile` (`5870:10689`)** —
    the drawer is opened via the avatar and the header logo already links
    home (working in code, same precedent as DL #162), so the row was
    redundant. `Nav — Home` (`5870:10704`) deleted; every row from
    Community through Settings shifted up 48px to close the gap
    (Community 140 → Settings 620).
  - **Community Groups gets no navbar icon.** A new `Nav — Groups` row
    (`6465:19596`) was cloned from **`Nav — Clubs`**, not Grassroots — so
    it inherits from the same template Grassroots' own row was itself
    cloned from (Decision Log #265), rather than cloning a clone.
    Inserted after Settings at y=668, in the account cluster
    (Profile/Notifications/Settings), not the content-pillar cluster.
    Because one row was removed above this point and one added below it,
    the pre-existing Space/Divider/Log-out tail landed back at its exact
    original position (716/730/735) — verified, not assumed, via a
    screenshot and a metadata re-read.
  - **Both account dropdown components** — `Dropdown menu/no
    notification` (`2841:5361`) and `Dropdown menu/notification on`
    (`2841:5363`) — gained a `Groups` row, each cloned from that
    component's own Settings row, inserted after Settings (y=108) and
    before Log out (pushed to y=144); each component's height grew
    142→176. **The hidden `Message` row was left exactly as-is**, still
    hidden, per the brief.
  - **Nothing designed for Scouting or Academy** — no icons, no
    placeholder frames; both remain Phase 2 / undesigned (Decision Log
    #3). Standing policy recorded in the Decision Log instead: the
    7-icon `Web app Navbar` COMPONENT_SET (`2824:4309`, untouched by this
    PR) is closed to new features by default going forward — Scouting
    and Academy each get one of the two remaining reserved slots once
    they exist and are designed; everything else (a new pillar, a new
    account-adjacent feature) defaults to the account dropdown/drawer,
    following the Groups precedent this PR sets, not the navbar.
  - **Paint audit**: every fill on both new node families is a clone of
    an already-bound node (`brand/navy` text/marker fills, confirmed via
    `boundVariables.color` on the drawer row and both dropdown rows) — 0
    unbound, 0 off-palette, 0 `brand/green-tint-28`, 0 new colours,
    Light mode only, 0 overlaps (screenshot-verified on all three
    components).
  - Not merged — founder's call after review. **Code half now done — see
    the `sprint-3/nav-groups-code` bullet directly below (Decision Log
    #283).**
- **`sprint-3/nav-groups-code` (figma-to-code, 2026-09-13) mirrors
  `sprint-3/nav-drawer-groups-dropdown`'s Figma nav-surface decision into
  `apps/web` — `navigation.ts` only, no Figma/backend code. Decision Log
  #283; forward-pointer appended to #282.**
  - **`navigation.ts`**: removed `{ label: "Home", to: "/" }` from
    `drawerNavItems` — grep-confirmed nothing else in `apps/web/src`
    referenced it besides `Header.test.tsx`. Added `{ label: "Groups",
    to: "/groups", available: false }` to both `accountMenuItems` (after
    Settings) and `drawerNavItems` (after Settings, at the end of the
    array — Log out is rendered separately below it in both components),
    matching Decision Log #282's own Figma placement exactly.
    `available: false` because Decision Log #281 is design-only — no
    `/groups` route exists in `router.tsx` — the same "flip once the
    route exists" precedent already used for Grassroots/Messages/
    Notifications while their routes were pending.
  - **`AccountDropdown.tsx`/`NavDrawer.tsx` deliberately untouched** —
    the existing `available === false` disabled-row branch (a
    non-navigating, `aria-disabled` span, Decision Log #166's pattern)
    already renders Groups correctly with zero code change to either
    component.
  - **Nothing added for Scouting or Academy** — neither has a route, a
    page, or a Figma frame to point a placeholder at.
  - **`Header.test.tsx`**: the canonical drawer-order assertion drops
    Home and appends Groups after Settings; three new tests confirm Home
    is gone and that Groups renders disabled, pointed at `/groups`, in
    both the drawer and the account dropdown; the two existing
    render-level tests were each extended with a Groups assertion rather
    than duplicated.
  - **Verified**: `apps/web` vitest — **36 suites / 247 tests, 0
    failures** (up from 36/244 — 3 new tests, no existing test removed);
    `npx tsc --noEmit` clean; `npm run lint` clean; `npm run build`
    clean production bundle. Dev-server smoke test: `/`, `/community`,
    `/clubs`, `/grassroots` all HTTP 200, clean log — `/groups` itself
    was not requested since no route was added for it, by design.
  - Not merged — founder's call after review.
- **`sprint-3/navbar-scouting-academy-icons` (figma-design-system,
  2026-09-13) builds the Scouting and Academy icons on the shared desktop
  navbar — the two slots the standing nav policy (Decision Log #282)
  explicitly reserved as exceptions to "the navbar is closed to new
  features." Figma design only, no app/backend code. Decision Log #284.**
  Report: `docs/sprint-3-navbar-scouting-academy-icons-report.md`.
  - **Verified live before any edit, per the task's own instruction not to
    assume the DL #272 Grassroots precedent transfers**: `Frame 5858` (the
    icon row) is genuine `HORIZONTAL` auto-layout (`HUG`×`HUG`,
    `itemSpacing: 30`) on both live variants, `header 4` (`2838:3502`) and
    `header 7` (`2841:4104`) — confirmed via `layoutMode`/
    `primaryAxisSizingMode` directly. **The two variants are protected
    from overflow by two different mechanisms, checked separately**:
    `header 4`'s root is `primaryAxisAlignItems: SPACE_BETWEEN` against a
    fixed 1440px width, pinning the `AUTO`-positioned avatar cluster
    (`Frame 5880`) to the right as the row's gap shrinks; `header 7`'s
    Login button (`Frame 5805`) is `layoutPositioning: ABSOLUTE`, fully
    decoupled from the row's flow.
  - **Two new tinted-style icons** (31×31 `brand/green-tint` @12% tile +
    24×24 `brand/navy`-stroke glyph — matching Clubs (DL #159) and
    Grassroots (DL #272), not the five baked-in-artwork icons): **Scouting**
    (binoculars) and **Academy** (graduation cap with tassel). Built via
    `figma.createNodeFromSvg` (the DL #159 Apple-mark precedent), every
    descendant vector re-bound to `VariableID:5096:4`/`5096:5` rather than
    left as literal SVG colour. Appended last, after `grassroots`, on both
    `Frame 5858` instances (`2838:3517` / `2841:4115`). Order now: Sports
    Hub · Blog · Community · Leaderboard · Bants · Clubs · Grassroots ·
    **Scouting** · **Academy**.
  - **Growth and clearance, re-measured after building, not predicted and
    left unchecked**: row 444.41px → 566.41px on both variants; clearance
    to the avatar cluster (`header 4`) 309.3px → 187.3px, to the Login
    button (`header 7`) ~290px → 168.0px — both confirmed clean via
    full-navbar screenshots, no overlap, no clipping.
  - **Propagation verified** across all 8 live `header 7` instances and a
    diverse 7-frame sample of the 95 live `header 4` instances (Settings,
    Create Post, Leaderboard, Contest, Grassroots, Sports Page, Homepage,
    Blog, Article Detail, the 3 Legal pages) — all show both icons
    correctly, identical 566.41px row width. One instance inside the
    already-archived, hidden `ARCHIVED — Blog Page Desktop (superseded by
    ...)` frame did not update — confirmed pre-existing, out-of-scope
    archived content, not a propagation gap. Zero stray top-level nodes
    left on the page after construction.
  - **Explicitly not done**: no Coming Soon destination screen (that's
    `figma-screen-builder`'s separate, parallel task — neither icon has
    prototype `NAVIGATE` wiring yet); the mobile Navigation Drawer and
    both account dropdown components untouched (Scouting/Academy are
    navbar-only, unlike Community Groups, DL #282); no Discover- or
    Careers-pillar schema/backend/code touched — non-negotiable #4 and
    Decision Log #3 (Phase 2, not MVP-blocking) stand unchanged.
  - **Standing policy confirmed in writing**: the 9-icon `Web app Navbar`
    COMPONENT_SET is now fully populated and closed to further additions
    by default. Scouting and Academy were its last two reserved slots. Any
    future pillar or account-adjacent feature defaults to the account
    dropdown/drawer (the Community Groups precedent, DL #282), not the
    navbar.
  - Merged as PR #233.
- **`sprint-3/coming-soon-screen-scouting-academy` (figma-screen-builder,
  2026-09-13) designs the reusable Coming Soon template DL #284 flagged as
  a separate follow-up — one generic screen, not two bespoke ones, for
  Scouting and Academy (and every future Phase 2 pillar that later gets a
  navbar slot). Figma design only, no app/backend code. Decision Log
  #285.** Report: `docs/sprint-3-coming-soon-screen-report.md`.
  - **Five new frames**, parked at `y ≥ 40000` on page `0:1` (clear of the
    Community Groups mobile row): `Coming Soon — Desktop — Logged In`
    (`header 4`, 1440×1005), `— Desktop — Logged Out` (cloned, navbar
    swapped to `header 7`), `— Mobile — Logged In` (`header 4 — mobile`,
    built fresh at mobile scale, 390×980), `— Mobile — Logged Out`
    (cloned, navbar swapped to `header 7 — mobile`), and a `— Design
    Notes` annotation frame.
  - **Four screens, not two — flagged, not silently decided**: the task's
    literal ask was "desktop + mobile," but the Scouting/Academy icons
    exist on **both** `header 4` and `header 7` (DL #284), and every other
    page reachable from both navbar states in this file (Blog, Article
    Detail, Sports Hub, the 3 Legal pages) gets the full auth-state ×
    breakpoint split — built the same way here rather than leaving this
    as the one inconsistent page in the file.
  - **Content, identical across all four, genuinely generic**: a neutral
    tinted clock-glyph icon (not a feature illustration), a fixed `COMING
    SOON` badge pill, **the one variable slot** — a text layer named
    `Feature Name`, set to `"Scouting"` as the worked example — a fixed
    generic sub-line ("This feature is part of our Phase 2 roadmap and
    isn't built yet. Check back soon."), and a generic "Back to
    Soccernity" CTA. No fake screenshots or fabricated feature previews
    for either pillar — nothing to show yet, per non-negotiable #4.
  - **Real chrome, not provisional**: `Navbar header 4`/`header 7` and
    `header 4 — mobile`/`header 7 — mobile`, plus the canonical Footer
    (`5213:6816` desktop / `5543:7662` mobile, cloned) — not the logo-only
    Top Bar Grassroots/Community Groups used before their nav placement
    was decided (DL #258/#282), since this screen is reachable from the
    real navbar today.
  - **A real bug found and fixed during the build, not inherited**: the
    mobile Navbar component (`header 4 — mobile`/`header 7 — mobile`) is
    natively 428px wide, not the canonical 390px (DL #86) — both mobile
    frames initially overflowed (Login button and avatar/messages cluster
    clipped past the frame edge), caught by screenshot, fixed by
    explicitly resizing each navbar instance to 390×64, re-verified clean
    — called out in the Design Notes frame as a step any future page
    cloning this navbar must not skip.
  - **Not wired, and correctly so**: neither navbar icon has a prototype
    `NAVIGATE` reaction to this screen — the `scouting`/`academy` icon
    groups (DL #284) live inside the `header 4`/`header 7` **master
    components**, not instances, and Figma rejects `NAVIGATE` reactions on
    `COMPONENT` descendants (DL #249) — routing for these icons is
    code-side (`apps/web/src/layout/navigation.ts`), matching every other
    navbar icon, noted explicitly so it isn't mistaken for a gap.
  - **Verified**: zero overlaps via a strict pairwise AABB test against
    all 559 existing top-level page nodes plus among the 5 new frames (one
    real overlap found between the Design Notes frame and Desktop — Logged
    Out, fixed by repositioning, re-verified clean); **0 unbound / 0
    off-palette SOLID paints across the 4 shipped screens** (the Design
    Notes frame's own 10 unbound paints are expected — annotation content,
    not shipped UI, per established precedent); **0
    `brand/green-tint-28`**; Light mode only, no new colour.
  - Not merged — founder's call after review.
- **`sprint-3/coming-soon-scouting-academy-to-code` (figma-to-code,
  2026-09-13) is the code half of Decision Log #284/#285 — wires the
  Scouting/Academy navbar icons to a real destination and converts the
  reusable Coming Soon screen into `apps/web` code. `apps/web` only, no
  Figma/backend code. Decision Log #286; forward-pointers appended to
  #284 and #285.**
  - **Two new real icon assets**, exported directly from the Figma
    glyph nodes the navbar icons actually use (`6472:18581` /
    `6472:18589`, inside the shared `Web app Navbar` COMPONENT_SET) —
    `nav-scouting.svg` (binoculars) / `nav-academy.svg` (graduation
    cap) — matching `nav-clubs.svg`/`nav-grassroots.svg`'s exact
    convention, never hand-drawn. `navigation.ts`'s `primaryNavItems`
    gained two real, available-by-default entries — `{ label:
    "Scouting", to: "/scouting" }` / `{ label: "Academy", to:
    "/academy" }`, both `tinted: true` — appended after Grassroots, the
    canonical order Decision Log #284 landed in Figma (9 icons total).
    **Deliberately NOT added to the mobile Navigation Drawer or the
    account dropdown** — navbar only, per the standing policy #284/#282
    both state (unlike Community Groups).
  - **One new reusable `ComingSoonPage` component**
    (`src/pages/ComingSoonPage.tsx`), converted from Decision Log
    #285's four Figma frames (`6477:20050`/`20402`/`20677`/`20764`) —
    icon disc (`coming-soon-icon.svg`, also a real exported asset, not
    hand-drawn), `COMING SOON` badge, a `featureName` prop as its
    **only** variable content, the fixed generic sub-line verbatim from
    the frame's own text node, and a `"Back to Soccernity"` CTA to `/`.
    **One component, not two duplicated page files** — `router.tsx`
    adds `/scouting` and `/academy`, both rendering `<ComingSoonPage
    featureName="..." />` configured differently.
  - **Both routes nested under `FooterLayout`, not a direct `AppShell`
    child** — the Coming Soon Figma frames carry the canonical site
    footer (Decision Log #209/#210/#213), the same reason Home/Sports
    Hub/Blog/Article Detail sit there. `FooterLayout.tsx`'s own
    route-list comment and `router.test.tsx`'s FooterLayout-membership
    test were both updated to include them. **No login gate on
    either route** — like Blog/Sports Hub, the Figma content is
    identical regardless of auth state and has nothing depending on the
    caller's identity; the shared Header already renders the correct
    chrome either way.
  - **`Header.test.tsx` updated for the new 9-icon canonical order**
    (was 7) and gained dedicated cases: Scouting/Academy are the last
    two items, both tinted, pointing at `/scouting`/`/academy`; neither
    appears in `drawerNavItems` or `accountMenuItems`.
  - **Verified**: `apps/web` vitest — **37 files / 255 tests, 0
    failures** (up from 36/253 — new `ComingSoonPage.test.tsx`, 4
    cases; `router.test.tsx` +3; `Header.test.tsx` net +2, no existing
    test removed); `npx tsc --noEmit` clean; `npm run lint` clean;
    `npm run build` clean production bundle. Dev-server smoke test:
    `/`, `/scouting`, `/academy`, `/sports-hub`, `/community`, `/clubs`
    all real HTTP 200, clean log. No real browser/Playwright check
    available in this environment — same verification ceiling as every
    prior `apps/web` figma-to-code PR.
  - Not merged — founder's call after review.
- **`figma-design-system/nav-drawer-profile-entry-point` (figma-design-system,
  2026-09-13) removes the standalone `Nav — Profile` row from
  `Navigation Drawer — Mobile` (`5870:10689`) and makes the "Signed in
  as" identity block the profile entry point itself. Figma design only,
  no app/backend code. Decision Log #287.** Founder decision: reclaim a
  row in the mobile drawer by folding Profile navigation into the
  existing "Signed in as" block — the same "reclaim space" reasoning as
  the earlier Home-row removal (Decision Log #231).
  - **`Nav — Profile` (`5870:10725`) deleted.** `Panel` (`5870:10692`)
    is genuine `VERTICAL` auto-layout (`itemSpacing: 4`,
    `primaryAxisSizingMode: FIXED`, height 844), so every row below
    reflowed upward by 48px automatically — Community 188→140 through
    Log out 735→687 — with zero manual repositioning. Panel child count
    19→18.
  - **A premise in this task's own brief was checked and found
    inaccurate, not trusted**: it described every other row in this
    drawer as already carrying per-instance NAVIGATE reactions (the
    Decision Log #249 convention). Live inspection of both the master
    component and its one live instance (`5874:10690`, inside
    `Community — Home Feed (Navigation Drawer Open) — Mobile`) found
    **zero reactions on every nav row** — Profile, Community, Clubs,
    Grassroots, Groups, Settings, Log out all carried `reactions: []`.
    That per-instance-override convention is real, but lives on a
    different component family (the desktop Settings Shell / account
    dropdown / Navbar avatar, Decision Log #100/#101/#249) — not this
    drawer, whose rows are visual-only in Figma with real routing
    implemented in `apps/web` code.
  - **Also found**: the old "Profile 1" node id (`1455:4362`) cited
    elsewhere in this project's own history has since been renamed to
    "User's post feed" and is no longer a top-level Profile screen —
    the real mobile Profile destination is `Community — Profile —
    Mobile` (`5702:8250`).
  - **Given no existing per-row wiring to match**, an `ON_CLICK →
    NAVIGATE` reaction targeting `5702:8250` was added as a fresh,
    disclosed instance override on the one live instance's "Signed in
    as" node (`I5874:10690;5870:10697`) — confirmed persisted via a
    fresh read after the write. **Flagged, not silently absorbed**:
    because NAVIGATE reactions cannot be set on a `COMPONENT`'s own
    descendants (the same Decision Log #249 limitation), this wiring
    lives only on the one existing instance — any future new instance
    of this drawer master will need the identical override reapplied by
    hand, the same limitation already documented for the desktop
    avatar→dropdown wiring (Decision Log #100/#101).
  - **Desktop account dropdown untouched** — it has no equivalent
    "Signed in as" block to fold Profile into, so Profile stays its own
    row there. Every other row's order in this drawer left exactly as
    the founder had already rearranged it.
  - **Verified** via a screenshot of the full drawer instance: clean
    reflow, no gaps, no overlaps.
  - Not merged — founder's call after review. **Code half now closed —
    see the `sprint-3/nav-drawer-profile-entry-point-code` bullet
    directly below (Decision Log #288).**
- **`sprint-3/nav-drawer-profile-entry-point-code` (figma-to-code,
  2026-09-13) closes the code half of Decision Log #287 — `apps/web`
  only, no Figma/backend code. Decision Log #288; forward-pointer
  appended to #287.**
  - **Pulled the live `Navigation Drawer — Mobile` (`5870:10689`) row
    order directly from Figma before touching any code**, per this
    task's own instruction not to reorder from memory or an old
    screenshot. Confirmed order (nav items only, Log out excluded as an
    action rendered separately): Community, Messages, Notifications,
    Sports Hub, Blog, Bants, Leaderboard, Clubs, Groups, Grassroots,
    Settings. **This does not match the pre-#287 code order minus
    Profile** — `navigation.ts`'s `drawerNavItems` had already drifted
    from the live Figma order (the founder had rearranged the whole
    drawer directly, independent of the Profile-removal question), so
    reordering from the old array would have been wrong.
  - **`navigation.ts`**: `drawerNavItems` reordered to the exact
    sequence above, with the `"Profile"` entry removed entirely — no
    route or availability flag on any other item touched.
  - **`NavDrawer.tsx`**: the existing "Signed in as" identity block
    (avatar + displayName + decorative @handle) is now wrapped in a
    `NavLink` to `/profile` with `onClick={onClose}` — the same
    convention every other drawer row already uses — in both the
    loaded-profile state and the generic "Signed in" fallback (pending
    or failed fetch), so profile navigation always works regardless of
    fetch state.
  - **`NavDrawer.css`** gained one line, `text-decoration: none` on
    `.sn-drawer__identity`, matching `.sn-drawer__link`'s own existing
    rule — necessary because the class now styles an anchor, not a
    `div`, and would otherwise inherit an underline through its child
    spans.
  - **Desktop `AccountDropdown`/`accountMenuItems` untouched by design**
    — no equivalent identity block to fold Profile into, so Profile
    stays its own row there, unchanged.
  - `Header.test.tsx`'s drawer-order assertion updated to the live
    Figma order above; one new test confirms no `"Profile"` row exists;
    three new tests cover the identity-block link (href resolves to
    `/profile` in both the loaded-profile and generic-fallback states,
    and clicking it navigates to `/profile` and closes the drawer).
  - **Verified**: `apps/web` vitest — **37 files / 259 tests, 0
    failures** (up from 37/255 — 4 new tests, no existing test
    removed); `npx tsc --noEmit` clean; `npm run lint` clean; `npm run
    build` clean production bundle; dev-server smoke test on
    `/community` and `/profile`, both real HTTP 200.
  - Not merged — founder's call after review.
- **`figma-design-system/community-groups-navbar-swap` (figma-design-system,
  2026-09-13) swaps Community Groups' provisional chrome for the real Navbar,
  now that Decision Log #282 has resolved the feature's nav placement (account
  dropdown/drawer, no navbar icon) — the reason Decision Log #281 used a
  logo-only placeholder in the first place. Figma design only, no app/backend
  code. Decision Log #289.**
  - **All 12 Community Groups frames** (Browse, Browse – No Groups Match
    Filter, Browse – No Groups Yet for This City, Group Page – Not Joined,
    Group Page – Joined, Create a Group, each desktop + mobile) had their
    provisional `Top Bar — Soccernity` frame (logo-only, 1440×90 desktop /
    390×64 mobile) deleted and replaced with a real instance of the current
    `Web app Navbar` COMPONENT_SET (`2824:4309`): `header 4` (`2838:3502`,
    1440×90) on desktop, `header 4 — mobile` (`5386:6576`, natively 428×64,
    resized to 390×64 matching the `sprint-3/coming-soon-scouting-academy-to-code`
    precedent) on mobile.
  - **Logged-in variant only on all 12, not a Logged-In/Logged-Out split —
    a disclosed judgment call, not silently decided.** Community Groups' own
    Design Notes state the restricted-pending-minor precedent applies
    (implying `JwtAuthGuard`-only, login-required), matching Clubs/Grassroots,
    neither of which got a Logged-Out variant either. A 24-frame Logged-Out
    split is a flagged follow-up if wanted, not built here. The real Navbar
    carries all 9 nav icons (Sports Hub, Blog, Community, Leaderboard, Bants,
    Clubs, Grassroots, Scouting, Academy — post-#272/#284/#286) and confirms
    zero Groups icon belongs there, consistent with #282.
  - **Height match verified, not assumed**: the provisional Top Bar and the
    real Navbar are identically 90px (desktop) / 64px (mobile) tall on every
    one of the 12 frames — confirmed via metadata before any write, then
    re-confirmed after the swap via a node-by-node bounding-box check on all
    12 frames (zero overlap between Navbar and Content Column/Content on
    every one, exactly 2 children per frame post-swap, no orphan nodes left
    behind). **No manual repositioning of any frame's content was needed or
    performed.**
  - **The avatar-opens-account-dropdown wiring (Decision Log #100/#101) was
    deliberately NOT added to any of the 12 new instances** — consistent
    with file-wide norm (only 2 of ~95+ `header 4`/`header 4 — mobile`
    instances file-wide carry that per-instance override; every other
    instance, including these 12, shows the avatar without click-to-dropdown
    behavior). Not a new gap this PR introduced.
  - **Visually verified via screenshots on all 12 frames**: clean render, no
    clipping or overlap on the search bar, filter controls, both empty
    states, the group identity block, feed, member roster, or Create a Group
    form on any frame.
  - **Grassroots and Banter Rooms checked in passing, per this task's own
    instruction, and found NOT to still be using the provisional pattern** —
    Grassroots' own Figma frames already reused the real `header 4`/
    `header 4 — mobile` Navbar from the start (per its own PR report);
    nothing to flag there. Neither feature was touched by this PR.
  - The Navbar component itself, Grassroots, Banter, and all Community
    Groups content below the chrome (Group Grid, Filter Bar, Group Feed,
    Members roster, Create-a-Group form) were left untouched.
  - PR opened, not merged — founder's call after review.
- **`sprint-3/notifications-read-api` (backend-api, 2026-09-13) builds the
  Notifications READ SIDE — Build Plan Section 4.7. `services/api` only,
  no Figma/`apps/web` touched. Decision Log #290.** Report:
  `services/api/src/modules/notifications/README.md`.
  - **Design problem confirmed and solved**: `Notification.payloadRefId`
    is a bare, type-dependent string with no FK and no stored actor — a
    client can't render "X liked your post" from a row alone. Read every
    one of the 7 trigger call sites first (`users.service.ts` for
    `follow`, `feed.service.ts` for `like`/`comment`,
    `messaging.service.ts` for `message`, `grassroots.service.ts` for
    `fixture_scheduled`/`result_logged`, `contest.service.ts` for
    `contest_win`) to confirm exactly what `payloadRefId` means per type,
    rather than assuming.
  - **Option (a) chosen: server-side resolution, batched by type.** `GET
    /notifications` resolves each row's `payloadRefId` into a
    type-specific structured `data` object — never pre-rendered English
    (copy stays a frontend concern, since Decision Log #279 already
    finalized exact per-type wording in Figma). At most 5 extra queries
    per page regardless of page size (Posts; Conversations plus one
    combined User lookup covering both follow-actors and
    message-other-participants; Fixtures; ContestCycles), matching the
    batching discipline `FeedService.attachViewerState` /
    `MessagingService.toConversationViews` already established — never
    one query per row.
  - **A real, disclosed limitation, NOT fixed here**: `like`/`comment`
    notifications have no actor anywhere in the schema —
    `payloadRefId` is the `Post`, not the liker/commenter — so those two
    types can only ever resolve to "what was liked/commented on", never
    "who did it", from current data. Fixing this needs a new `actorId`
    column written by the `like`/`comment` trigger call sites, which is
    explicitly out of this PR's read-side-only scope; flagged as a new
    open Decision Log candidate in the module's own README, not resolved
    in the docx.
  - **Endpoints**: `GET /notifications` (`JwtAuthGuard` only, implicitly
    self-scoped like `GET /contest/current`; keyset pagination reusing the
    exact `(createdAt desc, id desc)` shape every other list endpoint
    uses, as this module's own cursor-util copy — the established
    per-module-cursor convention, not a cross-module import; also returns
    `unreadCount`), `GET /notifications/unread-count` (a dedicated
    lightweight `{ unreadCount }` endpoint — one `COUNT` query — because
    the Navbar badge renders on every page and shouldn't pay for a
    resolved page just to show a count), `PATCH /notifications/:id/read`
    (not-found-or-not-owned → 404, never 403 — the established
    don't-leak-existence convention; idempotent), `PATCH
    /notifications/read-all` (`{ markedRead }`, mirroring
    `MessagingService.markConversationRead`'s own shape).
  - **Every `data` field is nullable** — `payloadRefId` is not an FK, so a
    referenced row can be gone (a hard account-deletion cascade, Decision
    Log #44) by the time this reads it; a stale notification degrades to
    `data: null` rather than erroring. Deliberately NOT filtered: a
    notification whose actor/other-participant has since deactivated
    (not hard-deleted) is still shown, consistent with Decision Log
    #221's existing "private record, not public content" precedent for
    DM threads.
  - **None of the 7 existing trigger call sites were touched.**
  - **Verification, freshly re-measured both before and after (not
    assumed from a prior recorded figure)**: mocked suite 52 suites / 738
    tests, 0 failures → 54 suites / 764 tests, 0 failures (26 new, 2 new
    suites — `notifications.service.spec.ts`,
    `notifications.controller.http.spec.ts`). No e2e spec added — this
    module is plain `findMany`/`count`/`update` calls with no raw SQL, no
    transaction/isolation-level reasoning, and no novel Prisma relation,
    the exact class of change `test/README.md`'s own guiding principle
    keeps at the mocked layer. `npx tsc --noEmit`, `npm run lint`, and
    `npx nest build` all clean.
  - **Not built here, by design**: `GET /notifications/:id`; an `actorId`
    column for `like`/`comment` (see above); any Figma or `apps/web`
    change — converting the already-finalized Notification Centre design
    (Decision Log #279) against these endpoints is a separate
    `figma-to-code` follow-up, now done — see the
    `sprint-3/notification-centre-to-code` bullet directly below.
  - Merged as PR #239.
- **`sprint-3/notification-centre-to-code` (figma-to-code, 2026-09-13)
  converts the finalized Notification Centre design (Decision Log #279)
  into real `apps/web` code against the read-side endpoints PR #239 built
  (Decision Log #290), and wires the Navbar avatar's "Has Unread" state
  plus the account dropdown/drawer's numeric badge to the real
  unread-count mechanism, closing Decision Log #167 and #87's remaining
  code half. No backend or Figma touched — the two frames
  (`5640:7815`/`5643:8003` feed, `5642:7898` empty state) were re-fetched
  live via `get_design_context` before building, not assumed from the
  Decision Log #279 summary alone. Decision Log #291; forward-pointers on
  #279 and #290.**
  - **New `src/api/notifications.ts`** — the full client
    (`listNotifications`/`getUnreadCount`/`markNotificationRead`/
    `markAllNotificationsRead`), mirroring `api/messaging.ts`'s exact
    shape (own `NotificationsApiError`, Bearer auth, cursor pagination).
    `NotificationData` is a discriminated-by-`type` union of structured
    objects (`{ actor }`, `{ post }`, `{ conversationId,
    otherParticipant }`, `{ fixture }`, `{ cycle }`) — deliberately not
    pre-rendered strings, matching Decision Log #290's own denormalization
    decision that copy stays this app's concern.
  - **New `NotificationCentrePage.tsx` (route `/notifications`, no site
    footer — not in the Figma frame, matching Community/Clubs/Grassroots/
    Banter).** All/Unread tabs, NEW/EARLIER grouping by read status
    (matching the actual fetched JSX — unread rows white/green-tint avatar
    + green dot, read rows green-tint/white with no dot — not just the
    Design Notes frame's generic summary), Mark-all-as-read, Load more.
    **The Unread tab is a client-side filter over already-loaded items** —
    `GET /notifications` has no server-side unread-only query param
    (`NotificationsQueryDto` only takes `cursor`/`limit`) — flagged, not a
    backend change in this PR, the same discipline `ClubsPage`'s
    client-side name filter already established.
  - **Per-type icon-disc treatment, confirmed against the real fetched
    JSX, not the summary**: `follow` → real actor initials (payloadRefId
    IS the actor); `message` → the Navbar messages glyph (already
    imported), links to `/messages/:conversationId`; `fixture_scheduled` →
    the Grassroots corner-flag icon (already imported), `result_logged` →
    a newly-exported `mdi:whistle-outline` icon, both link to
    `/grassroots/fixtures/:fixtureId`; `contest_win` → a newly-exported
    `carbon:trophy` icon, links to `/contest`. Two new icon assets
    (`notif-whistle.svg`, `notif-trophy.svg`) plus the empty-state's bell
    icon (`notif-bell.svg`) were exported directly from their Figma glyph
    nodes via `download_assets` (the clean vector-layer SVG, not the
    whole-scene "export" render, which came back wrapping the icon in the
    entire frame's background/groups) — never hand-drawn, matching this
    project's standing figma-to-code discipline.
  - **Two real, disclosed divergences from the Figma sample data, forced
    by the backend's own confirmed limits (Decision Log #290), not
    invented here**: `like`/`comment` rows render "**Someone** liked/
    commented on your post" — the established generic-fallback pattern
    this app already uses for missing identity data (`NavDrawer`'s
    "Signed in" row, the ghost-participant "?" initials) — instead of
    Figma's illustrative actor name, since the backend has confirmed no
    actor is ever resolvable for those two types. `contest_win` renders
    only "you won a round in {cycle title}", not Figma's illustrative
    "you placed 1st this week", since `payloadRefId` is deliberately keyed
    to `cycleId` only (no round/position). `data: null` (a stale/orphaned
    `payloadRefId`) renders a generic "This notification is no longer
    available." row rather than erroring.
  - **Absolute timestamps** (`toLocaleString`), matching
    `MessagesPage.tsx`/`ConversationPage.tsx`'s own established
    convention — not Figma's illustrative relative-time copy ("2 hours
    ago"), which this app has no existing utility for and doesn't
    introduce one for here.
  - **Header.tsx now fetches real unread count** (`GET
    /notifications/unread-count`) — re-fetched on every navigation
    (`[accessToken, location.key]`), unlike the profile fetch's
    once-per-session key, so the badge reflects a notification just read
    on `/notifications` once the user navigates away. Drives a real dot on
    the Navbar avatar — **substituting `brand/green` for the Figma-bound
    `semantic/alert`**, since that token isn't exposed to `apps/web`
    (`packages/shared/src/tokens` has no semantic-alert entry) — the same
    substitution the Grassroots LIVE indicator already made rather than
    hardcoding a new colour. Also drives a real navy count-pill badge
    (closing Decision Log #167) on **both** the account dropdown's and the
    mobile drawer's Notification(s) row — extending slightly beyond the
    literal ask of "the account dropdown's numeric badge" to include the
    drawer too, for parity between the two surfaces the same avatar opens;
    a disclosed judgment call, not silently assumed.
  - **`navigation.ts`**: `{ label: "Notifications", to: "/notifications"
    }` flipped `available: true` in both `accountMenuItems` and
    `drawerNavItems` — same "flip once the route exists" precedent as
    Messages/Clubs/Grassroots/Settings.
  - **Verified**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all
    clean; `apps/web` vitest — freshly re-measured baseline **37 suites /
    259 tests, 0 failures** → **38 suites / 276 tests, 0 failures** (17
    new — `NotificationCentrePage.test.tsx` +14; `Header.test.tsx` +3,
    covering the real badge/dot and correcting two now-stale
    Notification-row-is-disabled assertions the DL #167/#166 era left
    behind). Dev-server smoke test: `/`, `/notifications`, `/community`
    all real HTTP 200. No real browser/Playwright check available in this
    environment — same ceiling as every prior `apps/web` PR.
  - PR opened, not merged — founder's call after review.
- **`sprint-3/community-groups-frontend` (figma-to-code, 2026-09-14) wires
  Community Groups into `apps/web` — the already-designed
  (`sprint-3/community-groups-design`, Decision Log #281) and
  already-backed (`sprint-3/community-groups-backend`, PR #241, Decision
  Log #292/#293) feature had zero frontend presence until this PR. Closes
  the remaining code half of Decision Log #281. `apps/web` only — no
  Figma/`services/api` touched. Decision Log #294.**
  - **New `src/api/community-groups.ts`** — the full client, all 6
    endpoints (`createCommunityGroup`/`listCommunityGroups`/
    `getCommunityGroupById`/`getCommunityGroupMembers`/
    `joinCommunityGroup`/`leaveCommunityGroup`), mirroring `api/clubs.ts`/
    `api/grassroots.ts`/`api/banter.ts` (own `CommunityGroupsApiError`
    with `.status`, `errorMessageFrom` for the guardian-consent-403/
    duplicate-name-409 exact text, cursor pagination). Plus
    `dimensionBadges()` (renders whichever of city/positionPlayed/
    careerTrack a group actually carries — the backend allows more than
    one to be set even though the Create form only ever submits one) and
    `DIMENSION_LABELS`.
  - **Three new routes, all direct `AppShell` children with NO site
    footer** (not in the Figma frames, matching Clubs/Grassroots/Banter):
    `/groups` (`CommunityGroupsPage.tsx`, Browse — `GET
    /community-groups`), `/groups/new` (`CreateCommunityGroupPage.tsx` —
    `POST /community-groups`), `/groups/:groupId`
    (`CommunityGroupPage.tsx` — `GET /community-groups/:id` +
    `GET /community-groups/:id/members`). `new` is a static segment and
    outranks `:groupId` in React Router v8's specificity ranking (the
    same Grassroots register/fixtures precedent), so `/groups/new` never
    resolves to the group page. All three require a session (every
    endpoint is `JwtAuthGuard`-gated at minimum) — a no-session visit
    renders the established "log in to…" prompt and never calls the API.
  - **Browse**: the 3 combinable dimension filters (city/positionPlayed/
    careerTrack) are plain text inputs that debounce-re-query the server
    (300ms, the `GrassrootsPage` city-filter precedent) — **not** the
    "collapsed dropdown" the Figma frame shows, since no endpoint returns
    the distinct values in use and the DTO itself explicitly does not
    enforce a fixed allow-list (flagged, disclosed in-code, not silently
    diverged from). The "Search groups by name" field stays
    client-side-only over the loaded page (`GET /community-groups` has no
    name-search param), the same `ClubsPage` discipline. **Two Figma
    empty states, both built**, chosen by how many dimension filters are
    active: exactly one → "No groups in {value} yet" + a "Create the
    first group" CTA (frame 3); two or more → "No groups match those
    filters" + "Reset filters" (frame 2, whose own copy explains a group
    is designed to carry exactly one dimension in practice). Two further,
    undesigned cases get plain messages: zero filters and a genuinely
    empty catalogue → "No groups yet."; the client-side name filter
    matching nothing → "No groups match that name." All four are
    disclosed judgment calls. The Figma "· 248 groups" filter-summary
    count is **not** reproduced — `GET /community-groups` has no
    total-count field (only `items`/`nextCursor`, Section 5.5 keyset
    discipline), so a true total isn't knowable without fetching every
    page. Browse cards render **no Join button** (per the design — join
    lives only on the group page).
  - **Group Page**: header (monogram, name, dimension badge(s), member
    count, a "✓ Joined" pill when `joined`), a `GroupJoinButton` (new,
    same "act, then trust the real response" shape `ClubJoinButton`
    uses), and a paginated roster (`GroupMemberRow`, new — identical
    shape to `ClubMemberRow`: initials avatar + name + a Follow/Following
    toggle with no per-caller `isFollowing` field, so it starts "Follow"
    and self-corrects in-session, the same known Decision Log #153-class
    gap `ClubMemberRow` already flags). A real 404 renders an honest
    "Group not found" state. **Both `POST` and `DELETE
    /community-groups/:id/join` are `GuardianConsentGuard`-gated**
    (unlike Clubs' `JwtAuthGuard`-only join/leave) — a restricted-pending
    minor's click surfaces the guardian-consent message with a link to
    `/guardian-consent`, via a new `community-groups/errors.ts`
    (`isAwaitingConsent`, mirroring `grassroots/errors.ts`).
  - **Create a Group**: name + a "Group type" segmented control (City /
    Position / Career track) that swaps a single value field below it,
    submitting **exactly one** dimension — the DTO itself accepts "at
    least one," but the Figma form's own copy ("One dimension only…")
    only ever shows one field at a time, and this mirrors that. Surfaces
    the guardian-consent 403 the same way, and the duplicate-name 409
    (`"A Community Group with this name already exists"`) inline
    verbatim. On success, navigates straight to the new group's own page
    (no separate Figma confirmation frame exists — the creator is
    auto-joined server-side, so the group page's own "Joined" pill is the
    confirmation). **The Figma form's "Short description (optional)"
    field is deliberately NOT rendered** — confirmed by reading
    `CommunityGroup` in `schema.prisma` directly: there is no description
    column anywhere in the model, so unlike `ProfilePage`'s disabled Bio/
    Location fields (real, planned-but-unbuilt `User` columns), this
    field has no eventual endpoint to wire to at all. The "No group photo
    or logo" callout **is** reproduced verbatim — real, already-written
    Figma copy citing the same Decision Log #58 precedent.
  - **NO post-composer or group-feed UI was built anywhere, including on
    the Group Page's Joined state** — matching the explicit task
    instruction and `community-groups.controller.ts`'s own header
    comment ("no group-post-composer or group-feed endpoint…
    `CommunityGroupsModule` does not import `FeedModule` at all").
    **Flagged Figma-vs-instruction conflict, disclosed rather than
    silently resolved**: both Group Page frames (4 "Not Joined" and 5
    "Joined") were re-fetched live from Figma before writing any code and
    genuinely DO render a "Group feed" section with two illustrative
    sample posts — this was not assumed from the earlier design-report
    summary. `CommunityGroupPage.tsx`'s own header comment records this
    explicitly: the backend comment's "mirrors Club — Fan Page's own
    no-composer state" comparison only holds for the composer half, since
    Club — Fan Page DOES have a real `GET /clubs/:id/feed` reading actual
    `Post` rows via `Post.clubPageId` — `CommunityGroupMember` has no
    relation to `Post` at all, so there is no real data this illustrative
    section could ever be wired to. No feed section was built on either
    state.
  - **`navigation.ts`**: `{ label: "Groups", to: "/groups" }` flipped
    `available: true` (by omitting the flag) in **both**
    `accountMenuItems` and `drawerNavItems` — the same "flip once the
    route exists" precedent as Clubs/Grassroots/Messages/Notifications/
    Settings. **Not** added to `primaryNavItems` (the desktop icon
    navbar) — Decision Log #282 explicitly placed Groups in the account
    dropdown/drawer only, and that placement was already correctly
    implemented before this PR; only the boolean needed flipping.
    `Header.test.tsx`'s Groups-related assertions updated from
    "disabled, not a link" to "a real link to /groups" in both the
    desktop dropdown and mobile drawer tests.
  - **Verified, all re-measured directly**: `npx tsc --noEmit`, `npm run
    lint`, `npm run build` all clean (one real lint fix needed along the
    way — an `eslint-disable-next-line react-hooks/exhaustive-deps`
    comment referenced a rule this project's eslint config doesn't
    register at all, since the `react-hooks` plugin isn't installed here;
    removed, matching `GrassrootsPage.tsx`'s own `useEffect(() => {
    load(...) }, [load])` pattern instead of suppressing a nonexistent
    rule). `apps/web` vitest — **38 suites / 276 tests, 0 failures → 41
    suites / 300 tests, 0 failures** (3 new suites, 24 new tests —
    `CommunityGroupsPage.test.tsx` 8, `CommunityGroupPage.test.tsx` 10,
    `CreateCommunityGroupPage.test.tsx` 6; no existing test file
    changed). Dev-server smoke test: `/`, `/community`, `/clubs`,
    `/grassroots`, `/groups`, `/groups/new`, `/groups/abc123` all real
    HTTP 200, clean log. No real browser/Playwright check available in
    this environment — same verification ceiling as every prior
    `apps/web` figma-to-code PR.
  - **This closes Decision Log #281's remaining frontend half — Community
    Groups is now fully wired end to end (design → backend → frontend),
    the same three-step arc Grassroots and Banter Rooms both already
    completed.** Cross-checked against this file's own running Sprint 3
    log before claiming Sprint 3 itself is done: Banter Rooms (backend +
    frontend), Direct Messaging (backend + frontend), Notification Centre
    (backend + frontend), and now Community Groups (backend + frontend)
    all appear complete here. **Stated with an explicit caveat, not as an
    unconditional claim**: this session did not independently re-open the
    live Build Plan Section 6 docx to re-verify Sprint 3's own literal
    "done when" exit criterion — only this file's own accumulated log was
    checked, and that log has gone stale before (see this file's own
    "Keeping this file current" section). Whoever finalizes/merges this
    PR should do that direct docx check before formally declaring Sprint
    3 closed.
  - **Merged as PR #242** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on `main`, per
    this file's own "Keeping this file current" rule (same correction
    the `sprint-3/community-groups-backend` and
    `sprint-6/leaderboard-read-rollup` bullets already made for
    themselves).
- **`sprint-6/leaderboard-read-rollup` (backend-api, 2026-09-14) builds
  the Leaderboard read-side + rollup — Build Plan Section 4.9, Sprint 6,
  the first Sprint 6 backend work, run ahead of the rest of Sprint 6 by
  the same founder-authorised-early-start pattern `admin`/`contest`/
  `grassroots`/`banter`/`messaging`/`notifications`/`community-groups`
  all already used. `services/api` only, no Figma/`apps/web` touched.
  Decision Log #292.** Report: `services/api/src/modules/leaderboard/README.md`
  (rewritten from its Sprint-6-placeholder state).
  - **New `LeaderboardModule`**, wired into `app.module.ts`: `GET
    /leaderboard?period=&cursor=&limit=` (`JwtAuthGuard`-only, Decision
    Log #129 — no logged-out view; no `@CurrentUser()` needed, the
    response carries no per-caller field, matching `GET /clubs`/`GET
    /banter-rooms`'s own "reading a directory isn't caller-scoped" shape,
    not `GET /posts/feed`'s), reading **exclusively** from the
    materialized `LeaderboardEntry` table — never aggregating
    `PointsLedgerEntry` on read, and a period the rollup hasn't touched
    yet returns an **empty page, not an error**. A new
    `LeaderboardRollupService` does the writing.
  - **Period format: ISO-8601 week (`"YYYY-Www"`, e.g. `"2026-W33"`),
    hand-rolled with plain `Date`/UTC methods in a new `iso-week.util.ts`**
    — confirmed via `grep -n "date-fns\|dayjs\|luxon\|moment" package.json`
    that this repo has zero date-library dependency, and
    `contest.service.ts`'s own `resolveRoundWindows` already sets the
    precedent of hand-rolling date arithmetic rather than adding a
    dependency for one module's math. Every computation is exclusively
    UTC (`Date.UTC`/`getUTC*`/`setUTC*`) — the exact DST-safety lesson
    `account-deletion-sweep.service.ts`'s own comment already documents
    (`setMonth` vs `setUTCMonth`). Provides both directions: date → period
    string, and period string → `[Monday 00:00:00 UTC, next Monday
    00:00:00 UTC)` boundary, plus a `getPreviousIsoWeekPeriod` that
    re-derives across an ISO-year boundary (week 1 of a year does not
    precede from "week 0" — it precedes from the *prior* ISO year's week
    52 or 53) rather than naively decrementing the week number. **All 31
    unit tests for this file were built against independently hand-derived
    reference dates** (the classic ISO-8601 `2008-12-29 → 2009-W01` /
    `2010-01-01 → 2009-W53` year-boundary examples, verified by plain
    weekday arithmetic anchored on the widely-documented fact that
    `2009-01-01` is a Thursday — not generated by running the
    implementation against its own output and asserting on that).
  - **Rollup mechanism: a `@Cron('0 */15 * * * *')` job** (no
    `EVERY_15_MINUTES` member exists on the installed `@nestjs/schedule`'s
    `CronExpression` enum — confirmed directly against
    `cron-expression.enum.d.ts`; this literal string matches its own
    `EVERY_10_MINUTES`/`EVERY_30_MINUTES` `"0 */N * * * *"` shape) in
    `LeaderboardRollupService`, reusing the already-globally-registered
    `ScheduleModule.forRoot()` — `AccountDeletionModule`'s own precedent,
    no new scheduling infra added. Each tick recomputes **both** the
    current ISO week **and** the immediately-preceding one — cheap
    insurance against the period-boundary edge case (a `PointsLedgerEntry`
    row awarded in the last few minutes of a week, read by a tick that
    lands just after the Monday-00:00-UTC rollover), instead of building
    separate finalization logic; a re-run on an already-settled period is
    a harmless idempotent no-op. `rollupPeriod(period)` runs **one** raw,
    parameterized `$queryRaw` aggregation — a CTE summing
    `PointsLedgerEntry.points` per `userId` (`INNER JOIN User`, filtered
    to `occurredAt` within the period's UTC boundary AND
    `User.accountStatus = 'active'`), then an outer `SELECT` computing
    `RANK() OVER (ORDER BY total DESC)` — Prisma's query builder cannot
    express a `GROUP BY` + window function, the same class of gap
    `clubs.service.ts`'s own raw-SQL precedent in this codebase exists
    for. Each aggregated row is then upserted into `LeaderboardEntry` via
    its existing `@@unique([userId, period])` key; a user with zero
    `PointsLedgerEntry` rows in the period is never materialized at all.
  - **Anti-gaming cap: `ENGAGEMENT_POINTS_CAP_PER_PERIOD = 100`**, in a
    new `leaderboard.constants.ts` — deliberately **not** added to
    `points/points.constants.ts` (that file is the write side's own
    concern; the cap is exclusively a read-side/rollup concern, per that
    file's own already-flagged follow-up). Applied via `LEAST(SUM(...),
    100)` in the raw SQL to **only** the summed contribution from
    `engagement_post`/`engagement_like`/`engagement_follow`, **before**
    adding the **uncapped** sum of `contest_weekly_win`/
    `contest_monthly_crown`. Contest points are never capped. Rationale:
    Decision Log #219's own ratio argument (a monthly crown of 250 should
    dominate ~83 posts of baseline engagement; a weekly win's smallest
    payout, 20 for 3rd place, should dominate ~7 posts) only holds if
    unbounded engagement volume can't out-rank it — 100 points is roughly
    2x a single 3rd-place weekly win and under half of the smallest
    1st-place weekly win (50), so a user cannot out-earn even one real
    Contest placement through engagement spam alone, while 100 points
    (~33 posts, ~100 likes, or ~100 follows within one ISO week)
    comfortably exceeds what a real single user does in a week of normal,
    unspammed use.
  - **Active-account exclusion (Decision Log #221), applied at BOTH
    stages**: (a) primary — the rollup's own raw SQL join filters
    `User.accountStatus = 'active'`, so a deactivated/`pending_deletion`
    user's row is simply never written/updated by a fresh rollup tick (an
    already-existing row from before they deactivated is left untouched,
    not deleted — no separate cleanup job, the stale row just sits there
    until read-time filtering hides it); (b) defensive — `GET
    /leaderboard`'s own read query **also** joins `User` and filters
    `accountStatus = 'active'` (mirroring `feed.service.ts`'s
    `ACTIVE_AUTHOR_POST_FILTER` / `users.service.ts`'s
    `ACTIVE_FOLLOW_ENTRY_FILTER` exactly), so a user who deactivates in
    the gap between two 15-minute ticks disappears from reads
    **immediately** rather than waiting up to 15 minutes — proven
    directly by an e2e test that writes a row while a user is active,
    deactivates them, and confirms `GET /leaderboard` hides them while the
    stale row still provably exists in Postgres.
  - **Pagination**: keyset (`rank` ASC, `userId` ASC tiebreak — `RANK()`
    deliberately gives tied users the same rank, Decision Log #61(c)),
    default page size 20 / max 50 per Section 5.5, same opaque-base64
    cursor convention as every other list endpoint in this codebase.
    Postgres's own default null ordering already puts `NULL` `rank`
    values last on an ascending sort (the opposite of MySQL's default),
    so no explicit `NULLS LAST` was needed — though in practice no
    materialized row ever has a null rank.
  - **Explicitly out of scope, per this task's own brief**: no on-read
    aggregation or backfill; no club-scoped filtering (`clubId` stays
    ignored — ties to the still-open Decision Log #74/#128
    represented-club question); no Competition board
    (Prediction/Commentary, Decision Log #72/#73); no `apps/web` or Figma
    change — `LeaderboardPage.tsx`'s Overall board conversion to this real
    endpoint is a separate follow-up PR, not part of this one (the
    existing Contest tab wired by `sprint-2/contest-posting-flow-to-code`
    is unaffected and untouched).
  - **Verification, all re-measured directly (stash/pop before-and-after,
    not estimated)**: mocked suite **56 → 60 suites / 796 → 854 tests, 0
    failures** (4 new suites — `iso-week.util.spec.ts` 31 tests,
    `leaderboard.service.spec.ts` 14 tests,
    `leaderboard-rollup.service.spec.ts` 9 tests,
    `leaderboard.controller.http.spec.ts` 7 tests — 58 new tests, no
    existing test changed; the `getIsoWeekPeriod`/`getPreviousIsoWeekPeriod`
    tests are the 31 hand-derived-fixture tests above). e2e suite (real
    Postgres via docker-compose, Docker Desktop confirmed already running
    in this session) **15 → 16 suites / 140 → 154 tests, 0 failures** —
    new `test/leaderboard.e2e-spec.ts`, 14 tests, calling
    `LeaderboardRollupService.rollupPeriod` directly (the same "call the
    underlying method directly with an explicit period/now" precedent
    `AccountDeletionSweepService`'s own e2e coverage set for its
    `@Cron()`-driven sweep) — proves the raw SQL's genuine correctness
    against a live engine: the cap, the mixed
    capped-engagement-plus-uncapped-contest case on the same user, both
    active-account exclusion stages, period isolation (a point earned in
    one ISO week never counts toward another), ties sharing a rank,
    rollup idempotency (three re-runs, one row, no duplicates), and full
    keyset pagination across 5 users with no gaps or duplicates. `nest
    build` and `npm run lint` both clean. **`User`/`Guardian` safeguarding
    fields untouched — zero `schema.prisma` diff** (`LeaderboardEntry`/
    `PointsLedgerEntry` are both pre-existing Section 3 models; no
    migration needed for this PR).
  - **Merged as PR #243** — this bullet's own text previously said "PR
    opened, not merged"; corrected here in place once the merge was
    confirmed directly against `git log` on `main`, per this file's own
    "Keeping this file current" rule (same correction the
    `sprint-3/community-groups-backend` bullet above already made for
    itself).
- **`sprint-5/admin-moderation-queue-backend` (backend-api, 2026-09-15)
  builds Build Plan Section 4.8 (Admin Service) + Section 8.4
  (Moderation & appeals workflow) end to end — Sprint 5's real blocker, a
  new top-level `moderation` module. `Report` (Section 3) gained
  reviewer/action/appeal-trail columns (migration
  `20260915003318_add_report_moderation_fields`, a real hand-run `prisma
  migrate dev` against both dev and test databases) plus two mechanical
  `AdminUser` reverse relations — a genuine schema addition beyond
  Section 3's original six-field `Report` list, flagged as **Decision
  Log #296**, not silent.**
  Merged as PR #244. Full detail: `services/api/src/modules/moderation/README.md`.
  - **`POST /reports` and `POST /reports/:id/appeal`** — `JwtAuthGuard`
    only, deliberately **not** `GuardianConsentGuard`-gated: a
    restricted-pending minor must still be able to report abuse directed
    at them and appeal a decision made against them. Both are genuine
    spec-gap additions (Section 4 defines neither route literally) —
    flagged as **Decision Log #295** (together with the review-side
    `PATCH /admin/moderation/reports/:id/appeal` route below), built
    anyway per Section 8.4's own workflow text (without a submission
    route nothing could ever create a `Report` row at all).
  - **`GET`/`PATCH /admin/moderation/reports*`** — `AdminJwtAuthGuard` +
    a brand-new `AdminRolesGuard`/`@AdminRoles(...)` — this codebase's
    **first role-gated admin route** (`moderator`/`superadmin` only, not
    `editor` — "an editor should not have queue access," the task
    brief's own explicit instruction). Built as reusable infra in
    `modules/admin/guards/` and exported from `AdminAuthFoundationModule`
    so any future admin route needing role-gating can reuse it directly.
    The role-gate covers **GET too**, not just the mutating routes — no
    view-vs-mutate split anywhere in this controller, only a per-JOB
    split (`AdminUser`'s own schema comment: "authors Articles; actions
    Reports").
  - **Decision Log #138** (a second admin/moderator reviews an appeal,
    never the original reviewer) is hard-enforced in code, not just
    documented. An overturned appeal reverses the report to `'open'`
    while preserving `appealStatus: 'overturned'` as history (never reset
    to `null`); `actionReport()` clears stale appeal fields on
    re-actioning so a fresh appeal cycle isn't blocked by a prior one.
  - **No denormalized `reportedUserId` column** — `Report.targetId` is a
    bare string pointing at three different tables depending on
    `targetType`, so "who is the reported user" is resolved dynamically
    by one shared private method (`resolveReportedUserId`), used by both
    the appeal-eligibility check and both parties' outcome notifications
    (one new comment-only `Notification.type` value,
    `'moderation_decision'`, written inside the same transaction as the
    `Report` update — no migration needed, the column is a plain
    `String`).
  - **`actionTaken` is a recorded decision, not an enforced one** —
    disclosed, not silently assumed: there is no soft-delete on
    `Post`/`Comment` and no admin-triggered `User`-suspend mechanism
    anywhere yet. Recording `content_removed`/`user_suspended` does not
    itself remove content or suspend anyone.
  - **Verification**: mocked suite **60 suites / 854 tests → 64 suites /
    905 tests, 0 failures**; e2e suite (real Postgres/Redis) **16 suites
    / 154 tests → 17 suites / 161 tests, 0 failures** — every
    pre-existing e2e suite still passes alongside the new
    `test/moderation.e2e-spec.ts`, which drives the full
    report → action → appeal → second-reviewer-overturn → re-action →
    re-appeal flow against real rows. `nest build`/`npm run lint` clean.
- **`sprint-5/admin-moderation-queue-frontend` (figma-to-code, 2026-09-15)
  wires the moderation queue into BOTH `apps/admin` (real screens) and
  `apps/web` (report submission, the missing half the backend PR
  surfaced but didn't fix). Merged as PR #245.**
  - **`apps/admin`**: `ModerationQueuePage`/`ReportDetailPage`/
    `AppealReviewPage` converted from disclosed stubs to real data against
    `GET`/`PATCH /admin/moderation/reports*`. **No `GET /reports/:id`
    exists on the backend**, so Report Detail / Appeal Review are reached
    via a router `state` handoff from the queue's own "Review" link, with
    a bounded `findReportById` fallback (re-lists and searches
    client-side, capped at 5 pages) for a direct visit/refresh — flagged
    as **Decision Log #300** (this PR's own internal "candidate #4"
    reference, formally numbered in the same doc-hygiene pass that added
    #295–#302) rather than silently adding a new backend endpoint out of
    a frontend-only PR's scope.
  - **`apps/web`**: a file-wide Figma text search confirmed **no
    report/flag UI was ever designed** anywhere in the file for posts,
    comments, or profiles — so a minimal, disclosed `ReportAction`
    component was built plainly (the same "no Figma frame exists, build
    plain and flag it" precedent `AdminProfilePage.tsx`'s own Change
    Password panel already established) and wired into `PostCard.tsx`:
    Report post / Report user from the post header, Report comment per
    comment — hidden on the caller's own content. **Appeal-submission UI
    is deliberately not built** — no existing settings/notifications
    surface it obviously belongs on yet (`moderation_decision`
    notifications aren't resolved to anything renderable by
    `NotificationsService` — see the Notification Centre's own per-type
    icon-disc treatment, which doesn't cover this type); flagged as
    **Decision Log #301**, a separate follow-up, not silently skipped.
  - **Verification**: `apps/admin` **16 suites / 78 tests, 0 failures**
    (up from 66); `apps/web` **43 suites / 311 tests, 0 failures** (up
    from 300); both `tsc --noEmit`/lint clean, both production builds
    clean. The full flow was independently traced against a real running
    `services/api` + Postgres: submit report → appears in the admin's
    Open Reports queue → actioned → reported user appeals → appears in
    the Appeals tab (client-filtered) → the same admin is blocked from
    reviewing their own appeal (403, Decision Log #138) → a different
    moderator overturns it successfully. `services/api` untouched.
- **`sprint-5/admin-articles-categories-backend` (backend-api,
  2026-09-15) builds Sprint 5's other done-when half — Article/Category
  management, Build Plan Section 4.8 — as its own dedicated top-level
  `admin-content` module (deliberately separate from both `AdminModule`
  and `ModerationModule`, since it has no user-facing routes at all).
  Two sub-steps in one branch: backend first, then `figma-to-code`
  wiring `apps/admin`'s existing stub screens to it — the same
  PR-sequencing convention every other feature pair in this project
  uses.** Full detail: `services/api/src/modules/admin-content/README.md`.
  - **Schema**: `Article.createdAt` and `Category.createdAt`/`.status`
    (`"active"` | `"inactive"`, default `"active"`) are genuine additions
    beyond Section 3's original field lists, flagged per CLAUDE.md's "the
    data model is a fixed spec" rule — Section 3's `Article`/`Category`
    had no timestamp at all, and `ArticlesPage.tsx`'s "Date" column /
    both list endpoints' keyset pagination need one; `CategoriesPage.tsx`'s
    own Figma design already renders a Status column with both values,
    which `Category` had no field to back — flagged together as
    **Decision Log #298**. Migration
    `20260915135512_add_article_category_admin_fields` — a real hand-run
    `prisma migrate dev` confirmed this applies cleanly against both the
    dev and test databases, matching PR #244's own bar. `User`/`Guardian`
    safeguarding fields untouched.
  - **Three more Decision Log candidates (#297), flagged and built
    anyway, same shape as moderation's own #295**: `GET /admin/articles`
    and `GET /admin/categories` (Section 4.8 defines no GET for either
    resource — without one, an admin could create articles/categories
    but never see them) and `PATCH /admin/categories/:id` (no literal
    spec line either, but `CategoriesPage.tsx`'s Status column needs a
    real toggle behind it — see "no category-deletion route" below for
    why this, not a DELETE, is the right primitive).
  - **The GET role-gating question, checked against the real code rather
    than assumed**: the task brief that dispatched this work asked
    whether `GET /admin/articles`/`GET /admin/categories` should be
    open to every admin role or role-gated like moderation's own GET —
    while itself assuming, inaccurately, that moderation already
    separates view from mutate. It doesn't:
    `AdminModerationController` applies `AdminRolesGuard('moderator',
    'superadmin')` to its **entire** controller, GET included — no
    view-vs-mutate split exists anywhere in this codebase's one
    role-gated-admin precedent, only a per-JOB split. **Decision: mirror
    that shape exactly** — `AdminArticlesController`/
    `AdminCategoriesController` both gate `AdminRolesGuard('editor',
    'superadmin')` at the class level, GET included, not just the two
    mutating routes. Reasoning stated in full in
    `admin-content/README.md`'s own "Who may view" section, not silently
    decided either way — logged as **Decision Log #299**, status
    Resolved (a reasoned, already-implemented decision, not an open
    question).
  - **No per-author edit restriction on `PATCH /admin/articles/:id`** —
    a deliberate, disclosed choice: any `editor`/`superadmin` may edit
    any article (the shared-newsroom model most CMSes use), unlike
    `GrassrootsService`'s own team-scoped fixture-management restriction
    — nothing in Section 4.8/8.4 or either Figma screen names a
    per-author restriction for Articles, and the only existing precedent
    for that kind of restriction in this codebase is justified by a
    genuinely different shape of resource (two-party sports records, not
    shared editorial content).
  - **`publishedAt` semantics**: set to `now()` the first time `status`
    moves to `'published'` (from `null`); reverting to `'draft'`
    deliberately does **not** clear a previously-set `publishedAt` —
    preserved as the historical "first went live at" record, the same
    preserve-don't-null precedent `ModerationService.decideAppeal`
    already set for `appealStatus`. Re-publishing a second time is a
    no-op on the field.
  - **`Category.slug` is always server-derived, never client-supplied**
    (`slug.util.ts`'s `slugify()`, re-run on every rename too) — the
    global `ValidationPipe`'s `forbidNonWhitelisted: true` rejects a
    request body containing a `slug` key outright. A duplicate slug (an
    effectively-duplicate name) is a clean `409`, not a raw `P2002` — the
    same pre-check-plus-race-safe-backstop pattern
    `CommunityGroupsService.createGroup` already established for its own
    `nameNormalized` `@@unique` constraint.
  - **No e2e spec added, reasoning stated rather than silently
    omitted**: every method here is a plain `findUnique`/`findMany`/
    `create`/`update` call — no `$transaction`, no raw SQL, no new
    relation/constraint (`Category.slug`'s `@unique` already existed) —
    so none of `test/README.md`'s own three e2e triggers apply, the same
    conclusion `sprint-2/feed-per-user-flags`'s analogous
    per-caller-viewer-state change already reached. The full e2e suite
    was re-run as a pure regression check after applying this PR's
    migration: **17 suites / 161 tests, 0 failures, before and after**
    (no e2e file changed).
  - **Frontend (`figma-to-code` half, same branch)**: `ArticlesPage.tsx`
    (list, with a Draft/Published filter — no publish/unpublish UI action
    in this PR's scope, so `PATCH /admin/articles/:id` has a real,
    tested backend but no frontend caller yet, flagged rather than
    silently built beyond the task's own named screens or silently left
    undisclosed), `CreateArticlePage.tsx` (title/body/category, all real
    and submittable — **image upload stays a disabled stub with a
    disclosed note**, per this PR's own explicit scope: no Media backend
    exists yet, even though the `MediaAsset` Prisma model itself already
    does), `CategoriesPage.tsx` (list + a real, interactive
    Active/Inactive status toggle per row — the actual reason `PATCH
    /admin/categories/:id` exists), `AddCategoryPage.tsx` (create, with
    the real 409 duplicate-name message surfaced inline).
  - **Verification**: `services/api` mocked suite **64 suites / 905
    tests → 67 suites / 949 tests, 0 failures** (3 new suites, 44 new
    tests); `nest build`/lint clean. `apps/admin` **16 suites / 78 tests
    → 16 suites / 87 tests, 0 failures** (9 new tests, same test file —
    the old 4-test stub suite was replaced in place); `tsc --noEmit`/
    lint clean; production build clean.
  - **Merged as PR #246** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on `main`,
    same correction as the #242/#243 bullets above. **Seven Decision
    Log candidates this PR and its `sprint-5/admin-moderation-queue-*`
    siblings each flagged (the two `POST /reports`/appeal routes and
    the `Report` schema extension from PR #244; `GET /admin/articles`,
    `GET /admin/categories`, `PATCH /admin/categories/:id` and the
    `Article`/`Category` schema additions from this PR; the GET
    role-gating decision on `AdminArticlesController`/
    `AdminCategoriesController`; and PR #245's missing `GET
    /reports/:id` workaround plus its report-submission-UI decision)
    are now formally logged as Decision Log #295–#301, with a matching
    re-verification of #250's DPIA R8/R9 status as #302** — see the
    `docs/decision-log-moderation-admin-content-backfill` bullet
    directly below for the full detail.
- **`docs/decision-log-moderation-admin-content-backfill` (docx +
  CLAUDE.md only, no app/backend code, 2026-09-15) is a doc-hygiene pass
  over the three merged Sprint 5 PRs above (`sprint-5/admin-moderation-
  queue-backend` #244, `sprint-5/admin-moderation-queue-frontend` #245,
  `sprint-5/admin-articles-categories-backend` #246) — run only after
  confirming all three were genuinely merged (`git log`/`git fetch` on
  `origin/main`, not assumed from a stale local branch), per the task's
  own instruction not to document state that isn't real yet.**
  - **Corrected two stale "Not merged" merge-status lines** — PR #242
    (`sprint-3/community-groups-frontend`) and PR #246 itself, both
    confirmed genuinely merged into `origin/main` (`#243` had already
    been self-corrected by an earlier pass). This file's own "Keeping
    this file current" section exists precisely to stop this kind of
    drift from compounding — found here because it was checked directly
    rather than trusted.
  - **Seven Decision Log candidates, formally logged as #295–#301,
    pulling the exact reasoning from each PR's own README/commit rather
    than re-deriving it**, per the task's own explicit instruction: #295
    (`POST /reports` + `POST`/`PATCH /reports/:id/appeal` as genuine
    spec-gap route additions, PR #244); #296 (the `Report` schema
    extension — `reviewedByAdminId`/`actionTaken`/the appeal-trail
    fields, PR #244); #297 (`GET /admin/articles`, `GET
    /admin/categories`, `PATCH /admin/categories/:id` as genuine
    spec-gap route additions, PR #246); #298 (`Article.createdAt`/
    `Category.createdAt`/`Category.status` schema additions, PR #246);
    #299 (the GET role-gating decision mirroring moderation's own
    class-level `AdminRolesGuard` shape exactly, PR #246 — logged
    **Resolved**, since it's an already-reasoned, already-implemented
    decision, not an open question); #300 (PR #245's missing `GET
    /reports/:id` — the router-`state`-handoff-plus-bounded-fallback
    workaround, formalizing that PR's own internal "Decision Log
    candidate #4" reference); #301 (PR #245's report-submission-UI
    decision — a plainly-built `ReportAction` component wired into
    `PostCard.tsx` since no Figma frame ever existed for report/flag UI,
    with appeal-submission UI deliberately left unbuilt as a named
    follow-up).
  - **Decision Log #250 re-verified against the live repo, not assumed
    stale or assumed still accurate either way — logged as #302.**
    Grep-confirmed `apps/admin/src/pages/users/UsersPage.tsx` and
    `.../settings/SettingsRolesPage.tsx` are still genuine `// STUB`
    files (unchanged by any of the three PRs above), so #250's item (1)
    is only *partially* resolved — the Moderation third of its
    three-screen claim is now real, Users/Roles are not. Re-read
    `schema.prisma`'s live `Report`/`AdminUser` models directly (not
    assumed from memory) to confirm DPIA items (2) R8
    (`Report.reporterId` still a required FK to `User`, so a non-user
    still has no report route) and (3) R9 (`AdminUser.role` still a flat
    `editor | moderator | superadmin` with no child-report staff
    restriction or escalation path) are both **still genuinely open** —
    neither PR #244 nor #245 touched either gap, confirmed rather than
    guessed. Item (4) (no severity field, no append-only audit-trail
    entity across multiple action/appeal cycles) is also confirmed still
    open, per `moderation/README.md`'s own disclosed limitation.
  - **Forward-pointers appended** (this file's own established
    convention for any PR whose text resolves/closes/supersedes an
    earlier entry) to Decision Log **#135** and **#189** (both now
    resolved by #244/#245 — #189 was literally the entry PR #244
    closes) and to **#250** (its item (1) now partially resolved, R8/R9
    confirmed still open) — all three cross-references live in the docx
    itself, not just here.
  - **Numbering note**: `#293`/`#294` are already referenced by number
    in this file's own `sprint-3/community-groups-backend` and
    `sprint-3/community-groups-frontend` bullets (the join-vs-leave
    guard judgment call, and that PR's own closing Decision Log entry)
    but were never actually transcribed into the docx table — the docx's
    real highest entry before this pass was `#292`
    (`sprint-6/leaderboard-read-rollup`). **Deliberately left
    untouched, not silently filled in** — out of this pass's explicit
    scope (PR #244/#245/#246 only), and filling them in here risked
    guessing at content a different PR's own author should write. New
    entries in this pass start at `#295` specifically to avoid colliding
    with those two already-claimed-but-untranscribed numbers. Flagged so
    a future sweep transcribes `#293`/`#294` under their own already-
    committed numbers rather than rediscovering the gap from scratch.
  - **Verification**: `docs/Soccernity_MVP_Build_Plan_v1.7.docx` round-
    tripped through a full close/reopen with `python-docx` after every
    edit (301 rows in the Decision Log table — 1 header + 300 data rows,
    `#1`–`#302` with exactly `#293`/`#294` missing as the flagged,
    deliberate gap above, zero duplicates); the file's own zip container
    was also independently checked with `zipfile.testzip()` (no bad
    entries) and all 10 tables/242 paragraphs were walked end to end
    with no parse errors. **No LibreOffice binary is available in this
    environment** (checked directly — no `soffice`/`libreoffice`
    executable anywhere on `PATH` or the common install directories), so
    this Python-level round-trip is the actual verification ceiling
    here, not a LibreOffice-specific confirmation — stated plainly
    rather than claimed as something it isn't.
- **`sprint-5/admin-users-dashboard-backend` (backend-api, 2026-09-15)
  builds the last two zero-backend Admin Console pieces flagged in
  Sprint 5 — platform-user management and the Dashboard — as two new
  top-level modules, `admin-users` and `admin-dashboard`, sequenced
  together per the task brief (two of the Dashboard's three real stats
  are `User`-table reads the Users module already touches). Stated back
  both judgment calls the task brief asked for, before building either.**
  - **Decision 1 — a new, ADMIN-only `User.accountStatus` value,
    `"suspended"`**, distinct from the self-service `"deactivated"`
    (which is reversible via `POST /auth/reactivate-account`, exactly
    the property an admin-imposed block must NOT have). **A real,
    confirmed gap this closed, not a hypothetical one**: tracing every
    `accountStatus` branch in `AuthService` against the new value found
    that `reactivateAccount()` would have silently reactivated a
    suspended user (it only ever checked for `"pending_deletion"`), and
    `deactivateAccount()`/`deleteAccount()` had no `accountStatus` check
    on the caller at all — a suspended user with a still-live access
    token could self-deactivate, then later self-reactivate via the
    now-fixed `reactivateAccount()`, a two-step escape from suspension.
    **Both fixed**: `reactivateAccount()` now rejects `"suspended"` the
    same generic way it already rejects `"pending_deletion"`;
    `deactivateAccount()`/`deleteAccount()` now reject a suspended
    caller outright. `login()` needed no code change — its existing
    `!== 'active'` generic branch already covered it, extended in
    comment only. Zero schema migration — `accountStatus` is a plain
    `String`, comment-only update on `schema.prisma`.
  - **Decision 2 — admin-triggered delete skips the self-service 30-day
    grace period entirely** (a moderation action, not a self-service
    request). Reuses `AccountDeletionSweepService.hardDeleteUser`
    directly — made `public` (was `private`) specifically for this
    second caller — rather than re-implementing the Guardian-snapshot +
    `ConsentAuditRecord` + cascade sequence a second time. One deletion
    primitive, two entry points: the scheduled sweep (unchanged,
    30-days-past-due `pending_deletion` rows only) and this module
    (immediate, via `PATCH /admin/users/:id { status: "deleted" }`,
    which reads `{ deleted: true, id }` back — nothing left to report
    about a now-gone row).
  - **`GET`/`PATCH /admin/users`** — `AdminJwtAuthGuard` +
    `AdminRolesGuard('moderator', 'superadmin')` on the whole
    controller (mirrors `AdminModerationController`'s shape, not
    `AdminArticlesController`'s `'editor', 'superadmin'`) — managing
    platform users is moderation-adjacent, `AdminUser`'s own "actions
    Reports" job, not the editorial one. `PATCH` covers exactly one
    action per call: `active`, `suspended`, or `deleted`; an admin may
    move any user into `active`/`suspended` from whatever their current
    status is (including undoing an accidental self-deletion request
    within the grace window — clearing a stale `pendingDeletionAt` in
    the same write).
  - **`GET /admin/dashboard/stats`** — `AdminJwtAuthGuard` ONLY, no role
    gate, a deliberate divergence from every other Section 4.8
    controller: the Dashboard is the Admin Console's own landing screen
    for every role, and its stats straddle both the Users
    (moderator/superadmin) and Articles (editor/superadmin) jobs.
    **Real**: New Users (`User.createdAt` within the current UTC
    calendar month — `month.util.ts`'s `startOfCurrentMonthUtc`,
    DST-safe like `account-deletion-sweep.service.ts`'s own
    `setUTCMonth` precedent), Total Articles Published
    (`Article.count({status: 'published'})`), Community Users
    (unfiltered `User.count()`). **`totalVisits` is always an explicit
    `null`** — never a faked `0`, never a dropped key — flagged as its
    own, larger Decision Log candidate: no page-view/visit-tracking
    model or middleware exists anywhere in this codebase, and building
    one is real, unscoped new architecture deliberately left out of this
    PR's scope, per the task brief's own "don't scope-creep into
    pageview tracking" instruction. `DashboardPage.tsx`'s "New users by
    league" breakdown and "Latest posts" table stay sample data too —
    neither was in the task brief's own named stat list.
  - **Frontend**: `UsersPage.tsx` is now real (list + Block/Unblock +
    a two-step inline delete confirm, never a bare irreversible click);
    `DashboardPage.tsx` shows the three real stats with the fourth
    staying "—". `ModerationQueuePage.tsx`'s own stale callout ("no
    account-suspension mechanism wired up yet") is corrected in place —
    a real mechanism now exists on the Users screen, but actioning a
    report as `"Suspend User"` does NOT automatically call it (a
    separate, cross-module decision deliberately left open, noted in
    `admin-users/README.md` rather than wired unilaterally).
  - **A real e2e spec was added** (`test/admin-users.e2e-spec.ts`) —
    hits `test/README.md`'s fourth e2e trigger
    (`admin-auth-isolation.e2e-spec.ts`'s own precedent: a security
    property spanning the whole, really-bootstrapped app). Proves, real
    Postgres/Redis: a suspend really revokes a real refresh token
    (`POST /auth/refresh` rejects it); a delete really removes the
    `User` row immediately (no `pending_deletion` limbo); and — the two
    tests this file exists for — a real `POST /auth/login` and a real
    `POST /auth/reactivate-account` both genuinely reject a suspended
    account end to end, budgeted at exactly 2 of the shared
    5-requests/60s `'auth'`-bucket calls so one app instance suffices.
    No e2e spec added for `admin-dashboard` — reasoning stated in its
    own README (plain `count()` aggregates, none of `test/README.md`'s
    three triggers apply, same conclusion `admin-content/README.md`
    already reached for an analogous module).
  - **Verification, all re-measured directly**: `services/api` mocked
    suite **67 suites / 949 tests → 72 suites / 982 tests, 0 failures**
    (5 new suites, plus 4 new tests added to the existing
    `auth.service.spec.ts`); e2e suite **17 suites / 161 tests → 18
    suites / 170 tests, 0 failures** (every pre-existing e2e suite
    re-run and still green alongside the new file). `nest build` +
    `npm run lint` both clean. `apps/admin` **16 suites / 87 tests → 16
    suites / 100 tests, 0 failures**; `tsc --noEmit`/`lint`/production
    build all clean.
  - **Merged as PR #248** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on `main`, per
    this file's own "Keeping this file current" rule (same correction
    the `sprint-3/community-groups-backend`/`-frontend` and
    `sprint-6/leaderboard-read-rollup` bullets above already made for
    themselves).
- **`sprint-5/admin-media-storage-backend` (backend-api, 2026-09-15)
  builds the Media library — the last zero-backend Admin Console piece
  named in Sprint 5's brief — and is the first real file storage this
  codebase has ever had. Stated back the storage abstraction's shape
  before building, per the task brief's own instruction.**
  - **New `StorageService` abstraction** (`src/storage/`, top-level
    infra mirroring `RedisService`'s own shape) — an **abstract class**,
    not a plain interface + string/Symbol token, so NestJS resolves it
    as a real DI token (`useClass: S3StorageService`) and a unit test can
    construct `MediaService` directly with a fake object cast `as
    StorageService`, no `TestingModule` needed. `S3StorageService` is
    the real implementation, configured **entirely through env vars**
    (`S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/
    `S3_SECRET_KEY`) against the standard AWS SDK v3 client — runs
    unmodified against real AWS S3, Cloudflare R2, Backblaze B2, or
    DigitalOcean Spaces. `S3_ENDPOINT` is the one var that changes
    *behaviour*: unset targets real AWS S3 (virtual-hosted-style URLs,
    the SDK's own default); set targets any other S3-compatible provider
    (path-style URLs + `forcePathStyle: true`, both keyed off the same
    check so they can never disagree). **"Wired but inactive"** —
    the exact `isConfigured` pattern already used for
    `EMAIL_PROVIDER_API_KEY`/`SENTRY_DSN` — but deliberately a **harder**
    failure than either: a still-placeholder `S3_BUCKET`/etc. makes
    `upload()`/`delete()` throw a clear 503, not a silent no-op, since
    file upload is the actual feature here, not an optional side-channel.
    **The actual storage provider is still unresolved — a new Decision
    Log candidate**, mirroring Decision Log #26's own "unbundled,
    cost-aligned for a pre-launch MVP" reasoning for hosting generally.
  - **`GET /admin/media` + `POST /admin/media/upload`**
    (`AdminRolesGuard('editor', 'superadmin')` on the whole controller,
    GET included — mirrors `AdminArticlesController`'s role split, media
    being an authoring tool, not `AdminUsersController`'s
    `'moderator'`/`'superadmin'`). Upload is single-file multipart (field
    `file`, 50MB cap via multer's own `limits.fileSize` — NestJS's
    built-in `transformException` already converts a breach into a clean
    413, no custom filter needed); `type` (`image`/`video`) is always
    derived server-side from the file's own reported MIME type against
    an explicit allow-list, checked before ever calling storage. `GET
    /admin/media` is a genuine addition beyond Section 4.8's literal
    upload-only line — same "an admin needs to see what they uploaded"
    reasoning `AdminContentModule`'s own `GET /admin/articles` used.
  - **`MediaAsset.key String`** — a genuine schema addition, flagged
    (migration `20260915162308_add_media_asset_key`, applied cleanly to
    both dev and test databases — the table was empty, no endpoint had
    ever written to it before this PR). `url` is built from provider
    config at upload time and would break `delete()`'s ability to locate
    the object again if that config ever changes (a moved bucket, a
    swapped-in CDN domain); `key` is the durable, config-independent
    identifier. **Stored on every new row but read/written by nothing
    else in this PR** — see "not built" below.
  - **Key naming**: `media/<uploaderId>/<uuid>-<sanitized-original-filename>`
    — the leading `randomUUID()` is the real collision-avoidance
    mechanism; the sanitized trailing filename is purely for
    human-readability in a bucket browser. A crafted `originalname` like
    `../../etc/passwd.jpg` degrades to a harmless trailing `passwd.jpg`
    segment (proven directly in `media.service.spec.ts`) — path
    components and unsafe characters are stripped before use.
  - **The "5 files" copy already in `MediaUploadPage.tsx`'s pre-existing
    stub** ("Select up to 5 media files, each no larger than 50 MB") is
    a **client-side selection convenience, not a batch endpoint** —
    `POST /admin/media/upload` stays single-file (Section 4.8's own
    literal line is singular, and so is this PR's own task-brief
    wording), and the frontend loops sequentially over up to 5 files,
    one call each, with per-file pending/uploading/done/failed state — a
    disclosed judgment call, not an invented batch response shape.
  - **A real, disclosed dependency-chain finding, not fixed**:
    `npm install`ing `multer` (tried `^2.0.0`/`@2.4.0`/`@2.3.0`, plus a
    forced cache-clean reinstall) kept resolving to `2.2.0` at the
    workspace root — traced to `@nestjs/platform-express@11.2.1`'s own
    **exact, unranged** pin on `multer: "2.2.0"`. This module's own
    explicit dependency (`^2.3.0`) resolves correctly to a genuinely
    separate nested copy at `services/api/node_modules/multer@2.3.0` —
    but `FileInterceptor`'s own internal `require('multer')` (inside
    `@nestjs/platform-express`'s own module directory) still resolves to
    the hoisted **root** `2.2.0` copy regardless, since that's the
    nearest `node_modules/multer` from *that* file's location. `2.2.0`
    carries a real `npm audit`-flagged high-severity DoS advisory
    (`GHSA-qfvm-cv95-jqjf`) that `2.3.0`+ fixes. **Not fixed here** — the
    only real fix is bumping `@nestjs/platform-express` itself to a
    `12.x` major (per `npm audit`'s own `fixAvailable` hint), an
    unrelated, unscoped version bump this media-storage ticket shouldn't
    silently bundle in — the same "flag it, don't fix it as part of an
    unrelated PR" precedent Decision Log #20's own Tier 2/3 triage
    already set for `multer`/`lodash`/`qs`/`body-parser`/`express`.
    Flagged as a new Decision Log candidate for a future, dedicated
    `@nestjs/platform-express` v12 upgrade PR.
  - **Frontend (same PR)**: `MediaLibraryPage.tsx`/`MediaUploadPage.tsx`/
    `MediaPreviewPage.tsx` converted from disclosed `AdminStubScreen`
    stubs to real screens against a new `api/adminMedia.ts` client
    (mirrors `api/adminContent.ts`'s conventions). `adminClient.ts`'s
    `rawRequest` gained one small extension — a `FormData` body skips
    both `JSON.stringify` and the JSON `Content-Type` header, the one
    thing this codebase's admin client had never needed before a real
    multipart upload. **`/media/preview` gained a real `:id` param** (was
    a bare stub route with no identity concept); **there is no `GET
    /admin/media/:id` anywhere in `services/api`**, so the Preview screen
    is reached via the Library row's own router-`state` handoff, with a
    bounded (`findMediaById`, 5-page) fallback for a direct visit/refresh
    — the exact same workaround `ReportDetailPage.tsx`/`api/moderation.ts`
    already established for their own identical gap. Flagged as its own
    Decision Log candidate, not built. Real upload progress isn't
    available through plain `fetch` (would need `XMLHttpRequest`) —
    `MediaUploadPage.tsx`'s per-file pending/uploading/done/failed states
    are a disclosed coarser substitute.
  - **Verification, all re-measured directly**: `services/api` mocked
    suite **72 suites / 982 tests → 75 suites / 1005 tests, 0 failures**
    (3 new suites — `media.service.spec.ts`,
    `admin-media.controller.http.spec.ts`, `s3-storage.service.spec.ts` —
    23 new tests). e2e suite **18 suites / 170 tests, 0 failures,
    unchanged** — re-run in full as a pure regression check after
    applying the new migration; no e2e file added (every `MediaService`
    method is a plain Prisma `create`/`findMany` against a model with
    zero relations, no raw SQL, no transaction — none of
    `test/README.md`'s three e2e-add triggers apply, same conclusion
    `admin-content/README.md` already reached for its own analogous
    module). `nest build` + `npm run lint` + `npx tsc --noEmit` all
    clean. `apps/admin` **16 suites / 100 tests → 16 suites / 110 tests,
    0 failures** (`media.test.tsx` rewritten from 3 stub-disclosure tests
    to 13 real-data tests); `tsc --noEmit`/`lint`/production build all
    clean; a real Vite dev server was started and `/`, `/media`,
    `/media/upload`, `/media/preview/:id` were `curl`'d directly, all
    real HTTP 200s (Vite's SPA fallback — same disclosed ceiling every
    prior `apps/admin`/`apps/web` PR states; no real browser/Playwright
    check available in this environment).
  - **Not built, flagged**: `DELETE /admin/media/:id` (the interface's
    own `delete()` is implemented and unit-tested per the task brief's
    explicit ask for a complete abstraction, and `MediaAsset.key` exists
    specifically so this is trivial to add later — but neither Section
    4.8 nor this PR's own scope names a delete route); `GET
    /admin/media/:id` (see the frontend bullet above); Article's own
    image-upload wiring (`CreateArticlePage.tsx`'s "Upload Images" button
    stays disabled — needs an `Article`-to-`MediaAsset` relation this PR
    deliberately does not add, per its own explicit scope); no
    magic-byte file-type sniffing (MIME validation trusts the
    client-reported `Content-Type`, spoofable, acceptable for MVP); no
    live-bucket verification pending real provider credentials (see the
    storage-abstraction bullet above); the `multer@2.2.0` transitive
    vulnerability (see the dedicated bullet above).
  - **Merged as PR #249** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on `main`, same
    correction as the `sprint-5/admin-users-dashboard-backend` bullet
    directly above.
- **`docs/decision-log-users-dashboard-media-backfill` (docx + CLAUDE.md
  only, no app code, 2026-09-15) is a doc-hygiene pass over the two
  merged Sprint 5 PRs above (`sprint-5/admin-users-dashboard-backend`
  #248, `sprint-5/admin-media-storage-backend` #249) — run only after
  confirming both were genuinely merged (`git log`/`git fetch` on
  `origin/main`, not assumed from a stale local branch), same pattern as
  the prior `docs/decision-log-moderation-admin-content-backfill` pass
  (which covered PRs #244–#246).**
  - **Corrected the two stale "Not merged" merge-status lines above** for
    PR #248 and PR #249 — both confirmed genuinely merged into
    `origin/main`.
  - **Eight Decision Log candidates, formally logged as #303–#310**,
    pulling the exact reasoning from each PR's own module README rather
    than re-deriving it: #303 (the new, ADMIN-only `User.accountStatus:
    "suspended"` value, distinct from self-service `"deactivated"`, PR
    #248); #304 (admin-triggered delete skipping the 30-day self-service
    grace period entirely, PR #248 — logged **Resolved**, a reasoned,
    already-implemented decision, not an open question); #305 (`GET
    /admin/dashboard/stats` being reachable by every admin role, unlike
    every other Section 4.8 controller, PR #248 — logged **Resolved**,
    same reasoning); #306 (`totalVisits` staying an explicit `null` — no
    page-view/visit-tracking infra exists anywhere in this codebase, PR
    #248); #307 (the Media storage provider still being unresolved —
    env-var-configured, S3-compatible, no vendor chosen yet, PR #249);
    #308 (the `MediaAsset.key` schema addition, PR #249); #309 (the
    `multer@2.2.0` high-severity DoS advisory forced by
    `@nestjs/platform-express@11.2.1`'s exact pin — flagged, not fixed,
    needs its own future v12-upgrade PR, PR #249); #310 (the missing
    `GET /admin/media/:id` router-state-handoff-plus-bounded-fallback
    workaround, PR #249 — cross-referenced against #300's own analogous
    `GET /reports/:id` gap rather than duplicating it).
  - **Numbering continued from the prior pass's own range** (#295–#302,
    from `docs/decision-log-moderation-admin-content-backfill`) — the
    real current highest entry in the docx was confirmed directly as
    #302 before assigning #303 onward, not assumed.
  - **`#293`/`#294` deliberately left untouched, still out of scope** —
    referenced by number elsewhere in CLAUDE.md's own
    `sprint-3/community-groups-*` bullets but never transcribed into the
    docx table (the prior pass's own flagged gap); this pass did not have
    accurate, non-guessed content for either and left them exactly as
    flagged, per this pass's own explicit instruction not to fill them in
    speculatively.
  - **Verification**: `docs/Soccernity_MVP_Build_Plan_v1.7.docx` round-
    tripped through a full close/reopen with `python-docx` after the
    edit (309 rows in the Decision Log table — 1 header + 308 data rows,
    `#1`–`#310` with exactly `#293`/`#294` missing as the flagged,
    deliberate gap above, zero duplicates); the file's own zip container
    was also independently checked with `zipfile.testzip()` (no bad
    entries). **No LibreOffice binary is available in this environment**
    (checked directly — no `soffice`/`libreoffice` executable anywhere on
    `PATH` or the common install directories), so this Python-level
    round-trip is the actual verification ceiling here, not a
    LibreOffice-specific confirmation — stated plainly rather than
    claimed as something it isn't.
- **`sprint-4/public-blog-articles-feed` (backend-api + figma-to-code,
  2026-09-15) builds Sprint 4's second deliverable (Build Plan Section
  6) — the public-facing Blog/Articles feed — and wires `BlogPage.tsx` /
  `ArticleDetailPage.tsx` to it, replacing their dummy-data phase.
  Independent of the Sports Hub work (no shared code, no shared schema
  tables). `services/api/src/modules/blog/` is a brand-new top-level
  module, module `AdminContentModule` was NOT touched.**
  - **Three genuinely public endpoints, no guard at all**: `GET
    /articles?categoryId=&categorySlug=&cursor=&limit=` (published only,
    newest-published-first), `GET /articles/:id` (a draft or a
    non-existent id both 404 identically), `GET /categories` (active
    only). `author` exposes only `AdminUser.fullName`, never `email` or
    any other field. Zero `schema.prisma` diff.
  - **Two Decision Log candidates deliberately deferred rather than
    built, flagged not silently decided, both for the same reason —
    making either genuinely useful would mean editing
    `admin-content.service.ts`'s DTOs/service methods, which this
    ticket's own brief rules out**: (1) a real `Article.excerpt` column
    — shipped instead as a plain, unstored, word-boundary
    `truncateExcerpt(body, 200)` computed at read time
    (`blog/excerpt.util.ts`); (2) an `Article`-to-`MediaAsset` image
    relation, now that the Sprint 5 Media library backend exists — a
    schema-only field with no admin write path to ever set it would be
    a dangling column, not a "clean, small addition" once the real
    write-side cost is counted, so `BlogPage.tsx`/`ArticleDetailPage.tsx`
    keep their existing non-functional placeholder media boxes. Also
    flagged, not resolved: marking a `Category` `'inactive'` only hides
    it from `GET /categories`'s own tab list — it does **not** filter
    that category's already-published articles out of `GET /articles`'s
    unfiltered "All" listing or a direct `?categoryId=` link. Full
    reasoning for all three in `modules/blog/README.md`; none required a
    schema migration.
  - **Frontend**: new `apps/web/src/api/blog.ts` (this app's own
    established `api/*.ts` client convention — a plain `fetch` wrapper,
    a typed `BlogApiError` carrying `.status`, cursor pagination — with
    NO Authorization header sent on any call, unlike every other client
    in this app). `BlogPage.tsx`'s category tabs now come from `GET
    /categories`; selecting a specific tab re-queries `GET
    /articles?categorySlug=` for that category's own articles (rather
    than filtering the "All" tab's single loaded page client-side, since
    a category can have articles beyond that page) — a disclosed,
    deliberate limitation given the Figma design has no "Load more"
    affordance for Blog. `ArticleDetailPage.tsx`'s "More Trending News"
    strip is a small, non-critical fetch of `GET /articles`' own first
    page filtered client-side to exclude the current article (no
    exclude-id/related param exists). `blogData.ts` is trimmed to just
    `SAMPLE_COMMENTS` — comments remain explicitly out of scope (no
    comments endpoint anywhere in Section 4), the compose box stays
    disabled with the sample thread visibly captioned as such.
  - **Verified, all re-measured directly**: `services/api` mocked suite
    **75 → 78 suites / 1005 → 1034 tests, 0 failures** (3 new suites, 29
    new tests). No e2e spec added — every `BlogService` method is a
    plain `findMany`/`findFirst` against `Article.categoryId`/
    `Article.authorAdminId`, both already-existing FKs, no raw SQL, no
    transaction, no new relation/constraint — none of `test/README.md`'s
    three e2e-add triggers apply, the same conclusion `admin-content/
    README.md` already reached for its own analogous plain-read module.
    `nest build` + `npm run lint` + `npx tsc --noEmit` all clean.
    `apps/web` vitest **43 suites / 311 → 315 tests, 0 failures** (+4,
    both existing test files rewritten against mocked
    `../api/blog`, no new test file). `npx tsc --noEmit`, `npm run
    lint`, and a production build all clean on both workspaces. **A real
    manual trace was run against a live local Postgres + the real dev
    API + the real dev frontend** (not simulated): a fresh admin editor
    account provisioned directly via SQL (Decision Log #191 — no
    self-service admin registration endpoint exists), a category and a
    draft article and a published article created through the real,
    unchanged `POST /admin/categories`/`POST /admin/articles` endpoints,
    then confirmed live: the published article appears in `GET
    /articles`, filterable by both `?categoryId=` and `?categorySlug=`,
    with a genuinely truncated excerpt; the draft article's real id
    returns the byte-identical `404 {"message":"Article not
    found",...}` a wholly non-existent id returns; the frontend dev
    server serves `/`, `/blog`, and both article detail routes with a
    real HTTP 200 and no server-side errors. All verification-only rows
    (the admin account, category, and two articles) were deleted from
    the local dev database afterward — pre-existing seed data from other
    sessions was left untouched.
  - **Merged as PR #252** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on `main`, same
    correction as the `sprint-3/community-groups-*`/`sprint-6/leaderboard-
    read-rollup` bullets above already made for themselves. The prior
    session's own follow-up ticket for wiring `apps/web` to this feed
    (`sprint-4/public-articles-frontend`) was checked against this
    already-merged commit and found to be a genuine no-op — `api/blog.ts`,
    `BlogPage.tsx`, and `ArticleDetailPage.tsx` were all already wired to
    real data by this PR's own commit; nothing further was built or
    branched for that follow-up ticket.
- **`sprint-4/sports-hub-highlightly-data-redesign` (figma-screen-builder,
  2026-09-16) redesigns all 10 desktop + 10 mobile Sports Hub screens
  against Highlightly's confirmed data categories (Decision Log #6), and
  adds two brand-new sections — Match Momentum and Live Commentary,
  desktop + mobile. Figma design only, no app/backend code. Decision Log
  #6 gets a founder-resolution forward-pointer (Highlightly is the
  selected vendor, design-side only — no backend integration exists
  yet); #149 gets a correction forward-pointer; #311–#322 added.**
  **Routing note**: this task was explicitly routed to
  `figma-screen-builder` by founder decision, a one-time exception to the
  standard `figma-design-system`/`figma-screen-builder` split — the work
  is substantial new data-content enrichment of already-built screens,
  judged closer to screen-building than a token retouch. Full detail:
  `docs/sprint-4-sports-hub-highlightly-data-redesign-report.md`.
  - **Three ticket premises checked live and corrected, not assumed**:
    (1) **10 mobile frames exist, not 8** — the brief missed PR #112's two
    `Sports/Livescores — Mobile` frames. (2) **The screens were not "bare
    placeholder content."** All 18 Highlightly team-stat categories
    already existed on Match/1H/2H Statistics; H2H and Lineups were
    already substantially built. Only **Video** matched the brief's
    description (one grey rectangle). The genuinely missing piece was
    **player-level box scores**, which is what was built, rather than
    padding out duplicate stat rows. (3) **Standing already had a FORM
    column** — but with off-palette `#d3f502` (lime) and `#cfcfcf` (grey)
    chips; mobile Standing had no FORM column at all, which was the real
    gap there.
  - **4 new frames**: Match Momentum desktop (`6508:21059`) — a 90-bar
    minute-by-minute attacking-danger chart, navy above the centre line
    for home / green below for away, modelled directly on Flashscore's
    own Match Momentum feature, with half-time divider, minute axis,
    timestamped event markers, and peak-pressure summary cards. Live
    Commentary desktop (`6508:21321`) — an 18-entry, newest-first,
    timestamped feed covering every event type named in the brief (goals,
    assists, cards, substitutions, VAR decisions, penalties, injury-time
    additions). **Explicitly framed on-screen as an automated event feed,
    not editorial commentary** — a persistent on-screen note states this
    directly ("There is no commentator and no editorial narration."), and
    the design carries no byline, no attributed author, no prose-style
    narration, no personality treatment anywhere. Plus Match Momentum —
    Mobile (`6514:21081`) and Live Commentary — Mobile (`6514:21296`).
  - **16 existing frames enriched**: Video desktop (`760:11533`) and
    mobile (`5821:9009`) rebuilt from one grey rectangle into a full
    clip-type system (7-type filter row, clip grid/list, geo-restriction
    indicator using a navy pill + `semantic/alert` dot, not a red badge —
    white-on-alert fails AA at that size). Match/1H/2H Statistics
    (desktop `640:3737`/`667:151`/`667:1511`, mobile
    `5822:9075`/`5823:9108`/`5823:9317`) gained an 11-player box-score
    table (MIN/G/A/SHOTS/ON TARGET/PASSES/PASS%/TACKLES/FOULS) plus a
    substitutes-used block. Lineups (desktop `667:1952`, mobile
    `5825:9207`) gained a real-time substitutions timeline (MIN/TEAM/
    OFF/ON) and a typo fix (`SUBTITUTES` → `SUBSTITUTES`). H2H (desktop
    `756:11`, mobile `5824:9174`) gained an aggregate head-to-head record
    card (last-10 W/D/L tally, proportional split bar, goal aggregates).
    Standing (desktop `756:6433`) had **100 form chips** rebound from
    off-palette lime/grey to the established palette-compliant W/D/L
    scheme (Decision Log #149); Standing — Mobile (`5821:9068`) gained a
    genuinely new FORM column (14 rows × 5 chips), with two rounds of
    column rebalancing to avoid colliding with PTS. Match Details (+
    Mobile, `632:943`/`5820:8976`) got the extended sub-tab row (below)
    as the entry point into the two new sections.
  - **Information architecture**: Momentum and Live Commentary are added
    as **Level-2 sub-tabs under Match** (`Match Summary | Statistics |
    Lineups | Momentum | Commentary`), not Level-1 siblings of H2H/
    Standings/Video — both are in-match content. Rebuilt on 5 desktop +
    5 mobile frames; mobile sub-tab type/spacing was tightened
    (12px→11px) to fit five tabs inside the 390px convention rather than
    allow horizontal-scroll clipping (the active tab could fall out of
    view). Sports Page (Logged Out/In) was deliberately left structurally
    unchanged — navigation into the new content follows the file's
    existing Sports Page → Match Details → sub-tabs pattern.
  - **A real, disclosed correction to Decision Log #149**: that entry's
    "off-palette yellow/amber for draws and mid-table" on the desktop
    H2H/Standing screens turned out to be **club-crest trademark
    artwork** (399 `#dba111` paints traced directly inside the Liverpool/
    Chelsea crest vectors on H2H alone), not a UI colour choice — there
    was no off-palette amber in the desktop UI itself. The real
    UI-level off-palette values were the form-guide chips'
    `#d3f502`/`#cfcfcf` fills, now fixed. #149's own Status cell in the
    docx carries the forward-pointer.
  - **A genuine debt item found and deliberately left unfixed, flagged as
    Decision Log #312**: `#8f8f8f` @10% stat-bar-track rectangles (×108
    across the 3 desktop statistics screens) are real, non-crest,
    off-palette, unbound UI colour not covered by PR #111's flag/crest/
    jersey-art disclosure — left alone since token/housekeeping work is
    explicitly out of this ticket's scope (`figma-design-system`'s
    domain), same discipline as every other cross-routed task in this
    project.
  - **Player RATING scoped in during design, then removed** (Decision Log
    #313) — ratings are a derived metric not named in Highlightly's
    confirmed category list (possession, shots, corners, fouls, cards,
    passes, box scores), so it was flagged rather than shipped on
    assumption. **Fast-follow exclusions honoured exactly as scoped**:
    no Top Scorers screen (Highlightly endpoint support unconfirmed), no
    match-specific notification/alert-preference UI (blocked on a
    separate unresolved Notification Centre reuse investigation), and
    nothing SportMonks-exclusive (xG, Pressure Index, shot maps, Expected
    Lineups) was designed against data that doesn't exist.
  - **Paint/token audit, measured node-by-node across 73 authored
    subtrees**: 2,363 nodes scanned, **2,212 bound / 0 unbound / 0
    off-palette / 0 `brand/green-tint-28` / 0 new colours**, 0 frame
    overlaps (checked against every page child before AND after creating
    the 4 new frames), Light mode only. Two real layout bugs were caught
    by screenshot and fixed before shipping: a mobile Standing PTS/form
    column collision (root-caused to `TEXT` nodes with
    `textAutoResize: WIDTH_AND_HEIGHT` silently ignoring `resize()` —
    fixed by setting `textAutoResize = 'NONE'` first, a new authoring
    gotcha worth folding into the standing list), and a 17px section-band/
    sub-tab overlap on the two new desktop frames (Level-2 screens need
    the band at y=790, not Level-1's y=710).
  - **Every match data point across all touched/new screens is one
    internally consistent illustrative fixture** (Liverpool 1–3 Chelsea —
    same goals, cards, subs, and VAR calls reused verbatim across
    Momentum's event markers, Live Commentary, the Lineups substitutions
    timeline, the player box scores, and the Video clip titles), so
    whoever eventually wires this can use it as a single reference
    dataset. **Flagged as Decision Log #321, explicitly blocking
    `figma-to-code`**: no `services/api` sports/fixtures module or
    Highlightly API client exists yet, and `MatchData` has zero live
    reads — none of these screens may be wired to real data until that
    backend integration is built as its own separate task.
  - **New Decision Log candidates #311–#322 added** (Build Plan Section
    9) covering: the 8 desktop match-centre frames with no navbar at all
    (#311, a `figma-design-system` follow-up, PR #151 already left this
    legacy set out of scope); the `#8f8f8f` stat-bar-track debt (#312);
    the deferred player-rating question (#313); pre-existing legacy
    score-header crest artwork rendering outside its own reported bounds
    on every match-centre frame (#314); the #149 correction (#315,
    Resolved); the Live-Commentary newest-first ordering (#316, Resolved
    design); the mobile sub-tab type/spacing reduction (#317, Resolved
    design); the Momentum/Commentary Level-2 IA placement (#318, Resolved
    design); the geo-restriction navy-pill treatment (#319, Resolved
    design); the two-different-meanings-per-column palette trade-off on
    Standing (#320, Resolved design); the all-dummy-data/backend-blocked
    status (#321, Open); and the no-prototype-wiring-added note (#322,
    Resolved design).
  - **Merged as PR #253** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on `main`, per
    this file's own "Keeping this file current" rule (same correction
    the `sprint-3/community-groups-*`/`sprint-6/leaderboard-read-rollup`
    bullets above already made for themselves).
- **`sprint-4/sports-hub-highlightly-backend` (backend-api, 2026-09-16)
  is the backend half of the Highlightly integration Decision Log #6
  named as resolved on the design side by the bullet just above —
  `services/api` only, no Figma/`apps/web` touched (both explicitly out
  of scope). `services/api/src/modules/sports` had been a placeholder
  README with zero code, and `MatchData` had zero live reads anywhere,
  confirmed by grep before any change. Report:
  `docs/sprint-4-sports-hub-highlightly-backend-report.md`; module
  writeup: `services/api/src/modules/sports/README.md`. Decision Log
  **#323–#329** added; forward-pointer appended to **#6**'s Status
  cell.**
  - **Real API grounding, not guessed**: every `Raw*` wire-format type
    and endpoint shape is checked against Highlightly's own public docs
    (`https://highlightly.net/football-api/documentation/`) and its
    literal example JSON, fetched live during this task via `WebSearch`/
    `WebFetch` — confirmed base URL (`https://soccer.highlightly.net`),
    auth header (`x-rapidapi-key`, same value whether the account is
    direct or via RapidAPI; `x-rapidapi-host` only for the RapidAPI
    gateway), and the real wrapper-envelope shape per endpoint
    (`{data, pagination}` for matches/highlights, `{groups}` for
    standings, bare arrays for statistics/events/head-to-head, a bare
    `{homeTeam, awayTeam}` object for lineups).
  - **Two real, disclosed Highlightly data gaps found and NOT built
    around** — directly answering this task's own "state that back
    clearly" instruction: (1) `GET /statistics/{matchId}` is
    **team-level only**, no per-match player box-score endpoint exists
    (per-player data is one-player-at-a-time via
    `/players/{id}/statistics` — 20+ extra calls per match, not viable
    under the confirmed 100/day free tier) — the Figma redesign's own
    "player-level box scores" assumption doesn't survive contact with
    the real API; `GET /sports/matches/:id/stats` returns team-level
    stats only, no fabricated player rows. (2) `GET /standings` has **no
    "form" (recent-results) field anywhere** in its documented row
    shape — the Figma Standing screen's FORM column has no real data
    source from this vendor; `GET /sports/standings` returns exactly
    what Highlightly returns, no synthetic `form` value ever added.
    **Also confirmed: no top-scorers endpoint exists** at all (checked
    against the vendor's full endpoint list) — the fast-follow exclusion
    stays excluded.
  - **Modelling approach, stated up front per the task brief**: HYBRID —
    `MatchData` itself normalized (real columns, needed for relational
    filtering by date/league/live-status); statistics/lineups/events/
    h2h/highlights each a JSON column with its own `*UpdatedAt`
    timestamp (every Section 4.6 endpoint reads/writes a WHOLE document
    per match, matching Highlightly's own whole-document API shape); a
    new `Standing` model (one row per `[leagueId, season]`), not a
    `MatchData` column, since standings aren't match-scoped. `MatchData`
    is a genuine schema **redesign** (migration
    `20260916083019_add_sports_hub_highlightly_data_redesign`), flagged
    per CLAUDE.md's own "fixed spec" rule — Section 3's original seven
    fields are all kept, still populated on every write, nothing
    removed.
  - **All eight Section 4.6 endpoints built, plus two genuine additions
    (flagged, Decision Log #327)**: `GET /sports/matches/:id/momentum`
    (pure computation over the cached `events` JSON — no Highlightly
    momentum endpoint exists — see `momentum.util.ts`'s own "honest
    approximation, not a licensed statistic" disclosure) and
    `GET /sports/matches/:id/events` (the Figma redesign's "Live
    Commentary" — an automated event feed, never editorial narration,
    matching that design's own on-screen disclosure; newest-first per
    that design's Decision Log #316). Every route is genuinely public —
    no guard at all, matching `SportsHubPage.tsx`'s own already-shipped
    no-login-gate precedent and `BlogModule`'s identical convention.
  - **Caching/refresh strategy — two layers doing different jobs**:
    Postgres is the durable cache-through store (every successful
    Highlightly response upserted immediately, so a request degrades to
    the last-known row rather than failing when the vendor is
    unreachable or the budget is exhausted); a single Redis key per
    resource (`SportsRefreshLock`, `SET key 1 EX <ttl> NX`) does double
    duty as BOTH the cache-freshness gate and a cross-request stampede
    guard — only the first of many concurrent viewers of the same live
    match ever triggers a real upstream call. Match-list refreshes are
    per-DATE, never per-match (one `GET /matches?date=` call covers
    every league's matches that day; `GET /sports/live-scores` reads the
    SAME cached rows filtered to `status='live'`, sharing today's exact
    lock key, so live-scores triggers zero upstream calls of its own).
    `SPORTS_DATA_MAX_REFRESH_PAGES` (default 1) bounds the worst case.
    TTLs (60s live / 6h scheduled / 24h finished / 30min standings / 6h
    h2h / 10min highlights) are each independently env-overridable,
    reasoned from Highlightly's own documented refresh cadences where
    confirmed.
  - **Daily request-budget guard, rate-limit handled realistically**:
    `SportsDataBudgetService` reserves one Redis `INCR` per real
    outbound call BEFORE it fires, keyed to the current UTC day,
    self-expiring at the next UTC midnight. `HIGHLIGHTLY_DAILY_REQUEST_BUDGET`
    defaults to the confirmed free-tier 100/day. **Stated plainly, not
    assumed unlimited: the real paid-tier budget is unknown** — a
    genuine, open Decision Log candidate (#323), needing a founder
    decision on which plan to buy before this runs in production.
  - **`tsconfig.json` gained `"DOM"` in `lib`** — purely for `fetch`/
    `Response`/`Headers`/`AbortController`/`RequestInit` TYPE
    declarations (the installed `@types/node@20.19.43` does not
    ambiently type global `fetch`, confirmed directly — no `declare
    function fetch` anywhere in the installed package — even though the
    real Node runtime this app requires, `engines >=22.22.0`, has had it
    natively since Node 18). No HTTP client dependency added —
    `HighlightlyClient` uses the runtime's own built-in `fetch`. Verified
    to change no runtime behavior via a full clean `nest build` + the
    complete test suite re-run, both green.
  - **No real Highlightly credentials exist in this environment — stated
    plainly, same disclosed-limitation bar as Postmark/S3 before their
    own real accounts existed: no live round-trip against the real
    Highlightly API was performed. This is unverified in practice.**
    Every wire shape is grounded in the vendor's own public
    documentation's literal example JSON, not a captured real response.
    The one genuinely ambiguous case in the docs (`GET /matches/{id}`'s
    own example wrapped in a top-level array despite being a
    single-resource lookup) is handled defensively (accepts either
    shape) rather than picked one way and hoped for the best.
  - **A real e2e-vs-parallelism gotcha was hit and diagnosed directly in
    this session, not assumed**: running the full e2e suite via a bare
    `jest --config test/jest-e2e.config.js` (default parallel workers)
    produced 176 failing tests from Postgres connection exhaustion
    (`"Too many database connections opened"`), then — after limiting
    workers — a different wave of failures from cross-test data
    corruption, because every e2e file's own `resetDatabase()`
    truncates the WHOLE shared test database in `beforeEach`, and
    multiple suites running concurrently against one Postgres instance
    stomp on each other's in-flight rows. **The real `npm run
    test:e2e` script already runs `--runInBand`** for exactly this
    reason — re-running via that script gave a clean, genuine
    **19 suites / 183 tests, 0 failures** (up from 18/170 immediately
    before this branch — 1 new suite, 13 new tests). Worth remembering
    for any future session tempted to invoke `jest --config
    test/jest-e2e.config.js` directly instead of the real npm script.
  - **Verification, all real, before/after**: mocked suite **78 suites /
    1034 tests → 83 suites / 1097 tests, 0 failures** (5 new suites, 63
    new tests — `sports-data-budget.service.spec.ts`,
    `highlightly-client.service.spec.ts`, `momentum.util.spec.ts`,
    `sports.service.spec.ts`, `sports.controller.http.spec.ts`; no
    existing test file touched); e2e suite **18 suites / 170 tests → 19
    suites / 183 tests, 0 failures** (see the gotcha above) — the new
    `test/sports.e2e-spec.ts` proves graceful degradation to an
    empty/stale result (never a crash) when Highlightly is genuinely
    unconfigured, a real `MatchData`/`Standing` row round-tripping
    through the redesigned schema (including the home/away-by-team-id
    stats assignment, newest-first event ordering, events-derived
    momentum, events-derived lineup substitutions, and the real absence
    of any `form` field on a standings row). `nest build`, `npm run
    lint`, `npx tsc --noEmit` all clean.
  - **Not built, explicitly out of scope per the task brief**: Top
    Scorers (confirmed absent from the vendor); notification/alert
    wiring; any SportMonks-exclusive data (xG, Pressure Index, ball
    coordinates); `apps/web` (the next ticket's job); the Blog/Articles
    module.
  - **Merged as PR #254** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on a fresh
    `origin/main` fetch, per this file's own "Keeping this file
    current" rule (same correction the `sprint-4/public-blog-articles-feed`/
    `sprint-4/sports-hub-highlightly-data-redesign` bullets above already
    made for themselves).
- **`sprint-4/sports-hub-frontend-wiring` (figma-to-code, 2026-09-16) is
  the `apps/web` wiring for both prior Sprint 4 Sports Hub tickets —
  `sprint-4/sports-hub-highlightly-data-redesign` (PR #253) and
  `sprint-4/sports-hub-highlightly-backend` (PR #254), both merged
  before this branch was cut. `apps/web` only — `services/api` NOT
  touched.** Report:
  `docs/sprint-4-sports-hub-frontend-wiring-report.md`.
  - **`SportsHubPage.tsx` is now real data.** New `api/sports.ts` client
    (public, no auth header, same `api/blog.ts` convention). "Live" reads
    `GET /sports/live-scores`; "Today" reads
    `GET /sports/fixtures?date=`. No "list leagues" endpoint exists, so
    the league sidebar accumulates leagues seen across every load
    (picking one still leaves the sidebar browsable); selecting a league
    re-queries the server (`?league=`), the `GrassrootsPage.tsx`
    city-search precedent, not a client-side filter. Every match row now
    links to its own match-centre page; real cursor-based "Load more"
    added. The old "has not yet selected a sports-data vendor"
    disclosure is removed (Decision Log #6 resolved). "Most Recent
    Stories" stays illustrative sample content — no news/story endpoint
    exists in Section 4.6.
  - **New `MatchCentrePage.tsx` (route
    `/sports-hub/matches/:matchId`)** — the match-centre drill-down that
    did not exist in code before this PR. Two-level tabs matching the
    Figma redesign's own IA (Decision Log #318): Level 1 Match | H2H |
    Standings | Video; Level 2 (under Match) Summary | Statistics |
    Lineups | Momentum | Commentary. Every tab's data is fetched
    **lazily** on first activation and cached (a small generic
    `useLazyTab` hook), the same Section 5.5 discipline
    `ProfilePage.tsx`'s Followers/Following lists already use — verified
    directly that landing on the default Summary tab does not trigger
    Statistics/Lineups/Momentum/H2H/Video fetches, and that Commentary
    reuses Summary's already-fetched events (one `getMatchEvents` call,
    not two). No login gate (every `SportsService` route is public); no
    site footer (a drill-down/detail page, same category as
    ClubFanPage/GrassrootsTeamPage/ContestPage).
  - **Two real, confirmed Highlightly data gaps honestly disclosed, not
    papered over** (per the backend module's own README): Statistics
    renders team-level comparisons only, with a disclosure line that
    per-player statistics aren't available from this data source (no
    fabricated box-score rows); Standings renders the real table with a
    disclosure line that recent-form data isn't available (no fabricated
    FORM chips). A match with no `league.id` shows an honest error and
    never calls `GET /sports/standings` at all.
  - **Verification, real before/after**: stashed every change and
    re-ran the full suite against pristine `main` for a genuine baseline
    — **43 suites / 315 tests, 0 failures → 44 suites / 337 tests, 0
    failures** (+1 suite, `MatchCentrePage.test.tsx` 17 tests;
    `SportsHubPage.test.tsx` rewritten 5→10). `tsc`/lint/build all clean.
    **A real end-to-end manual trace against the actual local stack**:
    confirmed graceful degradation with no real Highlightly credentials
    configured (`GET /sports/live-scores`/`fixtures` return a clean
    empty page, never an error); seeded one real `MatchData` row + one
    `Standing` row directly via Prisma (the same "seed directly, no live
    vendor account yet" precedent `sprint-4/public-blog-articles-feed`
    used), then curl'd all 8 real endpoints and confirmed every shape
    matched; **a genuine JS-execution smoke test** — a temporary Vitest
    spec (deleted before commit) rendered the real, unmocked
    `SportsHubPage`/`MatchCentrePage` against the real running backend
    (real `fetch`, no `vi.mock`) and confirmed the full drill-down
    (details → stats → lineups → H2H → standings) genuinely renders real
    fetched data end to end — this is Sprint 4's own literal done-when
    criterion, confirmed explicitly rather than assumed from
    component-level mocked tests alone. Seeded rows deleted afterward,
    re-confirmed empty; dev servers stopped. No real browser/Playwright
    check was available in this environment — the real-backend Vitest
    render plus a live dev-server HTTP smoke test (`/`, `/sports-hub`,
    `/sports-hub/matches/:id`, `/community` all real 200s) is the actual
    verification ceiling here, same as every prior `apps/web` PR.
  - **Not built, per this ticket's own explicit scope**: Top Scorers,
    match-specific notification/alert preferences, any SportMonks-only
    data (xG, Pressure Index, shot maps, Expected Lineups) — none of it,
    no UI space left inviting them. `services/api` untouched. **These
    three exclusions are consolidated into a single, independently
    findable Decision Log entry (#336, "Sports Hub fast-follow") so they
    aren't lost now that Sprint 4 itself is closed** — see the Sports
    Hub status bullet a few lines below for the cross-reference.
  - **Merged as PR #255** — this bullet's own text previously said "Not
    merged — founder's call after review"; corrected here in place once
    the merge was confirmed directly against `git log` on a fresh
    `origin/main` fetch, per this file's own "Keeping this file
    current" rule (same correction the three prior Sprint 4 bullets
    above already made for themselves).
- **`docs/sports-hub-fast-follow-backfill` (docx + CLAUDE.md only, no app
  code, 2026-09-16) is the doc-hygiene pass confirming and recording
  Sprint 4's actual closed state, run only after checking all five
  Sports Hub / Blog tickets against a fresh `origin/main` fetch — same
  convention as every prior doc-hygiene pass in this project.**
  **Sprint 4 is closed.** All five Sports Hub / Blog tickets are merged —
  `sprint-4/public-blog-articles-feed` (PR #252),
  `sprint-4/sports-hub-highlightly-data-redesign` (PR #253),
  `sprint-4/sports-hub-highlightly-backend` (PR #254),
  `sprint-4/sports-hub-frontend-wiring` (PR #255), and a fifth,
  `sprint-4/public-articles-frontend`, which turned out to be a genuine
  no-op once checked against PR #252's own already-merged commit — its
  `apps/web` wiring (`api/blog.ts`, `BlogPage.tsx`,
  `ArticleDetailPage.tsx`) was already built and shipped by PR #252
  itself, so nothing further was branched or merged for it.
  **Build Plan Section 6's own Sprint 4 done-when criterion — "live
  scores update correctly against a real fixture, and a full
  match-centre drill-down works end to end for at least one league" —
  is only PARTIALLY met, stated plainly rather than rounded up.** The
  second half is genuinely confirmed: PR #255's own verification
  rendered the real, unmocked `SportsHubPage`/`MatchCentrePage` against
  the real running `services/api` backend and confirmed the full
  drill-down (details → stats → lineups → H2H → standings) renders real
  fetched data end to end. **The first half — "against a real
  fixture" — is NOT confirmed.** No real Highlightly account or
  credentials exist in this environment (services/api/src/modules/sports/README.md's
  own "wired but inactive" disclosure, the same bar Postmark/S3/Sentry
  each carried before their own real accounts existed) — every match
  row exercised during verification was seeded directly into Postgres
  via Prisma, never fetched live from Highlightly. So "a real fixture"
  currently means "a real, well-formed row in the real schema," not "a
  row Highlightly itself actually sent." Sprint 4 is code-complete and
  fully wired, but its done-when criterion won't be genuinely closed
  until a real Highlightly account exists and at least one live
  vendor-sourced fixture has been traced end to end — tracked as
  Decision Log #328 (the unconfirmed direct-host auth-header behaviour)
  and #323 (the unknown paid-tier request budget), both blocking that
  first real trace, not just cosmetic gaps.
  - **Decision Log #330–#335 added**, backfilling everything the three
    merged tickets flagged but hadn't yet been transcribed into the
    live Build Plan Decision Log: #330 (the sports module's HYBRID
    schema-design approach — normalized `MatchData` + per-sub-resource
    JSON columns + a new `Standing` model — a genuine schema redesign,
    Resolved/implemented); #331 (the two-layer Postgres-durable-cache +
    Redis-stampede-guard caching/refresh strategy, Resolved/implemented);
    #332 (the `figma-screen-builder` routing override for the Sports
    Hub Highlightly redesign — a founder-directed one-time exception to
    the standing `figma-design-system`/`figma-screen-builder` split,
    logged per this project's own standing rule that routing overrides
    must always be logged, matching the PR #102/#110/#130/#151
    precedent); #333 (`Article.excerpt`, deferred — Blog serves a
    computed truncation instead, Open); #334 (an `Article`-to-`MediaAsset`
    image relation, deferred — a dangling column with no write path
    would be worse than not adding it, Open); #335 (an inactive
    `Category` doesn't retroactively hide its own already-published
    articles from `GET /articles`, Open — a real product judgment call,
    not an obvious default).
  - **Decision Log #336 — "Sports Hub fast-follow" — added as its own
    standalone, independently findable entry, status explicitly "Open,
    deferred by design, not an oversight."** Consolidates the three
    items the `sprint-4/sports-hub-highlightly-data-redesign` report's
    own "Fast-follow exclusions" table named and every later Sprint 4
    ticket deliberately left alone, so none of the three get
    silently forgotten now that Sprint 4 itself is closed: **(1) Top
    scorers** — unconfirmed at design time, now confirmed genuinely
    absent from Highlightly's API by the backend ticket (Decision Log
    #326) — the screen stays unbuilt/excluded; whether Soccernity ever
    sources this from a second vendor or drops it permanently is still
    a real, unmade founder call. **(2) Match-specific notification/alert
    preferences** — blocked on a separate, still-unresolved investigation
    into whether this reuses the existing Notification Centre
    infrastructure (Decision Log #279/#290/#291) or needs its own. **(3)
    SportMonks-exclusive data** — xG, Pressure Index, ball-coordinate
    shot maps, Expected Lineups — literally unavailable from Highlightly,
    the vendor actually chosen (Decision Log #6); tied to a possible
    future vendor pivot if Soccernity ever wants this data, not
    something Highlightly itself can ever be made to provide.
    Cross-referenced directly from this CLAUDE.md bullet (not just the
    docx) precisely so it surfaces on a normal sprint-status read
    without anyone needing to know to go check the Decision Log
    specifically for it.
  - **`docs/sports-data-vendor-comparison.md` (2026-09-16, docs-only, no
    app/schema/vendor change) checks API-Football and SportMonks against
    the exact same real-documentation standard `sports/README.md` used
    for Highlightly** — every claim cited to a documented endpoint/entity
    page or a generated client-struct definition, never a marketing page.
    **Does not reopen Decision Log #6** — Highlightly stays chosen.
    Headline finding: of Highlightly's two confirmed gaps (no batched
    player box scores, no standings `form` field), API-Football closes
    both with high confidence (a dedicated batched
    `/fixtures/players?fixture=` endpoint; a `form` string already on the
    standings row) and SportMonks closes the `form` gap the same way
    (via a `form` include) but only *probably* closes the box-score gap
    (a documented `lineups.details.type` nested include, described in two
    independent sources as batched-per-player, but never observed
    populated in an example response). Separately, and unprompted: real
    docs show SportMonks' own video-highlights feature is currently
    **non-functional** ("removed due to a lack of service... finding a
    new data partner," quoted verbatim from `docs.sportmonks.com`) and
    API-Football has **no** video/highlights capability at all — neither
    alternative can currently deliver the highlights half of what this
    project chose Highlightly for. NPFL coverage stays unconfirmed for
    both, same as the original three-way flag. Full detail, every claim
    individually sourced, in the doc itself.
  - **Two stale "Not merged — founder's call after review" lines
    corrected** — `sprint-4/sports-hub-highlightly-backend` (PR #254)
    and `sprint-4/sports-hub-frontend-wiring` (PR #255), both confirmed
    genuinely merged via `git log`/`gh pr list` on a fresh clone before
    editing, not assumed. `sprint-4/public-blog-articles-feed` (PR
    #252) and `sprint-4/sports-hub-highlightly-data-redesign` (PR #253)
    already carried a correct "Merged" line from their own prior
    self-corrections and needed no change. A third, pre-existing stale
    line was also found and fixed while checking this section for
    accuracy — the standalone Decision Log #6 status bullet still read
    "blocks Sprint 4 only... don't hold up auth/consent work on it,"
    unqualified, even though #6 has been resolved (Highlightly chosen)
    since PR #253; a forward-pointer was added there too, both in
    CLAUDE.md and in the docx's own #6 Status cell.
  - **Verification**: `docs/Soccernity_MVP_Build_Plan_v1.7.docx`
    round-tripped through a full close/reopen with `python-docx` after
    every edit (335 rows in the Decision Log table — 1 header + 334
    data rows, `#1`–`#336` with exactly `#293`/`#294` missing as the
    already-flagged, deliberate gap from a prior pass — unchanged by
    this pass, zero duplicates); the file's own zip container was
    independently checked with `zipfile.testzip()` (no bad entries),
    and all 10 tables / 242 body paragraphs were walked end to end with
    no parse errors. **No LibreOffice binary is available in this
    environment** (checked directly — no `soffice`/`libreoffice`
    executable anywhere on `PATH` or the common install directories),
    so this Python-level round-trip is the actual verification ceiling
    here, same as every prior doc-hygiene pass in this project — not a
    LibreOffice-specific confirmation.
- **`figma/homepage-hero-copy-pillar3-refresh` (figma-design-system,
  2026-09-16) is a copy-and-hero-visual retouch of the canonical
  homepage frame (`5204:6728`, Decision Log #46/#152) — Figma design
  only, no app/backend code. Full detail:
  `docs/homepage-breadth-retouch-report.md`.**
  - **Fixed a real, confirmed inaccuracy**: pillar 3 and the closing
    section both described player-level appearance-history logging as
    a real feature — no such concept exists anywhere in the schema;
    fixtures/results are team-level, logged only by a `GrassrootsTeam`'s
    own organiser. Rewritten (hero eyebrow → "WHERE THE WHOLE GAME
    LIVES"; hero lede; pillar 3 title/body → Sports Hub, the one real
    pillar this page gave zero representation to even though it's been
    live since Sprint 4; closing sub) per the ticket's own copy table.
    Hero headline, closing headline/eyebrow, and the hero secondary CTA
    were explicitly out of the ticket's scope and left untouched.
  - **The closing "Browse grassroots teams" CTA was dead for a
    logged-out visitor** (`GET /teams` is `JwtAuthGuard`-only) — the
    founder's resolution (repoint at `/signup`, not make the endpoint
    public) is applied: relabelled **"Register your team"**, and the
    Figma frame itself is renamed to record the routing decision for
    `figma-to-code`. No backend change made or proposed —
    `GET /teams`'s guard is unchanged.
  - **Hero fixture card redesigned**: the single grassroots-only
    illustrative match — the most prominent visual on the page,
    reinforcing exactly the narrow positioning this pass exists to fix
    — is now a two-section split card (`Card — Live Across Soccernity
    (Sports Hub + Grassroots)`): a Sports Hub section (Chelsea 3–1
    Liverpool, reusing this file's own canonical illustrative Sports
    Hub fixture per Decision Log #321, rather than inventing a new
    one) and a Grassroots section (the original, unedited Ikoyi Rovers
    FC 2–1 Surulere United content, relocated not rewritten), plus a
    caption line nodding at Bants/Blog/community. Built by cloning the
    card's own existing auto-layout meta-row/scoreline/hairline block
    — the clone was taken *before* editing the original, so it
    inherited the grassroots content verbatim with zero re-typing —
    and the card auto-hugged its own height (236→420); the hero
    section (`HORIZONTAL` auto-layout, `counterAxisAlignItems: CENTER`)
    and the whole homepage frame (`VERTICAL` auto-layout) both
    reflowed automatically with zero manual position math and zero
    overlap with anything below.
  - **Verified**: paint-binding audit across every touched subtree —
    57/57 solid paints bound, 0 unbound, 0 off-palette, 0 new colours
    (every edit mutated text on an already-bound node or cloned one,
    never authored a fresh fill); a programmatic overlap check of the
    homepage frame's new bounds against every other top-level page
    node — 0 overlaps; light mode only, matching the frame's own
    existing "Light mode only, by instruction" note. No mobile
    counterpart exists for this Pass-2 canonical desktop frame and
    none was requested. A new annotation note was appended to the
    frame's own Annotation Zone documenting this pass, following the
    file's existing per-pass documentation convention.
  - **Not built**: Fixtures/Trending/Talent Clips content stays
    illustrative — Decision Log #6's original "no fixtures/news
    endpoint the homepage reads from" reasoning is unchanged and not
    revisited by this pass, even though Sports Hub itself now has a
    real backend (Decision Log #254) — this specific marketing page
    stays static by design, per its own header comment.
  - **Merged** (PR #258). See the `figma-to-code` follow-up directly
    below for the code conversion this design pass unblocked.
- **`figma/homepage-breadth-retouch-to-code` (figma-to-code, 2026-09-16)
  converts the merged `figma/homepage-hero-copy-pillar3-refresh` retouch
  (PR #258, above) into `HomePage.tsx`/`HomePage.css` — `apps/web` only,
  no Figma/backend code.** Resolves the "Browse grassroots teams" dead
  CTA exactly as that prior ticket's own report decided — repointed
  conceptually at `/signup` in Figma/documentation only, no re-deciding
  here: the CTA in code already linked to `/signup` (it always had),
  only its **label** needed to change, to **"Register your team"**;
  `GET /teams` stays `JwtAuthGuard`-only, no backend touched.
  - **Copy**: hero eyebrow → "WHERE THE WHOLE GAME LIVES", hero lede,
    pillar 3 title ("The professional game, live.") / body, and the
    closing sub — all updated verbatim to the retouch report's own copy
    table. Hero headline, closing headline/eyebrow, and the hero
    secondary CTA left untouched, matching the design pass's own
    declared scope.
  - **Hero fixture card**: rebuilt as the two-section split the design
    now specifies — a new `.home-fixture-card__section` wrapper (one
    per section: meta row + team rows) separated by the existing
    `.home-hairline`, plus a new `.home-pill--section-tag` class that
    reuses the existing green `LIVE`-pill styling (no new colour) for
    the `SPORTS HUB`/`GRASSROOTS` tags. Sports Hub section: Chelsea 3 –
    Liverpool 1, "Premier League · Live" (the same illustrative Sports
    Hub fixture used across the Sprint 4 Sports Hub redesign, Decision
    Log #321). Grassroots section: the original Ikoyi Rovers FC 2 –
    Surulere United 1 / "Lagos Sunday League · Matchday 12" content,
    relocated verbatim, not rewritten. Closing caption: "Plus Bants,
    Blog stories and the community around every match."
  - **Everything else untouched**, per the design pass's own scope:
    Today's Fixtures strip, Talent Clips, Trending Stories, and the
    footer are unchanged — still the same illustrative content, still
    blocked on Decision Log #6's "no fixtures/news endpoint" reasoning
    for *this* static marketing page (Sports Hub itself having a real
    backend now, Decision Log #254, doesn't change that this specific
    page stays static by design).
  - **Verified, real before/after counts**: `apps/web` vitest — **44
    suites / 337 tests, 0 failures → 44 suites / 340 tests, 0 failures**
    (3 new tests in `HomePage.test.tsx` — the retouched copy, the
    relabelled/still-`/signup` CTA, and the two-section hero card; no
    existing test removed). `npx tsc --noEmit`, `npm run lint`, `npm run
    build` all clean.
  - **Merged as PR #259** — this bullet's own text previously said "Not merged —
    Temi's call after review"; corrected here in place once the merge was
    confirmed directly against `git log` on a fresh `origin/main` fetch. (PR #258's
    bullet above already correctly said "Merged".)
- **`docs/decision-log-consistency-audit` (docs only, 2026-09-21) touched 10 Decision Log entries** (#6, #133, #141, #144, #145, #163, #166, #167, #189, #321) to fix internal contradictions, stale Status leading words and stale premises, checked only against other entries/this file (not live code); no entry's substance was re-verified. Details in the PR description.
- **`sprint-2/settings-shell-to-code-account` (figma-to-code, 2026-09-22) — the code half of Decision Log #230/#249's Settings-family consolidation, `apps/web` only. Merged as PR #302; this bullet backfills it, since that PR itself never added a status bullet here — the exact drift this file's own "Keeping this file current" rule exists to prevent.** New shared `SettingsLayout`/`SettingsLayout.css` (Figma `Settings Shell` COMPONENT_SET `6339:16094` — desktop persistent rail, mobile `Settings Back Bar`/`Settings — Menu — Mobile` hub `6289:15068`), `SettingsLandingPage` (`/settings`), `SettingsMenuPage` (`/settings/menu`, mobile-only), `AccountOverviewPage` (`/settings/account` — Account Information/Club Representation/Change Password rendered disabled-with-note, matching the `PrivacySettingsPage.tsx` precedent; Deactivate/Delete are real, re-parented under `/settings/account/deactivate`/`delete` with old flat paths redirecting), and `SettingsSectionPlaceholder` (the honest "designed, not built in the app yet" state for Security/Notifications/Display, each still routed via a `section/*` wildcard at the time). `PrivacySettingsPage` re-parented under the shell (no more own heading/rail). `settingsSections.ts` is the five-section source of truth (`SETTINGS_SECTIONS`, `sectionForPath`) — Account and Privacy marked `built: true`, the other three `false` (the `built` flag itself isn't read by any routing logic; informational only). `SettingsShell.test.tsx` mounts the real route tree via `createMemoryRouter(routes)`. `apps/web` vitest 402 tests, 0 failures at merge.
- **`sprint-2/settings-shell-to-code-security` (figma-to-code, 2026-09-22) is PR 2 of the staged Settings set — the Security & Account Settings section (hub + Two-Factor Auth (SMS) leaf), stacking on PR 1 above.** Report in the PR description. **No live Figma MCP access this session** (the connector needs interactive re-authorization this session doesn't have) — content is reconstructed from this codebase's own already-merged Figma session reports (chiefly `docs/sprint-2-settings-family-consolidation-audit-report.md`, `docs/sprint-2-settings-duplicate-clusters-consolidation-report.md`, `docs/sprint-2-component-hygiene-toggles-nav-report.md`, `docs/sprint-2-settings-desktop-scaffolding-sweep-report.md`) rather than a fresh screenshot/context read — flagged in both page files' own header comments, not silently assumed current.
  - **`SecurityOverviewPage.tsx` (`/settings/security`)** — Figma `2926:8056` (desktop, renamed from "Settings — Security Overview") / `5695:8279` (mobile). Title "Security & Account Settings" (matching the rail label exactly, per this codebase's own established Account/Privacy convention of heading === rail label, and per Decision Log #230's PR6 fix aligning D9's on-screen heading to the rail); intro blurb "Manage your account's security and keep track of your account's usage." (the real D8-ported blurb, verbatim per the audit report); one row, "Two-factor authentication" → `/settings/security/two-factor`. The redundant one-row `Settings — Security & Account` intermediate (`2922:5143`/`5649:8074`, archived in Figma) is correctly not reproduced.
  - **`TwoFactorAuthPage.tsx` (`/settings/security/two-factor`)** — Figma `2926:8294` (desktop) / `5696:8213` (mobile). **No live 2FA/TOTP/SMS backend exists anywhere in `services/api`** (confirmed by grep across `services/api/src` for `two.?factor|totp|2fa` — zero matches). Two rows, "Text message" and "Authentication app" (the two real toggle labels this frame carries, confirmed via `sprint-2/component-hygiene-toggles-nav-report.md`'s own component-swap inventory) — both render as real, visible, **permanently-disabled** toggles with a plain note ("Not adjustable yet — two-factor authentication isn't available yet. This needs a backend security module first."), the same `PrivacySettingsPage.tsx` disabled-row-with-note discipline. **There is no Save/Submit action anywhere on this screen to fake a success path for** — the frame's own "Submit" button (`Frame 5926`) was confirmed, in a prior Figma session, to be dead hidden scaffolding with no live render, and was deleted there; nothing here pretends a change was ever saved. Row descriptions are a disclosed, non-literal gloss (no source records description copy for either row).
  - **`settingsSections.ts`**: `security.built` flipped `false → true`.
  - **`router.tsx`**: `{ path: "security/*", element: <SettingsSectionPlaceholder section="security" /> }` replaced with two explicit routes (`security`, `security/two-factor`), matching Account/Privacy's own no-wildcard convention for built sections — an unmatched deeper path (e.g. `/settings/security/foo`) now falls through to the real top-level 404 page, the same behaviour `/settings/account/foo` already has.
  - **`SettingsShell.test.tsx`**: `security` removed from the "Unbuilt sections" `it.each` table and its deep-unbuilt-path probe repointed to `/settings/notifications/foo` (still a real gap); new `describe("Security & Account Settings section")` block covers the hub's intro/row render, the rail marking Security active on both the hub and the leaf, the leaf rendering both rows permanently disabled with the note, and the no-session log-in prompt on both pages.
  - **Verified**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean; `apps/web` vitest — real before/after via `git stash`, **49 suites / 399 tests, 0 failures → 49 suites / 402 tests, 0 failures** (3 new tests, no existing test removed — the deep-unbuilt-path probe was repointed, not deleted); a real dev-server smoke test on `/`, `/settings`, `/settings/security`, `/settings/security/two-factor`, `/settings/account`, `/settings/privacy` — all real HTTP 200, clean log. No real browser/Playwright check available in this environment — same verification ceiling as every prior `apps/web` figma-to-code PR.
  - Not merged — Temi's call after review.
- **`figma/trends-sidebar` (figma-to-code, 2026-09-26) builds the "Trends for you" desktop right-rail card on `/search` and wires it to the real, public `GET /trending` (`sprint-4/trending-topics-backend`) — `apps/web` only, no `services/api`/Figma changes.** Follows `figma/search-trending-shell` (PR #311, which left "Trending topics" as an empty `PlaceholderSlot`). Figma: desktop `2876:4628` — title `2876:4652`, rows `2876:4654-4667`, refresh `2876:4668`, three-dots `2876:4730-4742`, "See more" `2876:4711`. **The Figma has no single "Trends for you" group** — its parts are flat siblings of the page frame, so `get_design_context` on the card background (`2876:4647`) returns only a blank rectangle; built from the parent frame's metadata plus per-node context/screenshot instead. **Desktop only, by design:** the mobile frame (`5780:8581`) has no trends sidebar, so `TrendsForYou` is only mounted when `!isMobile` and never fetches on mobile (tested).
  - **New `api/trending.ts`** (public, no Authorization header — `TrendingController` has no guard) and **`pages/search/TrendsForYou.tsx`** (+ `trends-card*` styles appended to `SearchTrendingPage.css`; `trends-refresh.svg` / `trends-more.svg` exported from Figma). Rows render `#tag` + "N Posts" (singular "1 Post"). **The Figma's non-hashtag sample rows ("Ronaldo", "Manchester United") are not reproduced** — `GET /trending` returns hashtags only, nothing is fabricated.
  - **Live controls:** the refresh icon re-fetches; "See more" re-requests a larger top-N (`limit` 7 → 20, the endpoint has no cursor by design) and only shows when a full first page came back. **Deliberately disabled, not faked:** the per-row three-dots icon renders visibly disabled — no mute/hide-hashtag action exists anywhere (`search/README.md`). Rows are not links: `/search` has no `?q=` deep-link handling, so tapping a trend to search it is a follow-up.
  - **Verified:** `npx tsc --noEmit`, `npm run lint`, `npm run build` clean; `apps/web` vitest **51 suites / 446 tests, 0 failures** (before figure derived, not re-run: 50 suites / 439 tests, since no existing test was added or removed; new `TrendsForYou.test.tsx` +7; `SearchTrendingPage.test.tsx` updated — 5 → 4 placeholders, mocks `api/trending`, asserts no fetch on mobile). Not visually checked in a real browser (none available here).
  - PR #312 merged.
- **`figma/search-news-fixtures-panels` (figma-to-code, 2026-09-26) builds the "Trending News" (desktop left rail) and "Fixtures" (desktop right rail, under Trends) cards on `/search`, wired to existing endpoints — `apps/web` only, no new endpoints, no `services/api`/Figma changes.** Figma: desktop `2876:4628` — news title `2876:4712`, rows `2876:4715-4729`, clock icon `2876:4638`; fixtures title `2876:4653`, rows `2876:4871`. New `pages/search/TrendingNewsPanel.tsx` (public `GET /articles` via `api/blog.ts`) and `FixturesPanel.tsx` (public `GET /sports/fixtures?date=<today UTC>` via `api/sports.ts`, same `todayIso` convention as Sports Hub); both reuse the `.trends-card` chrome, mount desktop-only (nothing fetched on mobile), and replace two `PlaceholderSlot`s (Suggested and the video carousel remain placeholders).
  - **"Trending" = recency, a disclosed simplification** (code comment): no view/engagement tracking exists on articles (Decision Log #306), so the newest 3 published articles are shown in API order, cut client-side (`GET /articles` has no `limit`). Article has no image (Decision Log #334), so the thumbnail slot is a category-initial tile; blurb is the server `excerpt` (#333). Fixtures: first 7 of today's page, score for live/finished, kickoff time otherwise, monogram crest fallback; rows link to `/blog/:id` and `/sports-hub/matches/:id`. Both cards have live refresh, loading, empty and error states.
  - **Verified:** `npx tsc --noEmit`, `npm run lint`, `npm run build` clean; `apps/web` vitest **52 suites / 453 tests, 0 failures** (before 51 / 446; new `SidePanels.test.tsx` +7; `SearchTrendingPage.test.tsx` updated — 4 → 2 placeholders, asserts no news/fixtures fetch on mobile). Not visually checked in a real browser (none available here).
  - PR #313 merged.
- **`figma/suggested-people-panel` (figma-to-code, 2026-09-26) builds the "Suggested" people card (desktop left rail of `/search`, under Trending News) wired to the real `GET /users/suggested` — `apps/web` only, no `services/api`/Figma changes.** Figma: desktop `2876:4628`, card "Group 293" `2876:4744` (title `2876:4762`, rows `2876:4746-4773`, "See more" `2876:4751`). Desktop-only (no Suggested card in mobile frame `5780:8581`): nothing is mounted or fetched on mobile. New `getSuggestedUsers` in `api/users.ts` and `pages/search/SuggestedPeoplePanel.tsx`; **Follow/Following reuses the existing `followUser`/`unfollowUser` (POST/DELETE `/users/:id/follow`) — no new follow logic.** Suggestions are never already-followed users, so rows start "Follow" and flip in-session (both endpoints idempotent). The Figma photo avatars and `@handle` have no backing data (Decision Log #58), so rows render an initials avatar + display name only. The endpoint has no cursor, so "See more" re-requests a larger `limit` (3 → 10), the `TrendsForYou` approach; refresh re-fetches. The Following pill uses `#fff` on navy (no `--sn-text-on-navy` token, same disclosed exception as `accountActions.css`). The "Videos from Leaderboard" carousel was the last remaining `PlaceholderSlot` — built by `figma/leaderboard-videos-carousel` below.
  - **Verified:** `npx tsc --noEmit`, `npm run lint`, `npm run build` clean; `apps/web` vitest **53 suites / 461 tests, 0 failures** (before 52 / 453; new `SuggestedPeoplePanel.test.tsx` +8; `SearchTrendingPage.test.tsx` updated — 2 → 1 placeholder, asserts no suggestions fetch on mobile). Not visually checked in a real browser (none available here).
  - PR #314 merged.
- **`figma/leaderboard-videos-carousel` (figma-to-code, 2026-09-26) builds the "Videos from Leaderboard" carousel (desktop `/search` main column, Figma frame `2896:4770`) — the last `PlaceholderSlot` on that page (`PlaceholderSlot` and its CSS are now deleted). `apps/web` plus ONE additive `services/api` line.** Desktop-only; nothing mounted or fetched on mobile. New `pages/search/VideosCarousel.tsx` (+ `.css`, `play-circle.svg` exported from Figma), `lib/media.ts`, `recordPostView` in `api/feed.ts`.
  - **Real view counts, click-to-play only.** `POST /posts/:id/view` fires ONLY when a tile is clicked (never on render, scroll or impression — tested); the pill and player then show the count the server returns. `viewCount: 0` renders "0 views" (singular "1 view"); a failed view call keeps the last real value, nothing is incremented locally.
  - **One backend change, needed to show real counts at all:** `POST_SELECT` in `feed.service.ts` did not select `viewCount`, so no post payload carried it. Added `viewCount: true` (additive, no schema/migration; flows into `GET /posts/feed`, club/banter feeds, `POST /posts`). `FeedPost.viewCount` is now a required field on the web type.
  - **Video-vs-image: no existing distinction anywhere** (`PostCard` renders every `mediaUrls` entry as a plain link). Added a documented **v1 extension heuristic** (`.mp4/.webm/.mov/.m4v/.ogv`, query/fragment ignored) in `lib/media.ts`. Extensionless/signed URLs are not recognised.
  - **Disclosed data-source gap — "from Leaderboard" is the Figma title only.** No endpoint returns posts by leaderboard users and `GET /search` post results carry no `mediaUrls`; the only web-reachable source of `mediaUrls` is `GET /posts/feed` (caller's own + followed users' posts), so up to 5 pages are scanned client-side for video posts (max 12 tiles). A real leaderboard-scoped videos endpoint is a backend follow-up. Also: no media-upload endpoint exists for posts, so real video posts are rare today and the carousel will usually show its empty state ("No videos in your feed yet.").
  - Thumbnails are the video's own first frame (`<video preload="metadata" src="…#t=0.1">`), not Figma's photos; playback opens a modal `<video controls>` (Escape/backdrop closes).
  - **Verified:** `apps/web` `tsc`, lint, build clean; vitest **55 files / 473 tests, 0 failures** (before 461; new `VideosCarousel.test.tsx` +9, `lib/media.test.ts` +3, page test updated: 0 placeholders, no feed fetch on mobile). `services/api` `tsc` clean; feed/clubs/banter jest suites 8 suites / 218 tests, 0 failures (e2e not run). Not visually checked in a real browser (none available here).
  - PR opened, not merged — Temi's call after review.
- **`sprint-4/sports-vendor-capability-registry` (backend-api, 2026-09-26) records which sports-data vendor supplies which field, and gates one API field on it — `services/api` only, no frontend/Figma. Forward-pointer appended to Decision Log #336 (Highlightly stays the chosen vendor; #6 not reopened).**
  - **`modules/sports/highlightly-vs-sportmonks.md`** — field-by-field matrix (live scores → odds, ~21 fields), tiers/prices, every claim cited to vendor docs. **Method caveat:** read through a summarising fetch tool, never a live API; no account exists for either vendor.
  - **Corrects the repo, not just extends it:** README data gap #1 ("no batched per-match player box scores") was **wrong** — Highlightly documents a per-match Match Box Score endpoint (exact path unconfirmed: three fetches gave three paths; never traced live). README corrected in place. Also: Highlightly's paid tiers are now public (Pro $9.49/7.5k a day, Ultra $20.99/25k, Mega $45.99/65k — narrows #323 to "which plan"); Highlightly's docs contradict themselves on odds/geo-restriction tiers; SportMonks confirms neither shot maps nor NPFL coverage, and has no video highlights.
  - **Registry** (`sports-data-provider.constants.ts`): `SPORTS_DATA_PROVIDER_CAPABILITIES` (`supported | unsupported | unconfirmed` per field per provider), `providerSupports()` (only `supported` passes), env `SPORTS_DATA_PROVIDER` (default `highlightly`, unknown value fails at boot). Named `DEFAULT_ACTIVE_SPORTS_DATA_PROVIDER` rather than `ACTIVE_SPORTS_DATA_PROVIDER` because it is only the default; the active value is read through `ConfigService`, not `process.env` at import time (would race `.env` loading).
  - **Wiring:** `PublicStandingRow.form` is emitted only if the active provider supports `standingsForm` **and** the row carries data; otherwise the key is absent (never `null`/`[]`). On Highlightly it is always absent — same visible behaviour as before, now enforced by the registry. Flipping the provider changes only what the check reports: `HighlightlyClient` is still the sole `SportsDataClient`, and the service logs a boot warning if another is selected. No new endpoints or UI for top scorers/xG/Pressure Index/shot maps/ratings.
  - **Hidden today (no Highlightly source):** standings FORM, top scorers, xG, Pressure Index, shot maps, player/match ratings (ratings *unconfirmed*, not documented-absent). Player box scores are deliberately not on that list — see the correction above.
  - **Verification:** see the PR description for measured before/after counts.
  - PR opened, not merged — Temi's call after review.
- **`feat/public-report-submission` (backend-api, 2026-09-27) builds
  `POST /reports/public` — the application half of the schema groundwork
  `schema/report-severity-escalation-admin-vetting` (PR #320) laid on
  `Report` (`reporterId`/`reporter` made optional, `reporterContactEmail`
  added, `concernsMinor` added, flagged there as "no application code
  wiring such a route... yet"). `services/api` only, no Figma/`apps/web`,
  zero schema/migration change.**
  - **New `PublicReportsController`** (`reports/public-reports.controller.ts`),
    a **separate controller** from `ReportsController` (which applies
    `JwtAuthGuard` at the class level) — this route has no guard at all
    besides `@AuthRateLimit()`, the same reused throttle
    (`AuthRateLimitModule`/`AuthThrottlerGuard`) every other
    unauthenticated, potentially-abusable route in this codebase carries.
    **This is the only anti-abuse control here** — there is no CAPTCHA
    infrastructure anywhere in this repo, and none was invented for it.
  - **`CreatePublicReportDto`** requires `reporterContactEmail` (`@IsEmail()`),
    `targetType`, `targetId` (UUID), `reason`, and `concernsMinor`
    (boolean) — `reporterContactName` deliberately not collected here,
    though the schema column stays available for a future route that
    wants it.
  - **`ModerationService.createPublicReport`** reuses the existing
    `Report` table and moderation queue (no parallel model): creates a
    row with `reporterId: null`, the given `reporterContactEmail`,
    `targetType`/`targetId`/`reason`/`concernsMinor`, re-checking target
    existence via the same `assertReportTargetExists` `POST /reports`
    already uses (404 on a typo'd/deleted target). On success, fires a
    plain acknowledgment email — **reuses `RegistrationEmailService`**
    (this codebase's one existing "queue a transactional email"
    abstraction; wired into `ModerationModule` directly, the same
    outside-auth/registration pattern `age-reclassification.module.ts`
    already established) via a new `'public-report-acknowledgement'`
    template, fire-and-forget with a logged warning on failure — the same
    "must never block on / fail because of email delivery" discipline
    `RegistrationService`'s own sends use. Copy makes **no promise about
    outcome or timeline** beyond "a moderator will review this," per the
    task's own explicit instruction.
  - A publicly-submitted report shows up in `GET /admin/moderation/reports`
    and can be actioned exactly like any other; `actionReport()`'s own
    nullable-reporter handling (already fixed on the schema PR's branch,
    commit `330ce93`) was re-confirmed unchanged and correct — no
    duplicate notification, no crash on a null `reporterId`.
  - **New Decision Log candidate, not yet transcribed into the Build Plan
    docx**: whether this route's exact shape (no guard, required contact
    email, no `reporterContactName`) should be formally written into
    Section 4 — same open question `sprint-5/admin-moderation-queue-backend`'s
    own README already raised for `POST /reports`/`POST /reports/:id/appeal`.
    Full reasoning in `modules/moderation/README.md`'s own new section.
  - **Verification**: full mocked suite **102 suites / 1367 tests, 0
    failures** (up from 101/1353 immediately before this branch — 1 new
    suite, `public-reports.controller.http.spec.ts` (9 tests), plus 4 new
    `createPublicReport` cases in the existing `moderation.service.spec.ts`
    and 1 new template-coverage test in
    `registration-email.service.spec.ts`, both in existing suites);
    `nest build`, `npm run lint`
    (whole `src` tree), and `npx tsc --noEmit` all clean. No e2e spec
    added — `createPublicReport` is a plain `prisma.report.create()` call,
    no raw SQL/transaction/novel relation, the same category
    `test/README.md`'s own guiding principle already keeps at the mocked
    layer (matching `sprint-2/feed-per-user-flags`'s and
    `admin-content/README.md`'s own identical conclusion for analogous
    changes).
  - PR opened, not merged — Temi verifies and merges.
- **`schema/report-severity-escalation-admin-vetting-application`
  (backend-api, 2026-09-27) is the application half of PR #320's schema
  groundwork (`Report.severity`/`escalatedAt`/`escalatedByAdminId`/
  `escalationNotes`/`escalatedToAuthority`, `AdminUser.childSafetyVetted`/
  `vettedAt`/`vettedByAdminId`) — that PR flagged all of it as "no
  application code... yet." `services/api` only, zero schema/migration
  change (every field already existed).**
  - **`severity` accepted on submission by BOTH `POST /reports` and
    `POST /reports/public`** (optional; defaults `'medium'`, matched
    explicitly at the service layer per `REPORT_SEVERITIES`/
    `DEFAULT_REPORT_SEVERITY` in `moderation.constants.ts`, rather than
    left to Prisma's own DB-level default). Deliberately optional on
    both routes — a reporter rarely has the context to assess severity
    reliably; that's what the moderation queue is for.
  - **The child-safety-vetting gate**
    (`ModerationService.assertChildSafetyVetted`/`isChildSafetyVetted`) —
    fresh-reads `AdminUser.childSafetyVetted` from Postgres on every
    call, the same Section 5.7 "no safety-sensitive state trusted from
    the token" discipline `GuardianConsentGuard` already applies for the
    User side (`AdminAccessTokenPayload` carries only `{sub, role, aud}`,
    same as `AdminRolesGuard`'s own token-trusted `role` check — but
    vetting is deliberately fresh-read while role is not, a disclosed
    divergence argued in `moderation/README.md`). Applied on
    `GET`/`PATCH /admin/moderation/reports*` **regardless of role** — an
    unvetted superadmin is blocked exactly like an unvetted moderator.
    Two shapes: `GET .../reports` silently filters any `concernsMinor:
    true` row out of the list (`conditions.push({ concernsMinor: false
    })`) for a non-vetted admin; `PATCH .../reports/:id` and
    `.../:id/appeal` 403 with a distinct code
    (`CHILD_SAFETY_VETTING_REQUIRED_CODE`) on **direct access** to a
    `concernsMinor` report, checked after the existing 404-before-403
    convention but before any further business-state check (409s). A
    `concernsMinor: false` report never triggers an `AdminUser` lookup at
    all.
  - **New `PATCH /admin/moderation/reports/:id/escalate`** — same guards
    as the other admin-moderation routes, PLUS the vetting gate applied
    **unconditionally**, regardless of the target report's own
    `concernsMinor` value (a report may need escalating precisely
    *because* it wasn't flagged as concerning a minor at submission but
    turns out, on review, to be one). Sets `escalatedAt` = now(),
    `escalatedByAdminId` = the acting admin, plus admin-supplied
    `escalationNotes`/`escalatedToAuthority` — records that a human has
    escalated something; contacts no one itself. Deliberately
    **re-callable** (not one-shot, no status gate) — a vetted admin can
    escalate internally first (`escalatedToAuthority: false`) and later
    call it again once they've actually made an external report, each
    call overwriting the trail to the most recent state (same
    "no append-only multi-cycle audit trail" limitation already disclosed
    for the review/appeal fields).
  - **New top-level module `admin-staff-vetting`** —
    `PATCH /admin/users/:id/child-safety-vetting`, **superadmin-only**
    (not moderator, a deliberate divergence from every other role-gated
    route in this codebase so far). Sets/unsets `childSafetyVetted` on
    the TARGET admin (`:id`), writing `vettedAt`/`vettedByAdminId`
    together with it: `true` → `vettedAt = now()`, `vettedByAdminId` =
    the calling superadmin (never the target); `false` → both cleared to
    `null` (a disclosed judgment call — this model tracks only the most
    recent vetting decision, no history, same precedent
    `Report.reviewedByAdminId` already sets). No self-vetting
    restriction — a superadmin may vet themselves. Response is an
    explicit `select`-based allowlist (id/email/fullName/role/
    childSafetyVetted/vettedAt/vettedByAdminId), never a raw row spread —
    `passwordHash` is never leaked. **Deliberately its own module**, not
    folded into `AdminModule` (Decision Log #54 scopes that to Admin
    Console account/auth/profile only) or `AdminUsersModule` (a
    different resource, platform `User` management, that happens to
    share the literal `/admin/users` URL prefix this task's own brief
    specified — a disclosed naming overlap, not a route collision, flagged
    in the controller's own header comment and `modules/admin-staff-
    vetting/README.md`). This endpoint performs no verification itself —
    it only records a decision (a real-world DBS/background-check
    confirmation) made outside the system.
  - **Verification, all re-measured directly**: full mocked suite
    **102 suites / 1367 tests, 0 failures → 104 suites / 1403 tests, 0
    failures** (2 new suites, both in the new `admin-staff-vetting`
    module — 36 new tests total: 18 in `moderation.service.spec.ts`, 6 in
    `admin-moderation.controller.http.spec.ts`, 4 in
    `admin-staff-vetting.service.spec.ts`, 8 in
    `admin-staff-vetting.controller.http.spec.ts`). Full e2e suite (real
    Postgres/Redis via docker-compose, `npm run test:e2e`) **26 suites /
    250 tests, 0 failures → 27 suites / 263 tests, 0 failures** (1 new
    suite — `test/admin-staff-vetting.e2e-spec.ts`, 6 new tests, proving
    the genuinely new `AdminUser.vettedByAdminId` self-relation FK
    round-trips against real Postgres, and end-to-end-threading both
    modules: an unvetted moderator blocked from a real seeded
    `concernsMinor` report becomes able to see/action it — same access
    token, no re-login — the moment a superadmin vets them — plus 7 new
    tests added to the existing `test/moderation.e2e-spec.ts`; every
    pre-existing e2e suite re-run and still green alongside both).
    `npx tsc --noEmit`, `npm run lint`, and `nest build` are all clean.
    Full reasoning in `modules/moderation/README.md`'s new sections and
    the new `modules/admin-staff-vetting/README.md`.
  - PR opened, not merged — Temi verifies and merges.
- **`fix/blog-inactive-category-filter` (backend-api, 2026-09-28) closes
  Decision Log #335 — `GET /articles`'s `?categoryId=`/`?categorySlug=`
  filters now also require the referenced `Category` to be `'active'`.
  `services/api` only, zero schema/migration change.** Before this fix,
  an explicit category filter still returned an inactive category's
  already-published articles — only `GET /categories`'s own listing
  hid the inactive category itself. `BlogService.listArticles` now
  ANDs `category: { status: 'active' }` onto both filter branches
  (`categoryId` and `categorySlug`, still independently combinable per
  the DTO's own header comment) — a request scoped to an inactive
  category behaves as if it has no published articles at all (an empty
  page, never an error), matching `GET /categories`'s own "inactive is
  simply absent" behavior. **Deliberately unchanged**: `GET /articles`'s
  unfiltered "All" listing and `GET /articles/:id` are untouched by this
  fix — only the two explicit category filters now respect
  `Category.status`; retiring a category still doesn't retroactively
  un-publish or hide its content outside those two query params. Full
  reasoning in `modules/blog/README.md`'s own Decision Log candidate
  item 3, now marked Resolved. **Verification**: `src/modules/blog`
  suite — 3 suites / 30 tests, 0 failures (up from 27 — one new test
  proving the empty-page behavior, plus the three existing
  categoryId/categorySlug/combined tests updated to assert the new
  `category: { status: 'active' }` clause); `npx tsc --noEmit`,
  `npx eslint src/modules/blog`, and `npx nest build` all clean. Full
  mocked/e2e suites not re-run in this session. Forward-pointer appended
  to Decision Log #335's Status cell in
  `docs/Soccernity_MVP_Build_Plan_v1.7.docx`.
  - **Merged as PR #342** — this bullet's own text previously said "PR
    opened, not merged"; corrected here in place once the merge was
    confirmed directly against `git log` on `origin/main`, per this
    file's own "Keeping this file current" rule.
- **`feat/article-excerpt-field` (backend-api, 2026-09-28) resolves
  Decision Log #333 — `Article.excerpt String?` (nullable, migration
  `20260928204535_add_article_excerpt`) is now a real, admin-curated
  summary field. `services/api` only.** `CreateArticleDto`/
  `UpdateArticleDto` accept an optional `excerpt`
  (`ARTICLE_EXCERPT_MAX_LENGTH = 300`, a fresh constant distinct from
  `excerpt.util.ts`'s own `EXCERPT_MAX_LENGTH = 200`, which bounds the
  computed fallback); `AdminContentService` trims and normalizes a
  whitespace-only value to `null` on write, never storing `""` — the
  same treatment `GrassrootsService.createFixture` already gives
  `opponentName`. Sending `excerpt: ""` on `PATCH` clears a
  previously-set excerpt back to `null`. `CreateArticlePage.tsx` gets a
  new "Excerpt (optional)" field, with a hint explaining the
  automatic-summary fallback, sitting outside the `<label>` element on
  purpose so it isn't folded into the textarea's own accessible name. On
  the public read path, `BlogService.toPublicArticleListItem` uses
  `row.excerpt` when the admin set one, falling back to
  `excerpt.util.ts`'s `truncateExcerpt(body)` when it's null/empty — the
  fallback itself is unchanged, and the public response shape
  (`excerpt: string`) is unchanged, so `apps/web` needed no changes.
  Verification: `services/api` mocked suite 107 suites / 1520 tests, 0
  failures; `tsc`/eslint/`nest build` clean. `apps/admin` vitest 16
  suites / 154 tests, 0 failures; `tsc`/eslint/`vite build` clean.
  Migration applied and verified against both the dev and test
  databases. Appends a forward-pointer to Decision Log #333 in
  `docs/Soccernity_MVP_Build_Plan_v1.7.docx`, and marks
  `blog/README.md`'s own matching Decision Log candidate item 1
  RESOLVED in place. **Merged as PR #343.**
- **`feat/article-cover-image` (backend-api, 2026-09-29) resolves
  Decision Log #334 — `Article.coverImageId String?` (nullable,
  `onDelete: SetNull`, migration `20260928212908_add_article_cover_image`)
  now exists, editable via `CreateArticleDto`/`UpdateArticleDto`
  (validated against a real `MediaAsset` row, `assertMediaAssetExists`,
  before the write runs) and a new picker on `CreateArticlePage.tsx`
  (`CoverImagePicker.tsx`) that reuses the already-shipped `GET
  /admin/media` — a picker, not an uploader; no separate upload flow was
  added.** No Figma frame designs this control — built plain and
  flagged, same precedent as `AdminProfilePage.tsx`'s Change Password
  panel. **There is no "edit article" page anywhere in this codebase to
  wire a counterpart into** — only an inline Publish/Unpublish toggle on
  `ArticlesPage.tsx`'s list — so the task's assumption of one was
  checked and found not to hold. The public Blog read shape (`GET
  /articles`, `GET /articles/:id`) now exposes a resolved `coverImage: {
  url, type } | null` too. **A real, pre-existing, unrelated bug was
  found and fixed as a direct side effect**: `createArticle`/
  `updateArticle` ran with no `select`/`include` at all, so despite
  `apps/admin`'s own TS types already claiming a nested `category` on
  the response, it was never actually there — a latent crash in
  `ArticlesPage.tsx`'s own Publish/Unpublish action, fixed in the same
  stroke as adding `coverImage`. New real e2e coverage
  (`test/admin-content-cover-image.e2e-spec.ts`) — `Article.coverImage`
  is the first relation in this schema to use an *explicit* `onDelete:
  SetNull`, proven against real Postgres, not mocked. **Not done,
  flagged**: `apps/web`'s `BlogPage.tsx`/`ArticleDetailPage.tsx` don't
  render the new field yet. Verified: mocked suite 107 suites / 1520 →
  1535 tests, 0 failures; full e2e suite 29 suites / 275 tests, 0
  failures; `apps/admin` vitest 16 suites / 154 → 161 tests, 0 failures;
  `tsc`/lint/build clean on both workspaces. Appends a forward-pointer to
  Decision Log #334's own Status cell in
  `docs/Soccernity_MVP_Build_Plan_v1.7.docx`. **Merged as PR #344.**

- **`backend/b060-public-profile-toggle` (backend-api, 2026-11-08) builds the Public profile toggle on the backend -- build-register B-060 (founder decision 2026-11-08). `services/api` and docs only: one additive migration `20261121090000_user_profile_public` (one NOT NULL column, default true), no new environment variable, no `apps/*`, no Figma, no Build Plan docx, no Decision Log row. The platform is not live. Full route inventory with a decision for each: `services/api/src/modules/users/README.md` ("Public profile toggle").**
  - **The rule.** `User.isProfilePublic` (default true; a genuine addition beyond Section 3's `User` list, flagged as a Decision Log candidate, not transcribed). When false the profile is followers-only. One shared rule in `users/profile-visibility.util.ts` (`profileVisibleTo`, `postProfileVisibleTo`, `effectiveProfilePublic`): visible when the owner is public, OR under 18, OR the viewer is the owner, OR the viewer follows the owner. Only an explicit `false` is private; the column is only ever read with `isMinor`, so an under-18 account is always effectively public. Read fresh on every request; no cache sits in front of these reads (checked in code).
  - **Settings.** `GET`/`PATCH /users/me/settings` gain `isProfilePublic` (effective value on read). An under-18 account PATCHing it gets 403 `profile_visibility_not_available` (fresh `isMinor` read, whole request refused, nothing written). No notification, email or audit entry on change. Anonymisation resets it to true.
  - **Profile read.** `GET /users/:id/public-profile` gains `isPrivate` and `viewerFollows` (same value as `isFollowing`, kept beside it). A non-follower of a private owner gets a minimal card: `id`, `publicName`, `avatarUrl`, `isPrivate: true`, the per-viewer flags; `bio`, `country`, `coverUrl`, `guardianContact` are null. There is no count on any user read today, so counts are absent by construction. The follower and following lists of a private owner are the same 404 a missing user gets.
  - **Posts.** The owner's posts are a 404 or absent for a non-follower on: single post, comments, like, comment, save, view, view-heartbeat, the club feed, post search (anonymous searchers included), saved posts (dropped from the saver's page, never the text) and the media report. They all inherit it from `visibleToViewer`, `assertPostExists`, `searchPosts` and the media-report lookup. **NOT hidden (adopted defaults, founder-veto-able):** Banter Room posts (a room is an open public forum, Decision Log #403 and B-117), Contest entries (a public act), and comments a private owner wrote on someone else's post (identity necessarily appears; a known gap). Identity (public name, avatar) stays in people search, rosters, the leaderboard, messages and notifications. Staff in the admin console are unaffected.
  - **Known limit, to decide later:** following is instant with no approval, so this limits casual browsing, search and links, not a determined viewer. Follow requests would be a separate decision.
  - **Defaults I adopted, ALL founder-veto-able:** the exemptions above; a hidden saved post is dropped, not shown as an "unavailable" placeholder (the web contract needs a post on every entry, and blocked or deactivated authors are dropped the same way); follower lists are a 404, not an empty list; an under-18 viewer is a stranger like any other; migration `20261121090000` sorts before the already-merged `20261122090000` (plain additive column, `migrate deploy` applies it; `migrate dev` may call it out of order).
  - **Existing tests changed, and why:** pinned Prisma clauses and response shapes that necessarily grew (the `visibleToViewer` and anonymous-lookup filters in `feed.service.spec.ts`, the media-report lookup length, the settings select and response in `users.settings.spec.ts`, `getPublicProfile`'s card in `users.service.spec.ts`, the anonymise payload in the sweep spec) and the settings responses in the `dm-permission-media-sensitive` and `read-receipts` e2e. No assertion was weakened or removed. A missing `isProfilePublic` reads as public, so tests that omit it are unchanged.
  - **Verification (measured):** `tsc --noEmit` clean, eslint clean on the touched modules (only the pre-existing `eslint-env` warning), `prisma migrate diff` against the migrated test database: no difference. Unit, `users feed search post-media account-deletion view-qualification contest banter clubs` plus `write-route-guards` and `env-completeness`: 79 suites passed (1 skipped) / 1,922 tests passed (8 skipped), 0 failures (new: `profile-visibility.util.spec.ts`, `users.service.profile-visibility.spec.ts`, plus HTTP cases in `users.controller.settings.http.spec.ts`). API e2e (real Postgres, private database, `--runInBand`): new `test/profile-visibility.e2e-spec.ts` 33 tests (owner, follower, stranger, anonymous, blocked pair, staff, under-18 owner and viewer; the profile read and every post route in the inventory; follow then unfollow flipping visibility; byte-identical 404 for a hidden post; the 403 code; IDOR; no notification or audit entry on change; the anonymise reset), plus the neighbours `follow feed-reactions feed-pagination-ordering saved-posts-viewer-state post-view-tracking post-delete-and-comment-settings dm-permission-media-sensitive read-receipts account-deletion-sweep profile-block post-media banter clubs contest-exposure admin-search`: 16 suites / 400 tests, 0 failures. A mutation check (removing the filter from `visibleToViewer`) made 6 of the new e2e tests fail, then the file was restored. **Not run:** the full mocked suite, the full e2e suite, Playwright, `apps/*` (untouched). Before-figures were not measured on a clean `main`.
  - **Not built:** the `apps/web` Privacy page toggle (still the disabled row) and the web "private profile" view; follow requests; hiding a private owner's comments, contest entries or Banter posts.
  - PR opened, not merged -- Temi verifies and merges.
- **`backend/email-change-probing` (backend-api, 2026-11-09) implements Decision Log #476: the email-change request no longer reveals whether an address is registered -- `services/api` only; no schema change, no migration, no new environment variable, no `apps/*`, no `.docx`, no `docs/build-register.md`. Supersedes the "known residual" of the `backend/email-change` bullet earlier in this section (and the 400 `email_change_not_accepted` it describes). Full detail: `docs/backend-email-change-probing-report.md`; module writeup: `services/api/src/modules/email-change/README.md`.**
  - **One answer.** `POST /users/me/email-change` is `202 { status: "verification_sent" }` for every request that passes the password and any second factor: usable, taken (any case), malformed, blank, over 254 characters, same as current, a minor's guardian address. Status, body and headers are byte-identical (proved over HTTP with the real controller and service in `email-change.identical-answer.http.spec.ts`, and against real Postgres and Redis in `test/email-change.e2e-spec.ts`). Everything that depends on the address (the lookup, the row, the sending) runs after the response in a background step (`runInBackground` / `processRequest`; `whenIdle()` exists for tests).
  - **What each address causes (emails only):** usable -> the confirm link to it (hashed single-use row, as before); belongs to an account -> a plain "cannot be used because it already belongs to a Soccernity account" email to that address as registered, no link, nothing about the requester (new template `email-change-unavailable`, in the quiet set, untagged); malformed / same as current / guardian address (checked before the lookup) -> nothing. The old address always gets the notice, never naming the new one.
  - **Limits (same `AuthLimitsStore`, hashed keys; the figures are the drafter's, founder-veto-able):** 5 wrong passwords per 15 minutes per account (unchanged; the second `reserve()` after a not-accepted address is removed); NEW 5 requests per hour per account on every outcome, taken after the password and second factor (429 + `Retry-After`); NEW 3 emails per 24 hours per recipient address, covering the confirm link, the "cannot be used" email and the old-address notice, skipped silently with the 202 unchanged. A skipped link creates no row, so it never replaces an earlier pending request with a dead one.
  - **503 `email_change_unavailable` is decided by configuration alone** (`RegistrationEmailService.isWebAppBaseUrlUsable()`, the `buildWebAppLink` rule) and is the first check, before any lookup, slot or password check.
  - **Not touched / follow-ups:** `POST /auth/email-change/confirm` and the `email_changed` guardian event are unchanged. `apps/web` `ChangeEmailPage`, the Figma "Email not accepted" step and Playwright spec 38 still describe the old 400 and need a follow-up. A signed-in, password-confirmed person can still cause one email to an address that belongs to an account; it says nothing about who asked and the caps bound it. Background steps are in-process promises (a process stop between the 202 and the send loses that email).
  - **Adopted defaults to veto (details in the report):** the request cap sits after identity is proven; the recipient share also covers the account's own old-address notice (so the 4th request in a day sends no notice); recipient claim fails open; the "cannot be used" email goes to the stored address, not the typed one.
  - **Verification (measured; before-figures for the same specs were not taken on a clean `main`):** `tsc --noEmit` and eslint (`src/modules/email-change`, `src/modules/auth/registration/email`) clean. Unit: `email-change` + `auth/registration/email` + `write-route-guards.spec.ts` + `env-completeness.spec.ts` **12 suites / 283 tests, 0 failures** (new: `email-change.identical-answer.http.spec.ts`, `registration-email.email-change.spec.ts`; rewritten: the service, limiter and controller specs). API e2e (real Postgres + Redis, private database `soccernity_test_probe`, `--runInBand`), ONLY `test/email-change.e2e-spec.ts`: **35 tests, 0 failures** (the first run had 4 failures, all in the tests: three asserted on rows before the background step finished, one compared the per-IP `x-ratelimit-remaining-auth` counter header, which counts down on every request). **Not run (the QA reviewer runs the full suites at the launch gate):** the full mocked suite, the full e2e suite, every other e2e file, Playwright `e2e/` (spec 38 will fail until the web follow-up), `apps/web`, `apps/admin`.
  - PR opened, not merged -- Temi verifies and merges.
- **`docs/docs-content-removal-decisions-2026-11-10` (docs only, 2026-11-10) records the founder's decisions of 2026-11-10 as Decision Log #482 to #484 and extends `docs/build-register.md` (B-289 and B-290, new Section 83). No application code, schema, Figma, legal draft, DPIA, incident plan, Log Book or `docs/pending-copy-manifest.md` changed. #482 is already BUILT; #483 and #484 are DECIDED, NOT BUILT. Report: `docs/docs-content-removal-decisions-2026-11-10-report.md`.**
  - **#482 (message retention and legal holds, follows #478):** an active legal hold (`AccountHold` type `legal_hold`) on a message's sender or on any other participant of its conversation keeps the message out of the 12-month sweep; `bad_faith` and report-derived holds are not covered. BUILT by PR #711 (merged 2026-11-10, `dfedf80`). Replaces the "no account-hold exemption" statements in the `backend/b287-message-retention` bullet above and in `docs/backend-message-retention-report.md`. Consequence: a held person's old messages also keep the other person's old messages.
  - **#483 (moderator removal of content, new B-289):** Remove Content is enforced for posts, comments and messages (today it is only recorded, for all three). Soft: the row and text stay for staff. A removed message or comment shows "This message/comment was removed by Soccernity" to everyone in the thread; a removed post disappears from every list, search, saved items and count, a direct link answers like a missing post, and its author sees a removed notice. Only the reported item is removed, never the context messages. Offered only for post, comment and message targets. Suspension, holds, escalation and legal action unchanged. Four adopted defaults, veto-able: removal in the same step as recording; an overturned appeal restores the content; a removed contest entry is hidden with any ranking or points effect unchanged; the author's stub on a direct visit. **This settles the "moderator removal of a message is undecided" points** of the `backend/b067-message-report` bullet ("Known gaps"), the `design/w8-privacy-reporting` and `frontend/b284-admin-message-report` bullets, and register Section 81b item 2 / 82b item 1 (each annotated in the register; the older bullets here are history). NOT BUILT. Recording `user_suspended` on a report still does not suspend the user (undecided, untouched).
  - **#484 (media of a removed post, new B-290):** the public copy is withdrawn at once; the private copy is deleted when the removal is confirmed (`reportClosedAt`: appeal window lapsed or appeal upheld), except media protected by the evidence rule (`rejected-media-evidence.util`: the uploader has an active admin hold). B-206 will define evidence set-aside and hooks into the same function. Adopted default: the two-stage form. NOT BUILT. **Code facts the check found:** `PostMediaObjectsService.withdraw` is a no-op for a file that should still be public, and after approval the private original is deleted (`finishPublish`), so the build must make a verified private copy at removal; `reportClosedAt` is computed, not an event, so stage two needs a sweep.
  - **Register:** 290 B-IDs (was 288; 41 with gap frames + 249 without), 146 gap frames unchanged, W5 20 and W8 41; dated notes on B-279, B-206, B-283, B-287, B-067, B-284, B-280; Decision Log 479 -> 482 data rows (#293 and #294 still absent, no duplicates), dated pointers on #478, #475, #462. Verified: docx append-only cell by cell, register compared positionally, counters reconcile. Docx-touching PR: merges alone. A leftover worktree on the branch name `docs/content-removal-decisions-2026-11-10` (broken index) was left untouched; this PR uses `docs/content-removal-decisions-2026-11-10-v2`.
  - PR opened, not merged -- Temi verifies and merges.

- **`ci/skip-tests-docs-only` (CI, 2026-11-10) makes `build-and-test` skip install, lint, unit tests, e2e tests and build when a change touches only documentation -- `.github/workflows/ci.yml` and two new files under `.github/scripts/`; no application code, no `docs/build-register.md`, no Build Plan docx.** Motivation: every run took 17 to 18 minutes (e2e 12, unit 4), also for docs-only PRs like #712. A new first step ("Detect docs-only change") diffs the base commit against HEAD (`HEAD^1` for pull requests, `github.event.before` for pushes) and runs `.github/scripts/docs-only-change.sh`; the remaining steps carry `if: steps.changes.outputs.docs_only != 'true'`. **The job and its name still run and pass**, so the required `build-and-test` check is satisfied (a workflow-level `paths-ignore` would leave a required check pending forever). `dependency-audit` and CodeQL are unchanged. **Docs-only = every changed path is under `docs/` or is a `*.md` file anywhere, EXCEPT three files that code or tests read:** `docs/legal-copy-draft-tos-privacy-policy.md` (imported `?raw` by `apps/web` `legalDocument.ts`), `docs/pending-copy-manifest.md` (read by `pendingCopyManifest.test.ts`) and `docs/admin-two-factor-recovery.md` (read by `two-factor.e2e-spec.ts`). **If a build or test starts reading another file under `docs/` or another `.md`, add it to `PROTECTED` in the script**; `bash .github/scripts/docs-only-change.test.sh` (16 cases, not run in CI) pins the rule. Fail safe: an empty file list, an unreachable base commit, a zero `before` or any error in the step runs the full CI. Checkout now uses `fetch-depth: 0` for the diff. Also skipped on pushes to `main`/`staging` (no post-merge full run for a docs-only merge). Verified: `actionlint` clean; the step's script run against real history (PR #712's range -> `docs_only=true`; a range with `apps/admin` code -> `false`; zero `before` -> `false`). **NOT verified in GitHub Actions: the skip path itself** -- this PR changes `.github/`, so its own CI runs in full; the first docs-only PR after it merges proves the skip. PR opened, not merged -- Temi verifies and merges.
- **`frontend/b295-admin-suspension-appeal-context` (figma-to-code, 2026-11-11) builds the `apps/admin` screens of Figma pass U (build-register B-295; Decision Log #485 suspension on a report, #486 hidden message context, #491, #492; backend B-291 / B-292 / B-293, all merged) -- `apps/admin` and this file only; `services/api`, `apps/web`, Figma, the Build Plan docx, `docs/build-register.md` and `docs/pending-copy-manifest.md` untouched. The server decides every rule; the pages mirror one list and show what it returns.**
  - **Report detail.** Suspend User is offered only for user, post, comment and message reports (`isUserSuspensionTarget` mirrors the API's list; a test fails if the list drifts) and is not offered, with a helper line saying why, for Banter room, team and fixture reports. Pressing it opens a confirmation (`SuspendAccountDialog`, mode "report": five-bullet consequence list, no category asked, the report supplies it) and sends nothing until confirmed; confirming records `user_suspended` and the page shows the Account suspended pill and callout (the server really suspends in the same step). A 403 `child_safety_vetting_required` closes the dialog and shows the existing restricted card (this now also covers a message report involving a child); another 4xx shows the server's message in the dialog, anything else a fixed line.
  - **Record an appeal on someone's behalf** (`RecordAppealDialog`): the button appears only on an actioned `user_suspended` report with no appeal; reason required (trimmed, max 500, empty is stopped client-side with "Enter a reason for the appeal."); `POST /admin/moderation/reports/:id/appeal { reason }`; the API's window-closed message is shown as it comes (the window length is never printed); vetting 403 -> restricted state. On success the page shows "Pending — recorded by staff" (driven by `appealRecordedByStaff`) and a callout. The appeal review screen shows the same pill, the card title "Appeal recorded by staff" and a note, and shows the API's 403 message (`appeal_recorder_cannot_decide`, or the actioner rule) in the decision card.
  - **Hidden context.** When the report detail says `contextHidden`, the page shows the reported message with its Edited row, no original text, no context list and the single callout "Context hidden: this involves a child" (and not the "reporter added none" line, which would be untrue).
  - **User page and Users list.** A "Suspend account" row in the Support actions card (not shown for a suspended or removed account) opens the same dialog in "user" mode with the nine reason categories as a required radio list; `PATCH /admin/users/:id` sends `reasonCategory` only when suspending (`updateUserStatus(id, status, reasonCategory?)`; a test pins that Unblock and delete send none). **The Users-list Block button also opens that dialog**, because the API now answers 400 `suspension_reason_category_required` to a bare suspension; Unblock is unchanged. The moderation queue's stale callout ("does not by itself enforce it") is reworded to say Suspend User suspends after confirmation and Warn/Dismiss only record.
  - **Tagging.** All new guardian-, child- or suspension-facing sentences are `[COPY PENDING LEGAL REVIEW]` as the Figma frames tag them, but the tag is a CODE COMMENT, not rendered text (a literal tag in a rendered string needs a manifest row, and this pass was told not to edit `docs/pending-copy-manifest.md`). The pending-copy inventory test passes (15/15). **The frames print the literal tag on screen; this is a deliberate deviation to confirm.**
  - **Not drawn / guessed, flagged:** the user page's Suspend row title ("Account") and its already-suspended line "This account is suspended." (no suspended-state frame); the helper lines for comment, message, team and fixture reports (frames drew only user, post and Banter room); the user-page success callout reuses the report one; reported people are named generically ("the reported user", "the author of the reported post") because the API returns no name for them (frames show a sample handle).
  - **Verification (measured):** `apps/admin` `tsc --noEmit`, `npm run lint`, `npm run build` clean; vitest 916 tests / 57 files, 0 failures (new `suspensionAppealContext.test.tsx` 25, `suspendAccount.test.tsx` 6, `api/adminUsers.status.test.ts` 4, +1 in `UsersPage.test.tsx`; 7 existing assertions changed on purpose: Suspend User offered only on the four target types, the queue callout wording, and the Users-list Block tests now choose a category). `apps/web` pending-copy inventory test 15/15. **Not run:** Playwright `e2e/` (no new spec; the existing admin specs that suspend through the UI were not re-run), the `apps/web` and `services/api` suites. **No real-browser check; the new states are render-tested in jsdom only, and were not compared with the Figma frames by screenshot.** Merged as PR #740 -- this bullet carried no merge line; added here (`gh pr view`), per this file's own "Keeping this file current" rule.
- **`frontend/b298-contact-appeal-category` (figma-to-code, 2026-11-11) adds "Appeal a suspension" (`suspension_appeal`) as the seventh and last Contact Us category in `apps/web` and `apps/admin` -- build-register B-298 (Decision Log #492), on the merged backend (PR #732: the API accepts and validates the key) and Figma pass V (PR #734, `docs/figma-pass-v-report.md`; helper frames `7050:63556` / `7050:63739` / `7050:64028` / `7050:64123`). `apps/web`, `apps/admin` and this file only; `services/api`, Figma, the Build Plan docx, `docs/build-register.md` and `docs/pending-copy-manifest.md` untouched.**
  - **apps/web.** The single source of the key list is `CONTACT_CATEGORIES` in `api/contact.ts` (the page's dropdown, keyboard handling and payload type all read it); it gains `suspension_appeal` last. `ContactPage.tsx`'s label map gains "Appeal a suspension" (a label, not tagged, as pass V decided). The helper line "Use the email address your Soccernity account is registered with so we can find it." renders ONLY while that category is chosen, centred under the message box and above Submit (`.contact-page__helper`, the notice's type pattern in navy, 11px at <= 820px); choosing another category removes it. The submit payload carries `category: "suspension_appeal"`; nothing else about the request changed (no new field).
  - **apps/admin.** `api/contactEnquiries.ts` (the one source `contactCategoryLabel`, the Category filter options on the Contact enquiries tab, the detail page, the enquiry-origin report view and the admin search Reports/enquiries rows all read) gains the key and the label, so the filter offers it and an appeal enquiry reads "Appeal a suspension" everywhere.
  - **Tag handling, a deliberate deviation from the frame.** The helper sentence is `[COPY PENDING LEGAL REVIEW]` and is tagged in a code COMMENT on the constant, as instructed. The Figma frames draw a visible "Copy Tag" chip; it is NOT rendered, because a literal tag in a rendered string needs a row in `docs/pending-copy-manifest.md` (the inventory test fails otherwise) and that file was not to be edited. When counsel reviews the sentence, the chip and the manifest row come together. The category label is untagged.
  - **Drift guards (new).** `apps/admin/src/api/contactCategories.test.ts` and `apps/web/src/api/contact.categories.test.ts` read `services/api/src/modules/contact/contact.constants.ts` and fail if the keys or their order differ (the admin one also pins the labels), the pattern `reasonCategories.test.ts` set for B-284.
  - **Verification (before figures derived as after minus this PR's added tests; before taken on no clean checkout).** `tsc --noEmit`, `npm run lint` and `npm run build` clean in both apps. vitest `apps/web` 152 files / 1,958 tests -> 153 / 1,965, 0 failures (`ContactPage.test.tsx` +6: no helper before a choice, placement after the message box and before Submit, disappears on another category, absent on the six others, `suspension_appeal` in the submit payload, only the existing notice's tag chip on the page; the dropdown-order and each-category tests were extended in place; +1 new drift guard); `apps/admin` 54 files / 880 tests -> 55 / 885, 0 failures (+2 in `contactEnquiries.test.tsx`: the list label and the filter sending `suspension_appeal`; the filter-options test now lists seven; +3 drift/label tests). The pending-copy inventory test passes (15 tests, unchanged). **Not run:** Playwright (specs 21 and 22 select categories by label and were not re-run, so the browser path with the seventh option is unproven), the `services/api` suites (untouched), no real-browser check of the helper line's layout against the frames.
  - Merged as PR #739 -- this bullet's own text previously said "PR opened, not merged"; corrected here in place once the merge was confirmed (`gh pr view`), per this file's own "Keeping this file current" rule.

