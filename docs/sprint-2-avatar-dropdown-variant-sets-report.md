# sprint-2/avatar-dropdown-variant-sets — report

**Branch:** `sprint-2/avatar-dropdown-variant-sets`
**Stacks on:** PR #114 `sprint-2/avatar-notification-dropdown-wiring` → PR #113 `sprint-2/notification-bell-navbar-slot` (both open, not merged). Branched from the PR #114 branch because DL #101/#102/#103 rows exist only there, not on `main`.
**Scope:** Figma design only — no application or backend code. Not merged.
**Figma file:** "Soccernity-MVP" `weZWWqggy9j13eX8bhFgs6`, page `0:1`.

Closes **Decision Log #101, #102, #103** (raised by PR #114). No new brand colour introduced.

---

## 1. What shipped

| Task | Change | Key node IDs |
|---|---|---|
| **T2 (DL #102)** | Removed the stray, z-order-hidden avatar instance from the logged-out desktop navbar `header 7` | deleted `2841:4177`; mutated `2841:4104` |
| **T3 (DL #103)** | Combined the two avatar components into the **`Avatar` COMPONENT_SET** with a `Has Unread` boolean variant property | new set `5685:9241`; variants `2819:4090` (`Has Unread=false`), `2819:4089` (`Has Unread=true`) |
| **T1 (DL #101)** | Cloned the account dropdown into a 4-member slash-named family; mobile members route the Notification row to the **mobile** Notification Centre | `2841:5361`, `2841:5363` (desktop, unchanged targets); new `5685:9300`, `5685:9312` (mobile → `5643:8003`) |
| **T1/T3** | Re-pointed the `header 4 — mobile` avatar overlay to the mobile dropdown; re-set desktop + `Has Unread=true` overlays after the set restructure | `5387:7675` → `5685:9300`; `2838:3579` → `2841:5361`; `2819:4089` → `2841:5363` |
| **T3** | `Dropdown menu/*` **NOT** made a variant set — reverted after a confirmed regression (see §4) | — |
| tidy | Repositioned the new/combined components into a clean cluster beside the `Web app Navbar` set | `5685:9241` @ (8200, 11880); dropdowns row @ y 12040 |

---

## 2. DL #102 — stray avatar removal

`header 7` (`2841:4104`, logged-out desktop, a variant of `Web app Navbar` `2824:4309`) carried `2841:4177` — an `INSTANCE` of `Avatar/no notification`, **absolutely positioned** at (1371, 26), 31×31, **0 reactions**. It sat directly behind the Login button (`Frame 5805` / `2631:3972`, absolute at x 1330–1406, and last in child order so it always rendered on top) — so the avatar was already invisible in every render.

- **Removed** via `node.remove()`.
- **Adjacent element:** the Login button `Frame 5805`. Both were absolute-positioned, so removal caused **zero reflow** — `Frame 5871` (logo, x 20), `Frame 5872` (search, x 222), `Frame 5858` (nav icons, x 596) and `Frame 5805` (Login, x 1330) are all unmoved.
- **Spot-check:** screenshots of `header 7` itself plus `Login desktop` (`407:844`), `Home Page Desktop — Premium Light` (`5204:6728`), and `Forgot Password — Link Sent desktop` (`5474:7077`) — all render an identical clean logged-out navbar with an unobstructed Login button and no avatar.
- `header 7 — mobile` (`5386:6575`) was already correct (no avatar) and untouched.

---

## 3. DL #103 — `Avatar` variant set

`figma.combineAsVariants([2819:4090, 2819:4089], page)` →

- **Set `5685:9241` "Avatar"**, one property **`Has Unread`**, `VARIANT` type, options `["false","true"]`, default `false`. Figma renders `false`/`true` variant options as a boolean toggle in the instance panel.
- **Component IDs preserved** — `combineAsVariants` does not recreate the COMPONENT nodes, so the 78 live instances on page `0:1` (all `Has Unread=false`; the single `Has Unread=true` instance is on the scratch `dump` page) continue to resolve to `2819:4090` / `2819:4089`. Verified by traversing every `INSTANCE` on `0:1` and calling `getMainComponentAsync()` — 78 resolve to `2819:4090`, 0 broken/detached.
- **Appearance unchanged** — verified by before/after screenshots of `header 4` (`2838:3502`), `header 4 — mobile` (`5386:6576`), the Notification Centre desktop navbar, and the mobile leaderboard navbar.
- **Reactions preserved** — the `Has Unread=true` variant kept its `ON_CLICK → OPEN_OVERLAY` reaction through the combine; the per-instance overlay overrides on `2838:3579` / `5387:7675` were preserved and then explicitly re-set (see §5).
- The old slash names `Avatar/no notification` / `Avatar/notification` are retired in favour of the set + property. Node IDs are unchanged, so every prior reference (`2819:4090`, `2819:4089`) still resolves.

The `Ellipse 98` alert dot (`2819:4084`) inside the `true` variant remains bound to `semantic/alert` (`VariableID:5670:8226`) from PR #114 — untouched.

---

## 4. DL #103 — why `Dropdown menu/*` is a slash family, not a variant set

**Attempted and reverted.** After `combineAsVariants` on the two dropdowns (plus two new mobile clones) into a `Dropdown menu` set with `Breakpoint` × `Has Unread` axes, **every avatar→dropdown overlay reaction broke**:

```
Error: Reaction at index 0 was invalid (destination 2841:5361 was rejected —
the destination node may not exist, the source may not be a valid prototype
source, or the destination may not be reachable from this source)
```

A `COMPONENT` that is a **variant inside a `COMPONENT_SET` cannot be used as an `OPEN_OVERLAY` destination** in Figma. The pre-existing reactions still *read back* as pointing at `2841:5361`, but they could no longer be re-set or resolved, and the desktop avatar overlay was effectively dead.

**Resolution:** the set was un-combined (reparent all variants to the page → the now-empty set auto-deletes) and the four components kept as a **slash-named family**:

| Component | ID | Notification row `NAVIGATE` target |
|---|---|---|
| `Dropdown menu/no notification` | `2841:5361` | `5640:7815` (Notification Centre — Desktop) |
| `Dropdown menu/notification on` | `2841:5363` | `5640:7815` |
| `Dropdown menu/mobile - no notification` | `5685:9300` | `5643:8003` (Notification Centre — Mobile) |
| `Dropdown menu/mobile - notification on` | `5685:9312` | `5643:8003` |

Because a `Breakpoint` variant axis is impossible here, DL #101's fix is this **separate mobile component** approach (exactly the fallback PR #114's Task 1 note anticipated). All four are structural clones — same 5 rows (Profile / Message [hidden] / Notification / Settings / Log out), same 146×142 size; only the Notification-row target differs, plus the `notification on` pair shows the "2" counter badge.

**`Avatar` stayed a set** — avatars are only overlay *sources* (and instance targets), never `OPEN_OVERLAY` destinations, so the variant restriction does not apply. A variant COMPONENT *is* a valid overlay **source** (`2819:4089`'s reaction re-set cleanly).

### Mobile dropdown sizing decision

**No mobile-resized variant built.** The dropdown is a compact **146×142** menu anchored under the avatar (`overlayRelativePosition {x:-111, y:31}`). 146px fits comfortably inside both mobile navbar widths in the file (390px and 428px). Resizing would only churn the layout for no benefit — the desktop/mobile split exists purely to carry two different `NAVIGATE` targets.

---

## 5. Final wiring (verified)

| Source | Trigger | Target | Status |
|---|---|---|---|
| `2838:3579` — `header 4` desktop avatar instance | `ON_CLICK` | `OPEN_OVERLAY → 2841:5361` | re-set OK |
| `5387:7675` — `header 4 — mobile` avatar instance | `ON_CLICK` | `OPEN_OVERLAY → 5685:9300` | re-set OK (was `2841:5361`) |
| `2819:4089` — `Avatar` `Has Unread=true` variant | `ON_CLICK` | `OPEN_OVERLAY → 2841:5363` | re-set OK |
| `2819:4077` — Notification row, `2841:5361` | `ON_CLICK` | `NAVIGATE → 5640:7815` | unchanged |
| `2841:5368` — Notification row, `2841:5363` | `ON_CLICK` | `NAVIGATE → 5640:7815` | unchanged |
| `5685:9305` — Notification row, `5685:9300` | `ON_CLICK` | `NAVIGATE → 5643:8003` | new |
| `5685:9317` — Notification row, `5685:9312` | `ON_CLICK` | `NAVIGATE → 5643:8003` | new |

All 4 Navbar variants re-checked: `header 4` (wired, desktop), `header 4 — mobile` (wired, mobile), `header 7` (avatar removed), `header 7 — mobile` (no avatar — correct).

---

## 6. Click-outside-dismiss — plain statement

**It cannot be done from the `use_figma` plugin API.** `overlayBackgroundInteraction` is declared `readonly` on the API surface and rejects assignment on **every** node type tested:

```
TypeError: node.overlayBackgroundInteraction: read-only property on COMPONENT node
TypeError: node.overlayBackgroundInteraction: read-only property on FRAME node
```

(`plugin-api-standalone.d.ts`: `readonly overlayBackgroundInteraction: OverlayBackgroundInteraction`.) PR #114's note that it is "settable only on instances" does not hold in this environment — it is settable nowhere via the API, and the dropdowns have no instances anyway (they are only ever `OPEN_OVERLAY` targets).

**It is not blocked in Figma itself.** A designer sets it in ~30 seconds in the desktop app: select each avatar's **Open Overlay** interaction (`2838:3579`, `5387:7675`, and the `Avatar` `Has Unread=true` variant `2819:4089`) → in the interaction dialog tick **"Close when clicking outside"** (optionally **"Add background behind overlay"**). This is the one manual follow-up from this pass.

**It is a non-issue for `figma-to-code`** — click-outside-dismiss is a standard implementation concern (a backdrop element with `onClick`, or a `useOnClickOutside` hook) and does not depend on the prototype flag.

---

## 7. New Decision Log entries (for Build Plan Section 9, Table 6)

- **#101 → RESOLVED** by `sprint-2/avatar-dropdown-variant-sets`: mobile account-dropdown Notification row now navigates to the mobile Notification Centre (`5643:8003`) via a dedicated `Dropdown menu/mobile - *` component pair; the `header 4 — mobile` avatar overlay points at it. Forward-pointer appended.
- **#102 → RESOLVED** by `sprint-2/avatar-dropdown-variant-sets`: stray avatar `2841:4177` removed from `header 7`; no visual/layout change. Forward-pointer appended.
- **#103 → RESOLVED (partial by design)** by `sprint-2/avatar-dropdown-variant-sets`: `Avatar/*` combined into the `Avatar` COMPONENT_SET (`Has Unread` boolean). `Dropdown menu/*` deliberately kept as a slash-named family — a variant inside a COMPONENT_SET is rejected by Figma as an `OPEN_OVERLAY` destination. Click-outside-dismiss is not settable via the plugin API (`overlayBackgroundInteraction` is `readonly`); it is a one-checkbox manual step in the Figma UI and a non-issue in code. Forward-pointer appended.
- **#104 (new)** — Figma limitation, recorded for future component work: a COMPONENT that is a variant inside a COMPONENT_SET **cannot be an `OPEN_OVERLAY` destination**. Overlay-target components (menus, popovers, dropdowns, toasts) must stay standalone / slash-named, not variant sets. (A variant *source* is fine.)
- **#105 (new)** — the account dropdown is now a 4-member family (`Dropdown menu/{,mobile - }{no notification,notification on}`) rather than a 2-variant set, purely to carry desktop vs. mobile `NAVIGATE` targets. If Figma later allows variant-set overlay destinations, collapse to a `Breakpoint` × `Has Unread` set.
- **#106 (new)** — click-outside-dismiss for the account dropdown is unset in the prototype (API cannot write `overlayBackgroundInteraction`). Manual Figma-UI follow-up: tick "Close when clicking outside" on the 3 avatar Open Overlay interactions.

---

## 8. Follow-up shell-session steps (no Bash this session)

```
git fetch origin
git checkout sprint-2/avatar-notification-dropdown-wiring
git checkout -b sprint-2/avatar-dropdown-variant-sets
git add CLAUDE.md docs/sprint-2-avatar-dropdown-variant-sets-report.md
# + Build Plan docx edit below
git commit -m "Avatar variant set + mobile account-dropdown family; close DL #101/#102/#103"
git push -u origin sprint-2/avatar-dropdown-variant-sets
# PR against main; body notes it stacks on PR #114 -> PR #113 (merge stack in order,
# or merge this which contains all three). Do NOT merge.
```

**Build Plan `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 (Table 6) via python-docx:**
- Mark **#101, #102, #103** Status → RESOLVED, each with the forward-pointer text from §7.
- Add rows **#104, #105, #106** from §7.
- (`#45` remains a genuinely un-written gap — not this PR's to fix.)

---

## 9. Confirmation

Avatar instances and all dropdown wiring are **visually and functionally unchanged** after the restructure:
- 78/78 avatar instances on page `0:1` resolve to the correct variant component; screenshots of `header 4`, `header 4 — mobile`, Notification Centre, and mobile leaderboard navbars are identical before/after.
- Desktop avatar → desktop dropdown → desktop Notification Centre: intact.
- Mobile avatar → **mobile** dropdown → **mobile** Notification Centre: now correct (was pointing desktop).
- `header 7` logged-out navbar: stray avatar gone, zero visual change.
