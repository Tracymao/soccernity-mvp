# Sprint 2 — Settings **mobile** shell componentization — PR 7

**Agent:** figma-design-system · **Date:** 2026-09-08 · Figma design only — no app/backend code, no merge.
Executes the deferred mobile half of the Settings-family shell componentization: PR 6 (Decision Log #249) componentized the **desktop** `Settings Shell` and built `Settings Back Bar — Mobile`, but its own "flagged, not fixed" list explicitly deferred **full mobile Top-Bar componentization** to a separate pass. This is that pass. Raised as **Decision Log #251**; resolved here as **Decision Log #252**.

Figma desktop app reconfirmed on "Soccernity-MVP" page `0:1` before every write.

---

## 1. What was found (pre-flight)

| Finding | Detail |
|---|---|
| **24 live mobile Settings frames**, not 22 | DL #251's "22" is the PR 6 **Back Bar** scope. `Settings Back Bar — Mobile` was swapped onto the **22** mobile frames that *have* a back bar — every one except `Settings — Menu — Mobile` (`6289:15068`, the PR 1 hub) and `Settings — Overview — Mobile` (`6297:15173`, the PR 2 landing), which have no back bar by design. **All 24** frames carry a hand-built `Top Bar — Soccernity`, so the Top-Bar pass covers 24. Not a count correction — two different scopes. |
| **Every frame structurally identical** | `[ Top Bar — Soccernity (FRAME, 390×64), Content (FRAME, 390×N) ]`, `childCount 2`, frame is `VERTICAL` auto-layout, Content at relative `(0, 64)`. The Top Bar is a plain hand-built FRAME (not an instance) containing one child, `Logo — Soccernity` (HORIZONTAL auto-layout: 22×22 `Ellipse` bound to `brand/green` + `Soccernity` TEXT, Inter Semi Bold 18, bound to `brand/navy`). |
| **Not the site navbar** | This 64px bare-logo bar is deliberately Settings-specific — it is **not** `Navbar — header 4 — mobile` (used on Community / Message / Contest mobile). Left as-is; not "fixed" by swapping in the site navbar. |
| **Real inconsistency: the Top Bar bottom border** | **6 frames** (`5607:7813`, `5649:8140`, `5649:8176`, `6185:14547`, `6289:15068`, `6297:15173` — the hub/landing/edit frames) carry a **1px `color/icon/inactive` bottom-only hairline** (`strokeBottomWeight 1`, INSIDE align) — identical to **every other `Top Bar — Soccernity` in the file** (auth desktop+mobile, Verify Email, Club Picker, Guardian Consent mobile — all verified: `color/background/surface` fill + 1px `color/icon/inactive` bottom border, per DL #172). **18 frames** have **no stroke at all**. |
| **Label audit** | Full text sweep of all 24 Content panels for stale consolidated-section labels (`Security` / `Security Overview` / `Preferences` / `Notification Preferences (By Type)` / `Mute New Accounts` / `Notifications (Mute & Filter)` / bare `Filter` / `Security & Account` without `Settings`): **zero stale hits.** PR 6's M9 heading fix (`Security` → `Security & Account Settings`, `5695:8279`) and M15 fix (`Preferences` → `Notification Preferences`, `5696:8340`) held; the other 22 mobile frames were already correct. |

---

## 2. Split decision — **Top Bar as its own component; Back Bar stays separate** (not combined)

The two mobile chrome pieces sit at **different tree depths in different parents**: the Top Bar is a frame-level sibling of `Content`; the Back Bar (`Settings Back Bar — Mobile`, `6348:16292`) lives **inside** `Content` as its first child. Combining them into one "Settings Shell — Mobile" would force relocating the Back Bar out of `Content`, which shifts every subsequent auto-layout child up → a content-panel geometry change, exactly what the verification standard forbids.

This also mirrors the desktop precedent faithfully: the desktop `Settings Shell` componentizes the **chrome** (navbar + rail + dividers), **not** the content panel. On mobile the chrome pieces are Top Bar + Back Bar; componentizing each, leaving `Content` as an untouched sibling slot, is the same idea.

---

## 3. `Settings Top Bar — Mobile` — new component

| | |
|---|---|
| **Node** | **`6360:16337`** — `Settings Top Bar — Mobile` (plain `COMPONENT`, no variants — logo-only, no active state, mirroring `Settings Back Bar — Mobile`) |
| **Location** | parked off-canvas at **`x 20000, y −12800`** → `x 20390, y −12736`. Forms a tidy column with the two existing parked components: desktop `Settings Shell` (`y −16000 → −13483`) · `Settings Back Bar — Mobile` (`y −13000`) · this. **0 overlaps** with either, and **not** in the Admin Shell zone (`x 37943–53343`) — all verified. |
| **Built by** | cloning the Top Bar of `5607:7813` (one of the 6 already carrying the canonical hairline) → `createComponentFromNode`. |
| **Structure** | `390×64`, `layoutMode: NONE` (matching the hand-built frames exactly), `clipsContent: true`; child `Logo — Soccernity` absolutely positioned at `(20, 21)`. |
| **Paint audit** | **4 paints, 4 bound, 0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours:** frame fill → `color/background/surface` (`5096:7`); frame stroke → `color/icon/inactive` (`5097:2`) @ 15%, bottom-only 1px INSIDE; `Ellipse` fill → `brand/green` (`5096:3`); `Soccernity` fill → `brand/navy` (`5096:4`). |
| **Description** | records the pairing with `Settings Back Bar — Mobile`, that Content is a sibling not a slot, the canonical DL #172 hairline, and the "do not swap in the site navbar" note. |

### The baked-in hairline (the one forced decision)

Componentizing forces one border treatment for all 24. **Baked in: the canonical 1px `color/icon/inactive` bottom hairline** — because it matches the file-wide `Top Bar — Soccernity` spec (DL #172) and 6 of the 24 frames already had it; the 18 borderless frames were the anomaly. Net visual effect: an ~15%-opacity navy hairline appears under the logo bar on 18 mobile Settings frames (a token-correctness fix); the 6 that had it are byte-identical (same variable, same weight, same align).

---

## 4. All 24 frames re-based — content geometry byte-identical

Per frame: read the old Top Bar's layout props (`AUTO` / `FILL` / `FIXED` / `STRETCH` on all 24) → `createInstance()` → `insertChild(0, …)` → replicate layout props → `remove()` old Top Bar → `Content` never touched.

**Verification, before → after, on all 24:**

- Content **relative position** `(0, 64)` — unchanged on all 24.
- Content **absolute bounding box** — captured before, re-captured after — **identical on all 24**.
- Content **subtree geometric fingerprint** (every descendant's abs bbox, sorted, hashed) + **descendant count** — **identical on all 24** (`allMatch: true`, zero mismatches).
- `child[0]` is now an `INSTANCE` of `Settings Top Bar — Mobile` on all 24; `childCount` stays 2.
- **Orphan check:** 0 `Top Bar — Soccernity` FRAME nodes remain anywhere inside the 24 frames.
- **Instance count:** exactly **24** page-wide, one per frame (all 24 unique frame names confirmed).

| Frame | Node | old→new child 0 | Content (x,y,w,h) unchanged | fingerprint |
|---|---|---|---|---|
| Settings — Account — Mobile | `5607:7813` | FRAME → inst `6363:16333` | −4751,−8578,390,472 | ✓ |
| Settings — Display, Language & Region — Mobile | `5649:8140` | FRAME → inst `6363:16337` | −2751,−8578,390,463 | ✓ |
| Settings — Account Information (Edit) — Mobile | `5649:8176` | FRAME → inst `6363:16341` | −2251,−8578,390,592 | ✓ |
| Settings — Account Info (Confirm Password) — Mobile | `5695:8213` | FRAME → inst `6363:16345` | −1751,−8578,390,431 | ✓ |
| Settings — Change Password — Mobile | `5695:8234` | FRAME → inst `6363:16349` | −1251,−8578,390,607 | ✓ |
| Settings — Deactivate Account (Intro) — Mobile | `5695:8262` | FRAME → inst `6363:16353` | −751,−8578,390,409 | ✓ |
| Settings — Security & Account Settings — Mobile | `5695:8279` | FRAME → inst `6363:16357` | −251,−8578,390,361 | ✓ |
| Settings — Two-Factor Auth (SMS) — Mobile | `5696:8213` | FRAME → inst `6363:16361` | 249,−8578,390,399 | ✓ |
| Settings — Direct Messages & Read Receipts — Mobile | `5696:8241` | FRAME → inst `6363:16365` | 749,−8578,390,297 | ✓ |
| Settings — Your Posts (Sensitive Media) — Mobile | `5696:8261` | FRAME → inst `6363:16369` | 1249,−8578,390,317 | ✓ |
| Settings — Filters — Mobile | `5696:8281` | FRAME → inst `6363:16373` | 1749,−8578,390,313 | ✓ |
| Settings — Muted accounts — Mobile | `5696:8307` | FRAME → inst `6363:16377` | 2249,−8578,390,370 | ✓ |
| Settings — Notification Preferences — Mobile | `5696:8340` | FRAME → inst `6363:16381` | 2749,−8578,390,469 | ✓ |
| Settings — Push Notifications — Mobile | `5696:8364` | FRAME → inst `6363:16385` | 3249,−8578,390,281 | ✓ |
| Settings — Email Notifications — Mobile | `5696:8384` | FRAME → inst `6363:16389` | 3749,−8578,390,461 | ✓ |
| Settings — Privacy — Mobile | `6185:14547` | FRAME → inst `6363:16393` | 4439,−8578,390,766 | ✓ |
| Settings — Deactivate Account (Confirm) — Mobile | `6213:15617` | FRAME → inst `6363:16397` | −751,−7136,390,550 | ✓ |
| Settings — Delete Account (Confirm) — Mobile | `6225:15024` | FRAME → inst `6363:16401` | −1641,−7082,390,442 | ✓ |
| Settings — Menu — Mobile | `6289:15068` | FRAME → inst `6363:16405` | 4939,−8578,390,487 | ✓ |
| Settings — Overview — Mobile | `6297:15173` | FRAME → inst `6363:16409` | 5439,−8578,390,344 | ✓ |
| Settings — Accessibility — Mobile | `6303:15173` | FRAME → inst `6363:16413` | 999,−7136,390,406 | ✓ |
| Settings — Display — Mobile | `6303:15221` | FRAME → inst `6363:16417` | 1499,−7136,390,316 | ✓ |
| Settings — Language — Mobile | `6303:15262` | FRAME → inst `6363:16421` | 1999,−7136,390,429 | ✓ |
| Settings — Data Usage — Mobile | `6303:15307` | FRAME → inst `6363:16425` | 2499,−7136,390,394 | ✓ |

**Reference-check before removal** (same discipline as PR 6): scanned all **121,798** nodes on page `0:1` for any prototype reaction, flow-starting-point, or derived instance targeting the 24 old hand-built Top Bar frames or any of their **96** descendant nodes — **zero hits**. These are child frames replaced in place, not top-level frames, so nothing was archived.

---

## 5. Label re-audit (DL #251 point 2)

Re-audited the desktop rail-label fix against **all 24** mobile Settings frames (not just the M9/M15 pair PR 6 spot-checked): full text sweep of every Content panel against 9 stale-label patterns → **0 hits**. PR 6's `5695:8279` heading (`Security & Account Settings`) and `5696:8340` heading (`Notification Preferences`) both correct; the other 22 already correct. Nothing to fix.

---

## 6. Screenshot verification

Screenshot-verified — all render correctly, hairline present, Content unchanged:

- `5607:7813` (Account — had the border) · `5696:8340` (Notification Preferences — **gained** the hairline) · `6289:15068` (Menu hub — no back bar, correct) · `6185:14547` (Privacy — tall) · `6225:15024` (Delete Account Confirm — `y −7082` region) · `6303:15221` (Display leaf — hairline clearly visible at full res).

---

## 7. Not touched / not done

- **Desktop `Settings Shell` (`6339:16094`)** — read only, confirmed unchanged (6 variants, `9240×2517`, `x 20000, y −16000`). Mobile-only PR.
- **`Settings Back Bar — Mobile` (`6348:16292`)** — read only, confirmed unchanged (`350×24`, `‹` + `Settings`). PR 6 already swapped it onto the 22 back-bar frames.
- **`Content` panel** — never touched on any frame; not componentized, exactly as the desktop `Settings Shell` leaves the desktop content panel.
- **The `figma-to-code` conversion** of the consolidated Settings set — still a flagged separate follow-up; only `PrivacySettingsPage.tsx` / `/settings/privacy` is shipped in `apps/web` today (`apps/mobile` has no application code, so this pass carries no code impact).
- **Left-gutter / any content-layout change** — out of scope; content-panel byte-identical is the requirement.

---

## 8. Decision Log

- **#251** → forward-pointer appended: **Resolved by DL #252 (`sprint-2/settings-mobile-shell-componentization`, PR 7)**.
- **#252** (new) — records this pass.

## 9. Provenance

Figma writes performed by the `figma-design-system` agent in this session (shell available); branch, commit, docx Decision Log transcription (#252 + #251 forward-pointer) and PR finalised in the same session.
