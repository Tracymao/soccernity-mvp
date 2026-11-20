# Sprint 2 — Missing Screen Builds + Full-Page Notification Centre

**Branch (proposed):** `sprint-2/screen-builds-notification-centre`
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)
**Date:** 2026-08-31
**Scope:** Figma design only. **No application code touched** — `apps/`, `services/`, `packages/` unchanged.

---

> **Editor's note (added at PR finalization, by the shell session that opened this PR):**
> §0.2 row 1 below states that `docs/sprint-2-clubpicker-cta-token-verify-report.md` and the
> `sprint-2/token-verify-clubpicker-cta` CLAUDE.md bullet don't exist. They **do** — PR #111,
> merged to `main` on 2026-08-31. The build agent couldn't see them because it ran against a
> branch cut before that merge. No harm done: Decision Log **#80–#83 are genuinely PR #111's**
> and this pass's start at **#84** is correct. Both sets (#80–#92) are transcribed into Build
> Plan Section 9 in *this* PR — PR #111 merged without doing its own `.docx` transcription.

## 0. Blockers and brief corrections (read first)

### 0.1 Tooling blockers

This session had `Read` / `Write` + the Figma MCP tools only — **no Bash, no git, no Grep/Glob, no `Edit`**. Consequences, all of which must be actioned by whoever finalises the PR:

1. The branch was **not created**, nothing was committed, no PR was opened. Steps in §9.
2. `docs/Soccernity_MVP_Build_Plan_v1.7.docx` (Section 9 Decision Log) **could not be edited** (binary, needs `python-docx`). Entries #84–#92 are written out in full in §7 for transcription.
3. `CLAUDE.md` was **not edited** — with only `Write` available, editing it would have meant overwriting the whole 2,830-line file. The exact status bullet to add is in §8, per that file's own "Keeping this file current" rule.
4. **All Figma work described below is live on the canvas right now.** Only the git/doc plumbing is outstanding.

### 0.2 Five factual corrections to the task brief

These were each verified live rather than trusted, and each changed what was built. **None is a small wording issue.**

