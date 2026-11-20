# Sprint 2 — Notification Bell / Navbar bell slot + shared-component copy & token fixes

Branch: `sprint-2/notification-bell-navbar-slot` · Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1` ("Soccernity")
Agent: `figma-design-system`. Figma writes performed live and verified; branch/PR/docx/CLAUDE.md finalised in a follow-up session with shell access (same split as PRs #98 / #102 / #110).

---

## TL;DR

Tasks 4, 5, 6 and the Task 3 audit shipped. **Tasks 1–3 (the notification bell components and the Navbar bell slot) are blocked on an incorrect premise in the brief** and were deliberately not built — see below. Decision Log #88 is **not** marked resolved; it is re-scoped, and new entries #93–#98 record the blocker and the judgment calls.

---

## CRITICAL FINDING — Tasks 1–3 rest on an incorrect premise

The brief states `Notification Bell Icon/no notification` (`2819:4090`) and `Notification Bell Icon/notification` (`2819:4089`) are "near-empty… rendering nothing," and the Navbar action cluster is "messages glyph + avatar only."

Verified live, this is not the case:

| Claim in brief | Reality in the file |
|---|---|
| `2819:4090` is an empty unbuilt bell | It is the **live user-avatar component**. `Ellipse 33` carries an `IMAGE` fill (profile photo). **~85 instances** across every Navbar in the file — named "Component 20" / "Avatar" (in `header 4 — mobile` the instance is literally named "Avatar", `mainComponent = 2819:4090`). |
| `2819:4089` is an empty unbuilt bell | It is **avatar + status dot** — photo (`Ellipse 34`) plus the `#fa0606` dot (`Ellipse 98` / `2819:4084`). **0 instances.** |
| Navbar action cluster = messages + avatar | Correct visually — but "the avatar" **is** an instance of `2819:4090`. The round photo in every Navbar is this component with a photo override. |
| "Mirror the profile-dropdown interaction pattern already used elsewhere" | `Dropdown menu/no notification` (`2841:5361`) and `Dropdown menu/notification on` (`2841:5363`) have **0 instances anywhere** and **no prototype wiring**. There is no existing pattern to mirror. Both are **account menus** (Profile / Message / Notification / Settings / Log out), not notification lists. |

PR #112's own Design Notes frame (`5644:8023`, DL #88) made the same misread — it never noticed those components are the avatar.

**Consequence:** building bell artwork into `2819:4090` / `2819:4089` (Task 1 as written) would turn every one of ~85 avatars across Community, Sports Hub, Admin, Settings, Bants, Notification Centre etc. into a bell-behind-a-photo. That is exactly the shared-component blast radius the brief warns against. It was **not** done. Founder / design-lead decision required before any bell work proceeds — see "Corrected plan" below.

---

## What shipped this session (Figma writes, all verified)

| Task | Change | Key node IDs | Token |
|---|---|---|---|
| **6** | Shared `header 4` Navbar messages-glyph: bound the 2 unbound `#d9d9d9` paints (`Rectangle 348`, `Polygon 6`) to `brand/navy`, matching `header 4 — mobile` (`5387:7668` / `5387:7669`, already navy) | `2841:4245`, `2841:4246` | `brand/navy` `VariableID:5096:4` |
| **5** | Bants desktop room-row status dot (`Ellipse 67` in component `Group 403` / `2353:1610`, **102 instances**) — off-palette amber `#DBA111` → `brand/green` | `2353:1611` | `brand/green` `VariableID:5096:3` |
| **4** | Settings desktop copy fixes on `2922:5832` / `2922:5602` / `2922:5382` — 9 text nodes (detail below) | see below | — |
| **3** | `#fa0606` audit file-wide — done; unrelated uses flagged, none touched | see below | — |

### Task 4 detail

**`2922:5832` "Settings — Display, Language & Region":**

| Node | Before | After |
|---|---|---|
| `2910:7424` | "display and languages and region" | "Display, Language and Region" *(renders "…And…" — node carries a pre-existing `textCase: TITLE` transform; underlying characters are correct)* |
| `2910:7425` | "Manage how X content is displayed to you." | "Manage how Soccernity content is displayed to you." |
| `2910:7432` | "Accessibilty" | "Accessibility" |
| `2910:7443` (under Display) | "Select your preference by notification type" | "Choose how content is laid out on your screen" |
| `2910:7460` (under Language) | "Select your preference by notification type" | "Set the language Soccernity is shown in" |
| `2910:7471` (under Data Usage) | "Select your preference by notification type" | "Control media autoplay and download quality" |
| `2910:7433` (under Accessibility) | "Choose the notification you like to see_and those you don't" | "Adjust contrast, motion and text size" |

The 3 distinct labels (`7443` / `7460` / `7471`) are taken verbatim from the corrected mobile frame `5649:8140`.

**Deviation flag on `2910:7433`:** the brief asked for the stray-underscore string to become "Choose the notifications you'd like to see and those you don't" *wherever it appears*. On `2922:5832` that string is the **Accessibility row's description** — a notification-filter sentence copy-pasted into the wrong row (a bug the brief didn't catch). Swapping it for "Choose the notifications…" under an "Accessibility" heading just replaces one wrong string with another, so the mobile frame's Accessibility description was used instead. The notification-filter concept is correctly served on the By-Type frame:

**`2922:5602` "Settings — Notification Preferences (By Type)":**

