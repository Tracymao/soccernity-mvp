# Sprint 2 — Settings family consolidation audit (AUDIT ONLY — no Figma edits made)

**Agent:** figma-design-system
**Date:** 2026-09-06
**Branch/PR:** none — this is a report, not a Figma edit. Nothing was touched, renamed, moved, or deleted.
**Model for "already consolidated":** `Settings — Privacy` (`6178:14437` desktop / `6185:14547` mobile), the page produced by the Privacy / Privacy & Safety merge (Decision Log #222 Part 3).

---

## 0. Executive summary

- **Live Settings-family frame count: 40** (20 desktop + 20 mobile), plus **2 archived** (`ARCHIVED — Settings — Privacy & Safety` desktop `2922:5382` / mobile `5649:8092`) and **4 Admin Panel frames** that share the word "Settings" but are a different pillar and out of scope (`1658:2303`, `1658:2456`, `1658:2592`, `5403:7205` — hyphen-named `Settings - …`, Admin Console role management). Build Plan Section 7's "22 duplicate Settings Figma frames" is a low estimate against the real number and slightly mis-frames the problem — see §4.
- **The top-level IA is already consistent.** Every one of the 20 desktop frames carries the identical left nav rail with exactly 5 sections: **Account · Security & account access · Privacy & safety · Notifications · Display, language & region**. Each frame highlights the section it belongs to. That rail is the de-facto hub and does not need "fixing" — it needs the redundant intermediate screens and competing sub-hubs beneath it cleaned up.
- **Genuine duplicate clusters found: 2** (confirmed structural role overlap, not name similarity):
  1. **Security** — `Settings — Security & Account` (`2922:5143`) is a redundant one-row intermediate; `Settings — Security Overview` (`2926:8056`) is the real page. Exactly the pattern the brief predicted.
  2. **Notifications** — `Settings — Notification Preferences (By Type)` (`2922:5602`, rows *Filter / Preference*) and `Settings — Notification Preferences` (`2926:9721`, rows *Push / Email*) are two competing entry screens built to two different mental models. Neither is complete.
- **Role mislabelling: 1.** `Settings — Overview` (`2905:4798`) is **not** an overview/landing screen — it is the **Account section page** (nav rail shows "Account" active, content panel is titled "Account"). There is no dedicated top-level Settings landing screen anywhere.
- **Mobile IA inconsistency: 1.** `Overview — Mobile` and `Privacy — Mobile` bolt the full 5-row hub list onto the top of a section page; every other mobile section frame uses a `‹ Settings` back bar with no list. The mobile navigation model is undecided.
- **Not duplication, but real gaps:** the Display section hub lists 4 rows (Accessibility, Display, Language, Data Usage) and **none of those 4 sub-pages exist as frames**.
- **The bigger structural problem (this is what Section 7 is really about):** all 20 desktop frames are independent `FRAME` copies (43 children each), **not instances of a component**, of one shell that also contains an **irrelevant Community-style left sidebar** (profile card "Adeniyi Christiana / @christine001", "Trending News", "Suggested" follows) that is visibly rendered on every Settings screen and has nothing to do with Settings. Every copy/content fix has had to be made ~20 times (PRs #116–#119 kept re-sweeping the same class of debt). Consolidation should componentize the shell and drop that sidebar.

**Nothing below decides a name or a final scope.** Every naming/scope choice is flagged for the founder in §6, the same way "Privacy" vs "Privacy & Safety" was a founder call.

---

## 1. Full inventory — 20 desktop frames

Left nav rail (identical on all 20): `Account` · `security and account access` · `privacy and safety` · `notifications` · `Display, Language and Region`. "Active section" = which rail item is highlighted.

| # | Frame | Node ID | Active section | Role | Content headline (a few words) |
|---|---|---|---|---|---|
| D1 | Settings — Overview | `2905:4798` | Account | **Section page (mislabelled)** | "Account" panel → Account Information · Club Representation · Change Password · Deactivate Account · Delete Account |
| D2 | Settings — Account Info (Confirm Password) | `2922:6396` | Account | Leaf (gate step) | "Confirm your password to see your details" + Submit |
| D3 | Settings — Account Information (Edit) | `2924:7112` | Account | Leaf | Editable Username / Phone / Email / Country + Save |
| D4 | Settings — Change Password | `2924:6870` | Account | Leaf | Current / New / Confirm password + "logs you out of other sessions" + Save |
| D5 | Settings — Deactivate Account (Intro) | `2924:7358` | Account | Leaf (step 1 of 2) | "You're about to start… deactivating" + What to know + Continue |
| D6 | Settings — Deactivate Account (Confirm) | `6213:15640` | Account | Leaf (step 2 of 2) | "Deactivate your account" + password + Cancel / Deactivate account |
| D7 | Settings — Delete Account (Confirm) | `6225:14789` | Account | Leaf | "Delete your account?" + 30-day grace copy + password + Cancel / Delete account |
| D8 | Settings — Security & Account | `2922:5143` | Security & account access | **Redundant intermediate** | "Security and Account Settings" → **one row: "Security ›"** |
| D9 | Settings — Security Overview | `2926:8056` | Security & account access | **Section page (real)** | "Security" → Two-factor authentication → "Set up two-factor authentication ›" |
| D10 | Settings — Two-Factor Auth (SMS) | `2926:8294` | Security & account access | Leaf | Text message / Authentication app options |
| D11 | Settings — Privacy | `6178:14437` | Privacy & safety | **Section page (canonical, DL #222)** | Public profile · Your Post · Direct Message · Download my data · Account status · Guardian approval · Marketing emails |
| D12 | Settings — Direct Messages & Read Receipts | `2926:8764` | Privacy & safety | Leaf (dest. of "Direct Message" row) | "Read receipts" toggle |
| D13 | Settings — Your Posts (Sensitive Media) | `2926:8996` | Privacy & safety | Leaf (dest. of "Your Post" row) | "Mark media you post as sensitive" toggle |
| D14 | Settings — Notification Preferences (By Type) | `2922:5602` | Notifications | **Competing hub A** | "Notification" → rows: **Filter · Preference** |
| D15 | Settings — Notification Preferences | `2926:9721` | Notifications | **Competing hub B** | "Preferences" → rows: **Push notifications · Email notifications** |
| D16 | Settings — Notifications (Mute & Filter) | `2926:9230` | Notifications | Leaf (mixes 2 concerns) | "Filter" → Quality filter + "Mute notifications ›" |
| D17 | Settings — Push Notifications | `2927:9954` | Notifications | Leaf | "Turn on push notifications" toggle |
| D18 | Settings — Email Notifications | `2927:10205` | Notifications | Leaf | "Turn on email notifications" + New notifications / Direct messages / Posts emailed to you |
| D19 | Settings — Mute New Accounts | `2926:9482` | Notifications | Leaf | "Mute notifications from people": don't follow / don't follow you / new account |
| D20 | Settings — Display, Language & Region | `2922:5832` | Display, language & region | **Section hub (rows lead nowhere)** | "Display, Language and Region" → Accessibility · Display · Language · Data Usage (no destination frames exist) |

---

## 2. Full inventory — 20 mobile frames

Mobile frames drop the persistent rail; they use a `‹ Settings` back bar + one section's content. Two frames (M1, M11) instead stack the 5-row hub list on top of the section content.

| # | Frame | Node ID | Desktop pair | Role | Content headline |
|---|---|---|---|---|---|
| M1 | Settings — Overview — Mobile | `5607:7813` | D1 | **Hub list + Account section stacked** | 5-row category list, then "Account" section rows |
| M2 | Settings — Account Info (Confirm Password) — Mobile | `5695:8213` | D2 | Leaf (gate) | "Confirm your password" + Submit |
| M3 | Settings — Account Information (Edit) — Mobile | `5649:8176` | D3 | Leaf | Username (flagged "no backend field yet") / Phone / Email / Country / Save + a visible design note |
| M4 | Settings — Change Password — Mobile | `5695:8234` | D4 | Leaf | Current / New (+ "Use at least 8 characters") / Confirm + Save |
| M5 | Settings — Deactivate Account (Intro) — Mobile | `5695:8262` | D5 | Leaf | Intro + What to know + Continue |
| M6 | Settings — Deactivate Account (Confirm) — Mobile | `6213:15617` | D6 | Leaf | "Deactivate your account" + password + Deactivate / Cancel |
| M7 | Settings — Delete Account (Confirm) — Mobile | `6225:15024` | D7 | Leaf | "Delete your account?" + 30-day grace + password + Delete / Cancel |
| M8 | Settings — Security & Account — Mobile | `5649:8074` | D8 | **Redundant intermediate** | "Security and Account Settings" → one "Security ›" row |
| M9 | Settings — Security Overview — Mobile | `5695:8279` | D9 | **Section page (real)** | "Security" → "Two-factor authentication ›" |
| M10 | Settings — Two-Factor Auth (SMS) — Mobile | `5696:8213` | D10 | Leaf | Text message / Authentication app |
| M11 | Settings — Privacy — Mobile | `6185:14547` | D11 | **Hub list + Privacy section stacked** | 5-row category list, then Privacy section rows (canonical, DL #222) |
| M12 | Settings — Direct Messages & Read Receipts — Mobile | `5696:8241` | D12 | Leaf | "Read receipts" |
| M13 | Settings — Your Posts (Sensitive Media) — Mobile | `5696:8261` | D13 | Leaf | "Mark media … as sensitive" |
| M14 | Settings — Notification Preferences (By Type) — Mobile | `5649:8116` | D14 | **Competing hub A** | rows: Filter · Preference |
| M15 | Settings — Notification Preferences — Mobile | `5696:8340` | D15 | **Competing hub B** | rows: Push notifications · Email notifications |
| M16 | Settings — Notifications (Mute & Filter) — Mobile | `5696:8281` | D16 | Leaf (mixes 2 concerns) | Quality filter + "Mute notifications ›" |
| M17 | Settings — Push Notifications — Mobile | `5696:8364` | D17 | Leaf | "Turn on push notifications" |
| M18 | Settings — Email Notifications — Mobile | `5696:8384` | D18 | Leaf | "Turn on email notifications" + 3 sub-toggles |
| M19 | Settings — Mute New Accounts — Mobile | `5696:8307` | D19 | Leaf | "Mute notifications from people" (3 groups) |
| M20 | Settings — Display, Language & Region — Mobile | `5649:8140` | D20 | **Section hub (rows lead nowhere)** | Accessibility · Display · Language · Data Usage |

**Archived (no action needed):** `ARCHIVED — Settings — Privacy & Safety` `2922:5382` (desktop) / `5649:8092` (mobile) — already superseded by D11/M11 per Decision Log #222.

---

## 3. Duplicate clusters — findings & survivor recommendation

### Cluster 1 — Security: `Security & Account` vs `Security Overview` (2 frames × 2 platforms)

| Frame | What it contains |
|---|---|
| `Settings — Security & Account` (D8 `2922:5143` / M8 `5649:8074`) | Heading "Security and Account Settings", a one-line blurb, and **a single row: "Security → Manage your account security ›"**. That's the entire screen. |
| `Settings — Security Overview` (D9 `2926:8056` / M9 `5695:8279`) | Heading "Security", the real content: "Two-factor authentication" + "Set up two-factor authentication ›". Carries a `‹` back arrow implying it was designed as a child of D8. |

**Read:** D8's only row leads to D9, and D8's own nav-rail item ("security and account access") already *is* that navigation. D8 is a redundant hop with no unique content. **Survivor: D9 / M9** (rename to `Settings — Security` — see §6). **Merge away: D8 / M8** — archive; port its one-line blurb ("Manage your account's security and keep track of your account's usage") into D9's intro if wanted.

### Cluster 2 — Notifications: two competing hubs + one mixed-concern leaf (5 frames × 2 platforms)

| Frame | Rows it offers |
|---|---|
| `Settings — Notification Preferences (By Type)` (D14 `2922:5602` / M14 `5649:8116`) | **Filter**, **Preference** |
| `Settings — Notification Preferences` (D15 `2926:9721` / M15 `5696:8340`) | **Push notifications**, **Email notifications** |
| `Settings — Notifications (Mute & Filter)` (D16 `2926:9230` / M16 `5696:8281`) | Quality filter (inline) + "Mute notifications ›" |
| `Settings — Push Notifications` (D17 `2927:9954`) | leaf — push master toggle |
| `Settings — Email Notifications` (D18 `2927:10205`) | leaf — email master toggle + 3 sub-toggles |
| `Settings — Mute New Accounts` (D19 `2926:9482`) | leaf — mute: people you don't follow / who don't follow you / new accounts |

**Read:** D14 and D15 are two entry screens for the same section, built by different passes to different models. D14's "Filter/Preference" split has no matching leaf frames ("Preference" leads nowhere; "Filter" overlaps D16). D15's "Push/Email" split maps 1:1 onto real leaf frames that exist (D17, D18). D16 mixes a quality-filter control with a nav row to muting.

**Survivor: D15 / M15** as the section hub, **extended** from 2 rows to 4: *Push notifications · Email notifications · Filters · Muted accounts*. **Merge away: D14 / M14** — archive (port the "kinds of notifications you get about your activities, interests…" framing copy if useful). D16 becomes the **Filters** leaf (quality filter only — route its "Mute notifications" row to the muted-accounts leaf, or keep combined — §6). D19 becomes the **Muted accounts** leaf.

### No other genuine duplicates

- Account Info: `Account Info (Confirm Password)` (D2) and `Account Information (Edit)` (D3) are **not duplicates** — D2 is the password-gate step, D3 is the post-gate editable form. They are a 2-step flow. (Keeping the gate as its own screen vs inlining it is a §6 question, not a duplication.)
- Deactivate `(Intro)` (D5) and `(Confirm)` (D6) — legitimate 2-step flow, recently built (Decision Log #220/#221/#222). Not duplicates.
- `Delete Account (Confirm)` (D7) — single confirm screen, recently built. Not a duplicate.
- D12 / D13 (Read Receipts, Sensitive Media) are the real destination sub-pages of the Privacy page's "Direct Message" / "Your Post" rows (Decision Log #222 Part 3 said "destination sub-pages not rebuilt" — they already exist here). Keep as leaves.

---

## 4. On "22 duplicate Settings Figma frames" (Build Plan Section 7)

The count and the framing are both slightly off, and the difference matters for what to fix:

- **The literal number is 40 live frames, not 22.** (20 desktop + 20 mobile.)
- **They are not 22 byte-identical copies of one screen.** Each frame shows a *different* section/leaf in its content area. The duplication is structural, at two levels:
  1. **Two redundant entry screens** (Security §3 Cluster 1) and **two competing hubs** (Notifications §3 Cluster 2) — ~8 frames of genuine role overlap to resolve.
  2. **20 hand-maintained copies of the shell.** Every desktop frame is an independent `FRAME` (43 children), not an `INSTANCE`. The shell — web navbar + 5-item nav rail + **a Community-style left sidebar (profile card, Trending News, Suggested follows)** — is copy-pasted 20 times. The Community sidebar is *visibly rendered* on every Settings screen (see the screenshots) and is wrong content for Settings. This is why PRs #116, #117, #118, #119 each had to sweep the same scaffolding/copy defects across "all 18–20 desktop frames" one frame at a time.

**The consolidation that actually closes the Section 7 blocker is:** resolve the ~8 overlapping frames (§3), **then** rebuild the survivors on a single componentized shell (nav rail as a component; content panel as a slot; Community sidebar removed). Doing only the first half leaves 20 hand-copies to keep re-sweeping.

---

## 5. Proposed final page list (for founder confirmation)

Canonical top-level IA = the existing 5 nav-rail sections. One hub concept per section, one canonical path to each leaf, every duplicate resolved.

### Section A — **Account** *(rename `Settings — Overview`)*
- **Hub/section page:** D1 `2905:4798` / M1 `5607:7813` — rows: Account information · Club representation · Change password · Deactivate account · Delete account
- Leaves:
  - Account Information — Confirm Password → Edit: D2 `2922:6396` + D3 `2924:7112` / M2 `5695:8213` + M3 `5649:8176`
  - Change Password: D4 `2924:6870` / M4 `5695:8234`
  - Deactivate Account (Intro → Confirm): D5 `2924:7358` + D6 `6213:15640` / M5 `5695:8262` + M6 `6213:15617`
  - Delete Account (Confirm): D7 `6225:14789` / M7 `6225:15024`
  - *(Club representation row → `5570:7813` / `5570:7887`, built elsewhere, not a Settings-family frame)*

### Section B — **Security** *(rename `Settings — Security Overview`; archive `Settings — Security & Account`)*
- **Section page:** D9 `2926:8056` / M9 `5695:8279` — rows: Two-factor authentication *(+ future: active sessions / login activity — not built, not a blocker)*
- Leaf: Two-Factor Auth (SMS): D10 `2926:8294` / M10 `5696:8213`
- **Archive:** D8 `2922:5143` / M8 `5649:8074`

### Section C — **Privacy** *(already consolidated — canonical, DL #222; no change)*
- **Section page:** D11 `6178:14437` / M11 `6185:14547`
- Leaves: Your Posts (Sensitive Media) D13 `2926:8996` / M13 `5696:8261`; Direct Messages & Read Receipts D12 `2926:8764` / M12 `5696:8241`
- Already archived: `2922:5382` / `5649:8092`

### Section D — **Notifications** *(pick survivor hub; archive the other; extend to 4 rows)*
- **Section page:** D15 `2926:9721` / M15 `5696:8340` — rows: Push notifications · Email notifications · **Filters** · **Muted accounts**
- Leaves:
  - Push Notifications: D17 `2927:9954` / M17 `5696:8364`
  - Email Notifications: D18 `2927:10205` / M18 `5696:8384`
  - Filters *(rename `Notifications (Mute & Filter)`)*: D16 `2926:9230` / M16 `5696:8281`
  - Muted accounts *(rename `Mute New Accounts`)*: D19 `2926:9482` / M19 `5696:8307`
- **Archive:** D14 `2922:5602` / M14 `5649:8116`

### Section E — **Display, Language & Region** *(no duplication; unbuilt leaves)*
- **Section hub:** D20 `2922:5832` / M20 `5649:8140` — rows: Accessibility · Display · Language · Data usage
- Leaves: **none exist.** Either build 4 leaves (figma-screen-builder) or convert the rows to inline-expand groups. Founder + screen-builder call.

### Net effect
- **Frames kept & re-based on a shared shell:** 32 (16 desktop + 16 mobile)
- **Frames archived:** 4 (`2922:5143`, `5649:8074`, `2922:5602`, `5649:8116`) + the 2 already archived
- **Frames renamed for role clarity:** 10 (5 desktop + 5 mobile — Overview→Account, Security Overview→Security, Notification Preferences→Notifications, Notifications (Mute & Filter)→Filters, Mute New Accounts→Muted accounts)
- **New work flagged (not part of consolidation):** 4 Display leaves (× 2 platforms) if built; possibly a standalone mobile hub screen (§6.6)

---

## 6. Decisions flagged for the founder — NOT made here

These are the equivalents of the "Privacy" vs "Privacy & Safety" call. Each changes the final page list.

1. **Section 2 name.** Nav rail says "Security and account access"; the pages say "Security" and "Security and Account Settings". Pick one label for rail + page + route.
2. **Section 4 name.** "Notifications" vs "Notification Preferences" vs "Preferences" — all three appear today.
3. **Which Notifications hub survives** — `2926:9721` (rows Push/Email, recommended: its rows map to real leaves) or `2922:5602` (rows Filter/Preference). §3 Cluster 2.
4. **`Mute New Accounts` scope + name.** The screen actually covers three groups (people you don't follow / who don't follow you / new accounts), so "Muted accounts" fits better than "Mute new accounts". Confirm.
5. **`Notifications (Mute & Filter)` split.** Keep quality-filter + mute-nav combined on one screen, or split into a "Filters" leaf and route muting to "Muted accounts"?
6. **Mobile navigation model.** Today `Overview — Mobile` and `Privacy — Mobile` show the 5-row hub list inline; every other mobile section frame uses `‹ Settings` back-nav with no list. Pick: (a) standalone mobile hub screen → section sub-pages (matches the shipped `/settings/privacy` route shape — recommended), (b) single long scroll, or (c) hub list repeated on every section page. Options (a) and (c) both require stripping or standardising the hub list on Overview/Privacy mobile.
7. **Does Settings need a dedicated top-level landing** distinct from the Account section? On desktop the persistent rail already serves as the hub, so "Overview" being the Account page is arguably fine once renamed. On mobile it depends on #6.
8. **Account Info password gate.** Keep `Account Info (Confirm Password)` as its own screen, or inline the gate into the edit screen?
9. **Display section leaves.** Build the 4 sub-pages now, convert the rows to inline-expand, or leave the section as a stub for a later sprint?
10. **The Community left sidebar on desktop Settings.** Confirm it should be removed entirely from the Settings pillar (profile card + Trending News + Suggested are Community content, currently rendering on every Settings screen). This is likely already implied but has never been explicitly decided for Settings.

---

## 7. Recommended sequencing (once the founder confirms)

1. **This report → founder decisions on §6.**
2. **figma-design-system:** archive the 4 redundant frames, rename the 10, extend the Notifications survivor hub to 4 rows, remove the Community sidebar, componentize the shell (nav rail component + content-panel slot) and re-base the surviving frames on it. One coordinated PR.
3. **figma-screen-builder** *(only if §6.9 = "build"):* the 4 Display leaves + (if §6.6 = option a) a standalone `Settings — Menu — Mobile` hub.
4. **figma-to-code:** convert the consolidated set. `PrivacySettingsPage.tsx` is already shipped against D11; the rest follow the same route pattern (`/settings/<section>`, `/settings/<section>/<leaf>`).
5. **Update Build Plan Section 7** to record the "22 duplicate frames" blocker as resolved, with the real number and the componentization note.

---

## 8. Frames touched by this audit

**None.** No Figma writes were made. All reads were `use_figma` (read-only), `get_metadata`, and `get_screenshot`. No branch, no commit, no PR.