| # | Brief said | Actually true | Effect |
|---|---|---|---|
| 1 | "Builds on the token-compliant baseline established by PR #111… see the bullet for `sprint-2/token-verify-clubpicker-cta`" and "check the report from PR #111 (`docs/sprint-2-clubpicker-cta-token-verify-report.md`) — it proposes #80–#83" | **Neither artifact exists.** `docs/sprint-2-clubpicker-cta-token-verify-report.md` is absent; so is `docs/sprint-2-token-verify-clubpicker-cta-report.md`. `CLAUDE.md` has **no bullet** for `sprint-2/token-verify-clubpicker-cta` — its last status bullet is `sprint-2/admin-competitions-nav-settings-club-rep` (PR #110, Decision Log #76–#79). | **Decision Log #80–#83 could not be verified as taken or free.** This pass starts at **#84** to guarantee no collision. If #80–#83 were genuinely claimed by an unmerged PR #111, nothing here conflicts; if they were never used, #80–#83 are simply left as a gap. **Flagged for the founder to reconcile, not silently resolved.** The Club Picker desktop frames were nonetheless re-read live and are fully token-bound, so the "token-compliant baseline" premise itself holds even though its cited evidence is missing. |
| 2 | "The shared Navbar already has a bell" | **No Navbar variant contains a bell.** All four variants of `Web app Navbar - Desktop and Mobile` (`2824:4309`) were walked node-by-node: the action cluster is a **messages glyph + avatar**; the six nav icons are home / livescores / blog / community / leaderboard / banter. The only bell artwork in the file is the loose `ci:notification-outline-dot` (`2496:4456`) and two near-empty "Notification Bell Icon" components. | The bell + unread badge had to be built as an **ABSOLUTE overlay on each Notification Centre frame's own Navbar instance** (a Figma instance cannot accept new children, and editing the component would alter every screen in the file — out of scope). → **Decision Log #88.** |
| 3 | "Confirm whether *Articles Page Desktop* (54:434) needs a mobile equivalent" | **`Articles Page mobile` (`87:80`, 375×6049) already exists**, and has since the original file. | Nothing built. → **Decision Log #84.** |
| 4 | "CREATE POST — only *Articles - Create Post* (124:313) exists" | The **Create Post section holds five user-facing frames**: `2008:655` Create a post, `2009:5168` Create a post with attachment, `2496:4462` feeds with pinned contest post, `2565:3951` feeds with normal pinned post, `2009:2913` Create a post - For Contest — all 1440×1820, i.e. the Community composer already exists. `124:313` is indeed an Admin-shell screen, as the brief says. | No Community composer built (it is not missing). → **Decision Log #91.** |
| 5 | "4 older *Messages mobile window* frames… appear superseded by the newer 2067:* pair" | **Only three of the four are superseded.** Windows 1 (`1761:2342`), 2 (`1761:2321`) and 4 (`1762:2645`) are list-of-chats / chat-window screens genuinely replaced by `2067:3006` / `2067:3176`. **Window 3 (`1762:2833`, 311×177) is not a screen at all** — it is a unique *Mark as Read / View User Profile / Block User / Delete Chat* context menu with **no replacement anywhere** in the newer pair. | Windows 1/2/4 archived; **window 3 deliberately left live and untouched.** → **Decision Log #89.** |

---

## 1. Token standard applied

Confirmed live before the first write: **`Soccernity Theme`** (`VariableCollectionId:5096:2`), modes **Light** `5096:0` (default) / **Dark** `5096:1`, **12 COLOR variables** — matching CLAUDE.md exactly.

| Variable | ID | Role in this delivery |
|---|---|---|
| `brand/navy` | `5096:4` | Primary buttons; unread-count badge; active chips; footer; bell glyph; icon strokes |
| `brand/green` | `5096:3` | Join / Search Banter CTAs; active tab underline; unread dot; live-match pill; status dot |
| `brand/green-tint` (12%) | `5096:5` | Unread notification row fill; avatar/logo/icon discs; inactive chips; input fills |
| `color/background/page` | `5096:6` | Club Picker + Settings mobile page background (matches those families' own desktops) |
| `color/background/surface` | `5096:7` | Read notification rows, cards, inputs, top bars |
| `color/text/primary` | `5096:8` | Headings, row titles, body |
| `color/text/secondary` | `5096:9` | Sub-copy, metadata, placeholders, group labels |
| `color/text/on-green` | `5096:10` | Navy label on every green CTA |
| `color/text/on-navy` | `5182:6654` | White label on every navy CTA / badge |
| `color/icon/inactive` | `5097:2` | 1px card and input borders, dividers, inactive status dots |
| `brand/off-white` | `5182:6655` | Page background for Notification Centre, Sports, Message, Bants |

- **`brand/green-tint-28` (`5098:7071`): 0 instances across all 25 new frames** (Decision Log #47). Confirmed by audit, not assumed.
- **No new colour** (non-negotiable #3). Every value traces to navy or green.
- **`brand/green` never used as text or icon colour on a light background.** Green appears only as fill, border, dot or underline; text on green is always `color/text/on-green` (navy).
- **Light mode only.** No dark-mode variant or logic added; all bindings are mode-ready.

---

## 2. What shipped

### Task 2 — Full-page Notification Centre (net-new, Sprint 3 / Log Book 24.3)

| Screen | Node | Size |
|---|---|---|
| Section Banner — Notification Centre | `5640:7813` + title `5640:7814` | 5600×1025 |
| **Notification Centre — Feed (Read + Unread) — Desktop** | `5640:7815` | 1440×1074 |
| **Notification Centre — Empty State — Desktop** | `5642:7898` | 1440×697 |
| **Notification Centre — Feed (Read + Unread) — Mobile** | `5643:8003` | 390×933 |
| **Notification Centre — Empty State — Mobile** | `5642:7997` | 390×550 |
| **Notification Centre — Design Notes & Open Decisions** | `5644:8023` | 900×1353 |

**Pattern reused:** the navy count-pill from `Dropdown menu/notification on` (`2841:5376`/`2841:5375`) for the unread badge; the loose `ci:notification-outline-dot` icon (`2496:4456`) for the bell glyph; the Message empty-state composition (icon disc → heading → body → single CTA) from `Message - no message page` (`1871:2762`); the Club Picker "Load more" ghost-button and the Leaderboard Board-Tabs underline treatment for the tab row; the `header 4` / `header 4 — mobile` Navbar variants as real instances.

**Genuinely new, and why:** read-vs-unread row states did not exist anywhere in the file. Unread = `brand/green-tint` fill + white avatar disc + `brand/green` dot; read = white `surface` fill + green-tint avatar disc + no dot, on a `brand/off-white` page so white read rows still separate. Grouping is NEW / EARLIER. **Deliberately not red** — the existing `Notification Bell Icon/notification` component uses an off-palette `#fa0606` dot, which this delivery does not copy or propagate (flagged in §6).

**Content discipline:** every row and the empty-state copy names only **follow, like and comment** — the three types the shipped backend can actually produce. No mention, DM, Banter, club or competition notification type was designed. Empty-state copy: *"When someone follows you, likes your post, or comments on it, you'll see it here."*

### Task 1 — Missing screens and mobile equivalents

| Section | Built | Nodes |
|---|---|---|
| **1.1 Blog** | **Nothing — not needed.** `Articles Page mobile` (`87:80`) already exists. | — |
| **1.2 Sports / Livescores** | 2 mobile screens | Logged Out `5647:8023` (390×1370), Logged In `5647:8169` (390×1320) |
| **1.3 Club Picker** | 5 mobile screens | `5645:8023` Loaded List · `5645:8082` Club Joined · `5645:8141` Join Failed (Inline Error) · `5646:8023` No Clubs Match Filter · `5646:8044` Load More Loading |
| **1.4 Bants** | 7 mobile screens | `5650:8074` All Feed · `5650:8161` My Bants · `5650:8221` Search Filter (Categories) · `5650:8314` Search Result · `5651:8166` Create Topic · `5651:8207` Create Topic with Attachment · `5651:8253` Post Page with Comments |
| **1.5 Message** | 1 mobile empty state + 3 frames archived | `5648:8054` Message — No Messages (Empty State) — Mobile; archived `1761:2342`, `1761:2321`, `1762:2645` (hidden, renamed `ARCHIVED — …`, moved to y 26200 under note `5648:8093`) |
| **1.6 Community (home feed)** | **Nothing built — deliberately.** See §3 and Decision Log #90. | — |
| **1.7 Create Post** | **Nothing built — not missing.** See §0.2 row 4 and Decision Log #91. | — |
| **1.8 Settings (user-facing)** | 5 mobile category screens | `5649:8074` Security & Account · `5649:8092` Privacy & Safety · `5649:8116` Notification Preferences (By Type) · `5649:8140` Display, Language & Region · `5649:8176` Account Information (Edit) |

**Total: 25 new frames** (+ 1 section banner, 1 section title, 1 archive note).

#### Per-section pattern reuse

- **Club Picker mobile** — reuses the desktop content model verbatim (headline, optional-step sub-copy, search field, club card fields, Load more, single dynamic-label footer action `Skip for now` ↔ `Continue to Soccernity`), the desktop's own `Icon — Search` node (`5147:6637`) cloned, and the `Top Bar — Soccernity` from `Settings — Overview — Mobile` (`5607:7814`). The **desktop's "COPY GAP INHERITED FROM SHIPPED CODE" note was carried across verbatim**, not re-worded, so the open issue travels with the screen. *New:* the card goes vertical on mobile (info row above a full-width action button) because a 350px column cannot hold logo + name + league + button on one line.
- **Sports mobile** — *new:* the 432px desktop left sidebar (Sort By League / Sort By Countries / Show More) becomes a **search field + horizontally-scrollable league chip row + a "Browse all leagues & countries" row**; the match row becomes a two-line home/away stack with the status pill on the left. Club crests are rendered as **typographic green-tint initial discs, not cloned licensed crest artwork** — following the precedent set by the Premium Light homepage (PR #97), which dropped 1,760 unbound crest paints for exactly this reason.
- **Bants mobile** — reuses the **existing `Filter Tabs (All / My Bants)` component set (`2459:4841`) as real instances** on the All Feed / My Bants / Search Filter screens, rather than authoring new tabs. Room-row content (title, timestamp, replies, views, created-by, ⋮ menu) matches the desktop rows exactly.
- **Message mobile empty state** — mirrors the desktop `Message - no message page` composition and reuses its heading string verbatim (*"You don't have any message in your inbox."*) and the `bx:message-dots` icon (`2496:4458`). *New:* the supporting line and the search field, which the desktop empty state lacks.
- **Settings mobile** — reuses `Settings — Overview — Mobile`'s (`5607:7813`) exact structure: 390px frame, `Top Bar — Soccernity`, 24/20 content padding, 350px column, Montserrat type ramp. *New:* a "‹ Settings" back row (the desktop relies on a persistent left nav that does not fit at 390).

---

## 3. Verified, not built

| Claim checked | Method | Result |
|---|---|---|
| `1306:7149` Community Home Page Template / `1308:11643` instance render nothing | read `visible` live | **Confirmed both `visible: false`.** `1306:7149` is a COMPONENT_SET with two variants (`Desktop - 6`, `Desktop - 7`); `1308:11643` is an INSTANCE with **0 children**. **Not "fixed"** — CLAUDE.md flags this as belonging to whoever owns that content. |
| community mobile 1–5 can be mechanically resized 428 → 390 | read layout live | **No.** All five are `layoutMode: NONE` with absolutely-positioned children (13–31 each). Resizing the frame leaves every child at its original x — content would overflow and misalign, not reflow. **Not attempted.** → Decision Log #90. |
| The 4 legacy Messages mobile frames are all dead | opened and compared each | **3 of 4.** See §0.2 row 5. |
| Club Picker desktop frames are token-clean | full paint read | Confirmed — all fills/strokes bound; used as-is as the content source. |
| The shared Navbar has a bell | walked all 4 variants | **No.** See §0.2 row 2. |

---

## 4. Audit (measured, not estimated)

Every one of the 25 new frames was walked node-by-node counting SOLID fills and strokes.

- **`brand/green-tint-28`: 0 across all 25 frames.**
- **23 of 25 frames: 0 unbound paints.**
- **Sports Logged Out / Logged In** initially carried 1 unbound paint each (the cloned legacy `uil:calender` icon). **Fixed in this pass** — rebound to `brand/navy`; re-audited to **122 bound / 0 unbound** and **126 bound / 0 unbound**.
- **Notification Centre Feed — Desktop** and **Empty State — Desktop**: **2 unbound each**, both `Rectangle 348` and `Polygon 6` **inside the shared `header 4` Navbar component instance**. These are pre-existing component-level debt, are not editable from an instance, and are **not** this delivery's own paints. The `header 4 — mobile` variant does not carry them (its mobile frames audit 0 unbound).

**Overlap check** — every new frame against every visible top-level node: **1 hit**, `Message — No Messages (Empty State) — Mobile` over the `Mobile message` section-title text (`2155:1282`). Verified this is the **existing convention, not a new defect**: the pre-existing sibling `2067:3006` overlaps the same title text (banner `30009,21520 6300×1878`; sibling `30506,22935 360×601`).

**Verification ceiling, stated plainly:** Figma canvas render + variable read-back, plus per-frame screenshots taken during the build. **No real browser / Playwright check** — not available in this environment, the same ceiling every prior Figma PR in this project has had.

---

## 5. Open questions for founder review

1. **Decision Log #80–#83 provenance** (§0.2 row 1) — were they claimed by an unmerged PR #111, or are they free? This pass used #84–#92 to stay safe.
2. **Should the Navbar component gain a real bell slot?** Today there is no notification entry point on any screen in the file. Fixing it properly is a `figma-design-system` change to `2824:4309` that touches every screen.
3. **Is `brand/green-tint-28` (`5098:7071`) going to be deleted?** Decision Log #47 says it is not a real token; the variable still exists and ~133 pre-existing bound paints still reference it. Untouched here.
4. **Notification content model** — the whole of Decision Log #87. In particular: is the row set permanently limited to follow/like/comment for MVP, and does a "coming soon" affordance for future types belong on the empty state?
5. **Canonical mobile width** — ratify 390 (Decision Log #86), and decide whether the 428 community frames, the 360 Message pair and the 375 Blog/Articles/Contact/Terms/Privacy frames get reflowed or grandfathered.
6. **Sports / Livescores has no data source** — Decision Log #6 (sports-data vendor) is still open and Section 4 defines no fixtures or news endpoint. `figma-to-code` **must not wire** the fixture list or Most Recent Stories.
7. **Bants has no backend** — `/banter-rooms*` (Section 4.4's other half) is unbuilt Sprint 3 work. These are design-only.
8. **Settings — Account Information (Edit)** shows **Username** and **Country**, neither of which has a `User` column (Decision Log #58 parked them as backend requirements). Rendered with an explicit on-frame note rather than silently dropped or silently implied to work.
9. **Is `1306:7149` / `1308:11643` (hidden Community Home Page Template) meant to be revived or deleted?** Still nobody's.

---

## 6. Defects found and NOT fixed (out of scope — flagged, per the scope lock)

These are all on **already-built screens**, which this pass is explicitly forbidden from restyling. Each is a real `figma-design-system` follow-up.

1. **`Notification Bell Icon/notification` (`2819:4089`) uses an off-palette red `#fa0606`** dot. Not propagated into any new frame.
2. **`Notification Bell Icon/no notification` (`2819:4090`) and `.../notification` are near-empty** — a single `Ellipse` with no fill. They render nothing. The usable bell artwork is the loose `ci:notification-outline-dot` frame instead.
3. **Bants desktop room rows use an off-palette orange status dot.** The new mobile rows use `brand/green` (active) / `color/icon/inactive` (inactive) instead — no new colour.
4. **Settings desktop copy bugs**, all real, all left in place on the desktop frames and **corrected only on the new mobile frames** (divergence disclosed rather than typos propagated):
   - `2922:5832` title *"display and languages and region"* (ungrammatical, lowercase) → mobile reads *"Display, Language and Region"*.
   - `2922:5832` body *"Manage how **X** content is displayed to you."* — leftover from a Twitter/X template → mobile reads *"…how **Soccernity** content…"*.
   - `2922:5832` *"Accessibilty"* typo → *"Accessibility"*.
   - `2922:5832` reuses *"Select your preference by notification type"* verbatim under **Display**, **Language** and **Data Usage** — copy-paste leakage → mobile has three distinct sub-labels.
   - `2922:5602` / `2922:5832` *"Choose the notification you like to see_and those you don't"* — stray underscore → corrected.
   - `2922:5382` *"Manage Information associated with you post"* → *"your post"*.
5. **The shared `header 4` Navbar component carries 2 unbound paints** (`Rectangle 348`, `Polygon 6`) that every desktop instance inherits.

---

## 7. Decision Log entries (Build Plan Section 9) — RECORD ONLY, .docx not editable this session

Numbering starts at **#84**: the highest entry confirmed transcribed is **#79** (PR #110), and **#80–#83 could not be verified** because the PR #111 report the brief cites does not exist (§0.2 row 1). Starting at #84 guarantees no collision in either direction.

- **#84 — Blog / Articles mobile: no build needed, brief premise incorrect.** The task asked whether `Articles Page Desktop` (`54:434`) needs a mobile equivalent or whether article authoring is intentionally desktop-only. Neither: **`Articles Page mobile` (`87:80`, 375×6049) already exists.** So does `Blog Page Mobile` (`41:4`, 375×5753). The Blog section is complete at both widths and nothing was built. **Open:** both are **375px**, not the 390 proposed as canon in #86 — whether they are reflowed or grandfathered is part of #86's decision, not a Blog-specific question.

- **#85 — Sports / Livescores mobile: navbar substitution and placeholder data.** Two mobile screens built (`5647:8023` logged out, `5647:8169` logged in). Two judgment calls, both disclosed: **(a)** the desktop screens use a bespoke legacy top bar (`Rectangle 109` + loose icons) rather than the shared Navbar component; the mobile screens use real **`header 7 — mobile` / `header 4 — mobile` Navbar instances** instead, matching every screen built since PR #100. The legacy desktop bars were left untouched. **(b)** The desktop's 432px left sidebar is reflowed into a search field + horizontally-scrollable league chip row + a "Browse all leagues & countries" row, rather than being dropped. Club crests are rendered as typographic initial discs, **not** cloned licensed crest artwork (PR #97 precedent). **Blocked:** the fixture list and Most Recent Stories have **no data source** — Decision Log #6 (sports-data vendor) is unresolved and Section 4 defines no fixtures or news endpoint. `figma-to-code` must not wire either.

- **#86 — Canonical mobile frame width = 390 (proposed).** This file currently holds **five** mobile widths: **390** (everything built since PR #100 — Guardian Consent 1–12, Verify Email 1–4, Leaderboard, Homepage, Auth, Settings Overview, Which-Club selector, and all 25 frames in this pass), **428** (`community mobile 1–5`, `Messages mobile window 2/4`, and the Navbar mobile variants per Decision Log #48), **375** (Blog, Articles, Contact Us, Terms, Privacy), **360** (`Message - List of chats` / `single chat page - mobile app`), and **311** (a popover). **390 is proposed as canon** because it is what every screen built in the last five design PRs uses. The **428 Navbar mobile variants stay 428 and are resized per instance**, exactly as Decision Log #48 already prescribes — #86 does not disturb that. **Open:** whether the 428 / 375 / 360 legacy frames get reflowed to 390 or grandfathered. See #90 for why the community frames specifically could not simply be resized.

- **#87 — Notification content model — PROPOSED, not settled.** Designed against fields **`id`, `user_id`, `type`, `payload_ref_id`, `read`, `created_at`** and trigger types **`follow`, `comment`, `like` ONLY**. `payload_ref_id` follows the convention already established in code (`users/README.md`): the **follower's own `userId`** for `'follow'`, the **`postId`** for `'like'` and `'comment'`. **Recommended and reflected in the screens:** (a) **no self-notifications** — liking or commenting on your own post, or the already-rejected self-follow, produces zero `Notification` rows; (b) **idempotent duplicate events never double-notify**, because the notification write shares the transaction of the row it reports on. Both already hold in the shipped backend (PR #56), so these screens document existing behaviour rather than requesting new behaviour. **Deliberately NOT designed:** mention notifications, Banter-specific types, club / competition / contest types — no backend trigger can produce them today, and designing a row the platform cannot emit would misrepresent placeholder content as a built feature. **Open:** is follow/like/comment the permanent MVP set, and should the empty state carry a "coming soon" affordance for future types? Founder call — flagged, not assumed either way.

- **#88 — Notification nav entry point: the shared Navbar has NO bell, and the badge is an instance-level overlay.** Verified live across all four variants of `2824:4309` — none contains a bell; the action cluster is a messages glyph + avatar. Consequently the bell + navy unread badge on the four Notification Centre frames is an **`ABSOLUTE`-positioned overlay on each frame's own Navbar instance**, not a change to the shared component. Two hard reasons: a Figma **instance cannot accept new children**, and editing the component would alter **every screen in the file** — outside this pass's scope lock. The badge deliberately reuses the **navy count-pill** pattern already established by `Dropdown menu/notification on` (`2841:5376`), **not** the off-palette red `#fa0606` dot on `Notification Bell Icon/notification` (`2819:4089`). **Open, and the real fix:** add a genuine bell slot to the Navbar component set — a `figma-design-system` task affecting every screen — and decide the red dot's fate at the same time.

- **#89 — Message: three legacy mobile frames archived, one deliberately kept.** `Messages mobile window 1` (`1761:2342`, 360×1059), `window 2` (`1761:2321`, 428×926) and `window 4` (`1762:2645`, 428×926) were each opened and compared against the newer pair; all three are list-of-chats / chat-window screens genuinely superseded by `Message - List of chats - mobile app` (`2067:3006`) and `Message - single chat page - mobile app` (`2067:3176`). All three were **renamed with an `ARCHIVED — …` prefix, set `visible = false`, and moved to a labelled archive strip at y 26200 — not deleted.** **`Messages mobile window 3` (`1762:2833`, 311×177) was NOT archived**: it is not a screen but a unique **Mark as Read / View User Profile / Block User / Delete Chat** context menu, and **no equivalent exists anywhere in the newer pair** — archiving it would have silently destroyed the only design for four real actions. **Open:** window 3 should probably become a proper component and be attached to the current mobile chat screens; and the surviving 360px pair conflicts with #86's proposed 390 canon.

- **#90 — Community mobile frames: width standardisation deliberately deferred, not done.** The brief asked to correct `community mobile 1–5` (`1708:2321`, `1762:2847`, `1708:2401`, `1769:5230`, `1770:5435`) to the chosen canon. **Not done, on purpose.** All five are **`layoutMode: NONE`** with 13–31 absolutely-positioned children each; resizing the frame 428 → 390 leaves every child at its original x, so the result is overflowing, misaligned content, not a reflow — a worse state than the inconsistency it would fix. A correct conversion means **rebuilding each screen at 390**, which is a scoped design task in its own right, not a width edit. **Separately confirmed and NOT touched:** `Community Home Page Template` (`1306:7149`, COMPONENT_SET, 2 variants) and `Community Home Page (Instance)` (`1308:11643`, 0 children) are **both `visible: false` and render nothing**, exactly as CLAUDE.md records. Left as found. **Open:** commission the 5-screen community-mobile rebuild, and decide whether the hidden Community template is revived or deleted.

- **#91 — Create Post: no Community composer built, because one already exists.** The brief's premise ("only *Articles - Create Post* (124:313) exists") is incorrect. The **Create Post section holds five user-facing frames** — `2008:655` *Create a post*, `2009:5168` *Create a post with attachment*, `2496:4462` *feeds with pinned contest post*, `2565:3951` *feeds with normal pinned post*, `2009:2913` *Create a post - For Contest* (all 1440×1820, matching the Community homepage's own 1440×1820). The brief's other premise is correct: `124:313` **is** an Admin-shell screen, not user-facing Blog authoring. So the composer pattern **is** per-context and already complete: Bants has its own create-topic screens, Blog/Articles authoring is admin-side, and Community has these five. Building a sixth would have been duplicate, confusing UX. **Open:** the five Create Post frames are **desktop-only** — a Community composer mobile set is a genuine, separate gap (this pass built Bants' create-topic mobile screens but deliberately did not extend into Community, which is a different section under the scope lock).

- **#92 — Settings mobile: five category screens built, twelve leaf screens deferred; desktop copy bugs corrected only on mobile.** The user-facing Settings family is **18 desktop frames**. This pass built mobile equivalents for the **five category screens the Settings Overview's own Category Nav actually links to** — Security & Account, Privacy & Safety, Notification Preferences (By Type), Display/Language & Region, and Account Information (Edit) — completing the navigable first level. The **twelve deeper leaf screens** (`2922:6396` Confirm Password, `2924:6870` Change Password, `2924:7358` Deactivate Account, `2926:8056` Security Overview, `2926:8294` 2FA SMS, `2926:8764` DMs & Read Receipts, `2926:8996` Sensitive Content & 2FA App, `2926:9230` Mute & Filter, `2926:9482` Mute New Accounts, `2926:9721` Notification Preferences, `2927:9954` Push, `2927:10205` Email) are a **flagged, scoped follow-up — deliberately not bundled**, in preference to shipping twelve rushed screens. Admin-side role screens (`1658:2303`, `5403:7205`) were confirmed out of scope and untouched. **Copy divergence, disclosed:** six real copy bugs on the desktop frames (see report §6.4, including a leftover *"how **X** content is displayed"* from a Twitter/X template and an *"Accessibilty"* typo) were **corrected on the new mobile frames and left untouched on the desktop frames**, because restyling built screens is `figma-design-system`'s job under this pass's scope lock. That means desktop and mobile copy currently disagree, on purpose — the desktop frames need the same corrections. **Also flagged:** `Settings — Account Information (Edit)` renders **Username** and **Country**, neither of which has a `User` column (Decision Log #58 parked both as backend requirements); the mobile frame labels them *"(no backend field yet)"* on-canvas rather than implying they work.

---

## 8. CLAUDE.md status bullet — to be added in the same PR

`CLAUDE.md` could not be edited this session (§0.1 item 3). Per its own "Keeping this file current" rule, the finalising session must add the following bullet to the end of "Where things stand right now", immediately before the *"Community, Sports Hub, and Admin Console remain the strongest-designed pillars"* bullet:

```markdown
- **`sprint-2/screen-builds-notification-centre` builds the full-page
  Notification Centre (net-new, Sprint 3 scope) plus the missing mobile
  equivalents across Sports, Club Picker, Bants, Message and Settings** —
  25 new frames, Figma design only, no app/backend code. Full detail:
  `docs/sprint-2-screen-builds-notification-centre-report.md`. Decision Log
  **#84–#92** added to Build Plan Section 9. **Numbering caveat, flagged not
  resolved:** this pass starts at #84 because the brief cited a PR #111
  report (`docs/sprint-2-clubpicker-cta-token-verify-report.md`) proposing
  #80–#83 — **that file does not exist, and CLAUDE.md has no bullet for
  `sprint-2/token-verify-clubpicker-cta`** — so #80–#83 could not be
  verified as taken or free. Headlines:
  - **Notification Centre built desktop + mobile** — feed with read/unread
    row states (`5640:7815` / `5643:8003`) and empty states (`5642:7898` /
    `5642:7997`), plus a Design Notes frame (`5644:8023`). Unread rows =
    `brand/green-tint` + white avatar disc + `brand/green` dot; read rows =
    white `surface`, on a `brand/off-white` page. **Only follow / like /
    comment rows are designed** — the three types the shipped backend can
    actually produce; no mention/Banter/club types were invented
    (**Decision Log #87**, which also records the no-self-notification and
    idempotent-no-double-notify rules already true in code since PR #56).
  - **The brief's claim that "the shared Navbar already has a bell" is
    wrong** — verified live across all four variants of `2824:4309`: the
    action cluster is a messages glyph + avatar, there is no bell anywhere.
    The bell + navy unread badge is therefore an ABSOLUTE overlay on each
    Notification Centre frame's own Navbar instance (a Figma instance can't
    take new children; editing the component would touch every screen).
    Adding a real bell slot to the Navbar is a flagged `figma-design-system`
    follow-up. The badge reuses the navy count-pill from `Dropdown
    menu/notification on`, **not** the off-palette red `#fa0606` dot on
    `Notification Bell Icon/notification`. **Decision Log #88.**
  - **Three more brief premises corrected by checking rather than trusting:**
    `Articles Page mobile` (`87:80`) **already exists**, so no Blog mobile was
    built (**#84**); the Create Post section already holds **five** user-facing
    "Create a post" frames, so no Community composer was built (**#91**); and
    only **three** of the four legacy `Messages mobile window` frames are
    superseded — **window 3 (`1762:2833`) is a unique Mark as Read / View
    Profile / Block / Delete Chat context menu with no replacement**, so it was
    deliberately left live while windows 1/2/4 were hidden, renamed
    `ARCHIVED — …` and moved to an archive strip (**#89**).
  - **Mobile built:** Sports logged-out/logged-in (`5647:8023`/`5647:8169`,
    desktop sidebar reflowed to chips, typographic club marks not licensed
    crests, **#85**); all 5 Club Picker states (`5645:8023`/`8082`/`8141`,
    `5646:8023`/`8044`, carrying the desktop's own open-decision note across
    verbatim); 7 Bants states (`5650:8074`/`8161`/`8221`/`8314`,
    `5651:8166`/`8207`/`8253`, reusing the existing `Filter Tabs
    (All / My Bants)` component as real instances); a Message empty state
    (`5648:8054`); and 5 Settings category screens
    (`5649:8074`/`8092`/`8116`/`8140`/`8176`) — the **12 deeper Settings leaf
    screens are a flagged, deliberately unbundled follow-up** (**#92**).
  - **Canonical mobile width proposed as 390** (**#86**) — the file currently
    holds 390/428/375/360/311. **`community mobile 1–5` were deliberately NOT
    resized** (**#90**): all five are absolute-layout with 13–31 fixed-position
    children, so a 428→390 resize would overflow rather than reflow; a proper
    390 rebuild is its own scoped task. Re-confirmed `1306:7149`/`1308:11643`
    are still `visible: false` and render nothing — left as found, not
    silently "fixed".
  - **Audit, measured:** **0 `brand/green-tint-28`** across all 25 new frames;
    **23 of 25 frames 0 unbound paints**; the 2 Sports frames' single unbound
    paint (a cloned legacy `uil:calender`) was found and fixed in-pass. The
    only residual unbound paints (2 each on the two Notification Centre
    desktop frames) are `Rectangle 348`/`Polygon 6` **inside the shared
    `header 4` Navbar instance** — pre-existing component debt, not editable
    from an instance. 1 frame overlap, confirmed to match the existing
    sibling convention rather than being a new defect.
  - **Flagged, not fixed (scope lock — these are `figma-design-system`'s):**
    the red `#fa0606` bell dot; both "Notification Bell Icon" components being
    near-empty and rendering nothing; Bants' off-palette orange status dot;
    the shared `header 4`'s 2 unbound paints; and **six real Settings desktop
    copy bugs** — including a leftover *"how **X** content is displayed to
    you"* from a Twitter/X template and an *"Accessibilty"* typo — which were
    corrected on the new mobile frames only, so desktop and mobile copy
    currently disagree on purpose (**#92**).
  - **Founder-blocked (flagged, not built):** Sports fixtures/news have no data
    source (Decision Log #6 still open, no Section 4 endpoint); Bants has no
    backend (`/banter-rooms*` is unbuilt Sprint 3 work); `Settings — Account
    Information (Edit)`'s Username and Country have no `User` column (Decision
    Log #58). `figma-to-code` must not wire any of these.
  - Not merged — same standing instruction every design-stage PR follows.
```

---

## 9. Git / PR steps for whoever has a shell (not runnable this session)

Run from `d:\Projects\soccernity-mvp` (working tree was clean on `sprint-2/admin-competitions-nav-settings-club-rep` at session start; this report is the only new file):

```
git checkout main && git pull
git checkout -b sprint-2/screen-builds-notification-centre

# 1. add the report (already written)
#    docs/sprint-2-screen-builds-notification-centre-report.md

# 2. add the CLAUDE.md status bullet from §8 above, at the end of
#    "Where things stand right now", immediately before the
#    "Community, Sports Hub, and Admin Console remain..." bullet

# 3. transcribe Decision Log entries #84-#92 from §7 into
#    docs/Soccernity_MVP_Build_Plan_v1.7.docx Section 9 (needs python-docx)
#    - #84 also supersedes nothing; no back-pointers required this pass
#    - if #80-#83 turn out to exist, add a one-line note to #84's Status
#      recording the numbering gap (per CLAUDE.md's forward-pointer rule)

git add docs/sprint-2-screen-builds-notification-centre-report.md CLAUDE.md docs/Soccernity_MVP_Build_Plan_v1.7.docx
git commit -m "Notification Centre (desktop+mobile) + missing mobile screens for Sports, Club Picker, Bants, Message, Settings"
git push -u origin sprint-2/screen-builds-notification-centre
gh pr create --base main --head sprint-2/screen-builds-notification-centre \
  --title "Full-page Notification Centre + missing mobile screen builds (Sprint 2)" \
  --body-file docs/sprint-2-screen-builds-notification-centre-report.md
```

**DO NOT MERGE** — Temi's call after independent verification, the standing instruction for every design-stage PR in this project. The PR description must state that the Figma work is already live on the canvas, that CLAUDE.md and the Build Plan `.docx` still need the edits in §8 and §7 if the finalising session also lacks a shell / `python-docx`, and that **Decision Log #80–#83's provenance is unresolved** (§0.2 row 1).