| Node | Before | After |
|---|---|---|
| `2910:7408` | "Choose the notification you like to see_and those you don't" | "Choose the notifications you'd like to see and those you don't" *(the brief's exact target string — correct context here, this is the "Filter" helper)* |

**`2922:5382` "Settings — Privacy & Safety":**

| Node | Before | After |
|---|---|---|
| `2910:7372` | "Manage Information associated with you post" | "Manage information associated with your post" |

### Task 3 — off-palette red `#fa0606` audit (file-wide)

The bell's own red dot is `2819:4084` (`Ellipse 98`) inside `2819:4089`. Since `2819:4089` has **0 instances** and Task 1 is blocked, it was left untouched — the corrected plan rebuilds it.

**Other `#fa0606` / near-red usages found — FLAGGED, not touched** (unrelated content, per Task 3's instruction). Logged as Decision Log #97:

| Where | Nodes | What it is |
|---|---|---|
| Sports Hub `H2H` (`756:11`) & `Standing` (`756:6433`) | `Rectangle 99` ×~36 | Win/loss form indicators in head-to-head & league-table widgets |
| Admin `Categories` (`128:488`), `Categories - Add Category` (`138:93`), `Users - team members` (`917:218`) | `Rectangle 43` ×3 | Red block in an admin table cell |
| `Mobile Drop Down Components` (`1870:2753`) "Chat Options", `Messages mobile window 3` | `Block User` TEXT ×4 | Destructive-action label styled red |

None are notification/bell related. All predate this task. They collide with non-negotiable #3 (no `color/action/destructive` token exists) — recommend a dedicated sweep.

---

## Corrected plan for Tasks 1–3 + Navbar bell slot (for a follow-up session, once the identity question is resolved)

**Resolve first (founder / design-lead):**

1. Confirm the round photo in the Navbar is the **user avatar** (it clearly is — it opens the account-style `Dropdown menu/*` menu). If yes → `2819:4090` / `2819:4089` should be **renamed** (`Avatar/plain`, `Avatar/with status dot`), not have bell artwork forced into them. The `#fa0606` dot on `2819:4089` then becomes a `brand/green` presence dot (matching the room-row status-dot precedent) or is dropped.
2. The bell is a **new** component, not these node IDs.

**Then build:**

- **New `Notification Bell` component set** — `Has Unread` variant property (`False` default / `True`). Bell glyph = `brand/navy` stroke (icon treatment consistent with `akar-icons:search` / nav icons). `True` variant adds the **navy count-pill** — frame `brand/navy` (`5096:4`) + number text `color/text/on-navy` (`5182:6654`), copied from `Dropdown menu/notification on`'s `Frame 5882` / `2841:5375-6` and PR #112's `Unread Count Badge` (`5640:7915`). No `#fa0606`.
- **Add bell instance to the action cluster** in `header 4` (`Frame 5880` / `2841:4335`) and `header 4 — mobile` (`Actions` / `5387:7663`), **between the messages glyph and the avatar**. Both are HORIZONTAL auto-layout — additive, reflows cleanly.
- **Judgment call — bell on logged-in variants only** (DL #94). `header 7` / `header 7 — mobile` (logged-out) get **no bell**. (`header 7` also currently carries a covered/overlapping avatar instance `2841:4177` — likely a pre-existing bug, flag separately.)
- **Dropdown wiring:** `ON_CLICK` → `OPEN_OVERLAY` to an instance of `Dropdown menu/no notification` (empty bell) or `Dropdown menu/notification on` (badged bell). Add a **"See all notifications"** row to the `notification on` dropdown → `NAVIGATE` to the PR #112 Notification Centre: **`5640:7815`** (desktop) / **`5643:8003`** (mobile). The reused dropdowns are account menus — the founder may instead want a purpose-built notification-preview list; flag when building (DL #96).
- **Spot-check targets** after the change: `Community` (`1306:7149` family), Sports Hub livescores, Admin Console dashboard, `Settings — Overview` (`2905:4798`), `Bants — All Feed` (`2256:6802`) — desktop; `Bants — All Feed — Mobile` (`5650:8074`), `Settings — Overview — Mobile` (`5607:7813`), `Notification Centre — Feed — Mobile` (`5643:8003`) — mobile.

---

## Decision Log

Added to Build Plan Section 9 (Table 6) in this PR:

- **#88** — forward-pointer appended: the "add a genuine bell slot to the Navbar component set" follow-up is **blocked**; see #93. (#88 itself stays "Resolved (design)" for the PR #112 overlay it describes — not re-opened, just annotated.)
- **#93** — `Notification Bell Icon/*` components are misnamed avatars (~85 instances) — bell slot work blocked; recommended rename + new-component approach. **Open.**
- **#94** — notification bell on logged-in Navbar variants only. **Proposed (recommend accept).**
- **#95** — bell read/unread via a `Has Unread` variant property on a new `Notification Bell` component set. **Proposed (recommend accept).**
- **#96** — does the bell reuse the account-style `Dropdown menu/*` or need a dedicated notification-preview dropdown; "See all notifications" → `5640:7815` / `5643:8003`. **Open.**
- **#97** — file-wide off-palette red `#fa0606` sweep (Sports Hub H2H/standings, Admin tables, "Block User" labels) + destructive-token decision. **Open (flag only).**
- **#98** — Bants desktop rows have a single status dot (now `brand/green`); mobile has active/inactive. Desktop active/inactive variant is out of scope here. **Partially addressed.**

---

## Spot-check note

Task 2's shared-Navbar spot-check could not be performed because Task 2 was not built. Tasks 5 and 6 touch shared components:

- **Task 6** (`header 4` messages-glyph paints): cross-referenced against `header 4 — mobile` (`5387:7668` / `5387:7669`) which was already correctly bound to `brand/navy` — the desktop component now matches.
- **Task 5** (Bants desktop status dot, `Group 403` / `2353:1610`, 102 instances): the change is a single variable binding on the component; all instances inherit it. Verified the component renders `brand/green` after the bind.
