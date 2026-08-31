# Sprint 2 — Club Picker CTA / Token Verification Pass (8 sections)

**Intended branch:** `sprint-2/token-verify-clubpicker-cta`
**Date:** 2026-08-31
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)
**Agent:** `figma-design-system` (no Bash / shell this session — same constraint as PRs #98/#102/#110)
**Scope:** small, low-risk verification + fix pass. **No new screens, states, or mobile
equivalents** (that is `figma-screen-builder`'s separate job). In-place edits only.

Follows an earlier recon/audit pass (halted by the founder before it produced a committed
report — its findings live only in this session's history), which established that Layer-1
light-mode token retrofit was already applied file-wide by PRs #98/#99 and that the one
concrete residual worth chasing was the Club Picker CTA treatment.

> **Editor's note (added at PR finalization):** the earlier recon pass was stopped and its
> report was never committed, so every reference below to
> `sprint-2-token-retrofit-audit-notifications-report.md` and to "renumbering its proposed
> #80–#88" is moot. This pass's Decision Log entries #80–#83 stand alone; the highest
> existing entry in Build Plan Section 9 is #79.

---

## 1. Scope lock

Verified/touched **only** frames in: Blog (user-facing), Sports/Livescores, Club Picker,
Bants, Message, Community (home feed / profile only), Create Post (Community composer),
Settings (user-facing only). **Not touched:** Homepage, Leaderboard, Auth Pages, Guardian
Consent, Admin Panel (incl. Admin-side Settings/roles screens).

---

## 2. What shipped — verified-compliant vs actually-fixed

| Section | Frames checked (key IDs) | Result |
|---|---|---|
| **Blog (user-facing)** | `1009:128`, `41:4`, `54:434`, `87:80`, `87:158`, `102:340`, `104:444`, `96:253`, `104:393`, `104:474` | **Compliant** — 0 `green-tint-28`, 0 unbound black text, 0 green-on-light text, 0 unknown-var bindings. Remaining unbound paints = decorative icons / social brand marks (disclosed exceptions, rounds 1–3). No change. |
| **Sports/Livescores** | `205:2`, `1009:673`, `632:943`, `640:3737`, `667:1952`, `756:11`, `756:6433` | **Compliant for tokens.** Large unbound-paint counts (~3,400/page) = national-flag / club-crest / jersey vector art — the exact disclosed exception round 3 (§3.3) reverted a false-positive bind on. 4 black `Vector` icon glyphs per Sports Page = pre-existing disclosed. No change. |
| **Club Picker** | `5146:6635`, `5146:6648`, `5146:6661`, `5146:6674`, `5146:6687`, `5150:6656` | **FIXED** — see §3. |
| **Bants** | `2256:6802`, `2459:5234`, `2459:7671`, `2459:10083`, `2459:12447`, `2256:8925`, `2355:2137`, `2256:11081`, `2448:2179`, `2459:4841` | **Mostly compliant.** FIXED: 2 stale instance-level `green-tint-28` overrides + 1 black add-icon (§3). FLAGGED: shared "Navigation" component set `1078:3761` renders unbound black icon glyphs across 5 frames (§4). |
| **Message** | `2025:8112`, `1871:2762`, `2067:3006`, `2067:3176` | **Compliant** — fully clean. No change. |
| **Community (home feed / profile)** | `1306:354`, `949:73`, `1455:4362`, `1455:6626`, `1460:8940`, `1466:15934`, `1662:2782`, `2876:4628`, `2896:4837` | **Compliant** — fully clean. No change. |
| **Create Post (Community composer)** | `2008:655`, `2009:5168`, `2496:4462`, `2565:3951`, `2009:2913` | **Compliant** — fully clean. No change. |
| **Settings (user-facing)** | 19 frames — `2905:4798`, `2922:5143/5382/5602/5832/6396`, `2924:6870/7112/7358`, `2926:8056/8294/8764/8996/9230/9482/9721`, `2927:9954/10205`, `5607:7813` | **Compliant** — 0 `green-tint-28`, 0 unbound black text across all 19. No change. |

### Nodes actually mutated (all in-scope)

| # | Nodes | Change | Reason |
|---|---|---|---|
| 1 | `5147:6644`, `5147:6654`, `5147:6673`, `5148:6644`, `5148:6650`, `5148:6654`, `5148:6673`, `5148:6697`, `5148:6703`, `5148:6707`, `5148:6727`, `5147:6697`, `5147:6707`, `5147:6726` (14, Club Picker states 1/2/3/5) | fill `brand/green-tint-28` → `brand/green-tint` (12%) | Decision Log #47 — `-28` is not a real token. "Club Logo — Image Slot" washes + "Action — joined" pills. Round 1 (PR #98) never migrated these. |
| 2 | `5146:6645`, `5146:6658`, `5146:6671`, `5146:6684`, `5146:6697` (5, Club Picker, all states) | hidden ghost "Soccernity" wordmark fill `#000000` (unbound) → `brand/navy` | "No black at any opacity". Nodes stay `visible:false` (file precedent for ghost duplicates); only the latent black fill removed. |
| 3 | `I2841:6579;2841:4250`, `I2841:6665;2841:4250` (2, Bants navbar Header instances in `2256:6802` / `2459:5234`) | instance-level fill override `brand/green-tint-28` → `brand/green-tint` | The shared Navbar component's own "Union" (messages glyph) is already correctly bound to `brand/green-tint` (`5096:5`) — these two frames carried a stale *instance override* of `-28`. Fixed at instance level; shared component untouched. |
| 4 | `2355:4268` (1, Bants "Banter - create topic" `2355:2137`) | `material-symbols:add` "+" icon vector fill `#000000` (unbound) → `brand/navy` | "No black" — visible frame-level action icon. |

**Total: 22 nodes mutated, all in the 8 in-scope sections.**

### Reverted (out of scope, restored to original state)

`124:366`, `124:472`, `124:476` inside `124:313` "Articles - Create Post". Screenshot after
an initial black→token edit revealed `124:313` is an **Admin Panel** shell screen
(Dashboard / Users / Categories / Contest / Competitions sidebar, "Publish Post" /
"Submit Post" chrome — the PR #102 unified Admin shell), **not** user-facing Blog. The three
text nodes were restored to their original unbound `#000000` fills. Their real fix belongs
to the deferred Admin content-area retrofit (Decision Log #52, which already names "unbound
content titles" as open).

---

## 3. Task 2 — Club Picker CTA contrast: verified ALREADY COMPLIANT, no change

The brief expected "Join" / "Skip for now" CTAs to render **white label on solid
`brand/green`** (~2.3:1, AA fail). **Live inspection of all 5 states shows this is not the
case:**

- Every CTA label text node (`5147:6651`, `5147:6661`, `5147:6670`, `5147:6680`,
  `5147:6685` "Skip for now", + state-2/3/5 equivalents) is **already bound to
  `color/text/on-green`** (`VariableID:5096:10`), which resolves to **navy `#282E65`**.
- Navy `#282E65` on `brand/green` `#7BB929` = **5.29:1** (hand-computed, WCAG relative
  luminance) — **passes AA** for normal text.
- This navy-on-solid-green combination is the standardized fix used file-wide by PR #99
  (round 2 §5.1: "White text on solid `brand/green` … corrected to `color/text/on-green`
  → 5.27–5.31:1", applied across Components, Sports, Message, Community, Community Mobile).
  Club Picker already matches it.

**Conclusion:** the earlier recon report's "possible residual" flag (based on a low-res
screenshot where navy-on-green reads as pale) was a false alarm. The CTAs are compliant.
**No rebind to a navy fill was made** — swapping the green fill for navy would be an
unrequested, visible design change, and the current treatment is both AA-safe and
consistent with the rest of the file. Screenshots of states 1 and 2 (captured this session)
confirm dark, legible labels.

---

## 4. Flagged — NOT fixed this pass (out of narrow scope)

1. **Admin Panel Blog-management frames carry unbound black content titles.**
   `123:56` "Articles" (≈12 black text nodes + ≈25 other unbound — substantially
   un-retrofitted; likely superseded by the public `54:434` "Articles Page Desktop") and
   `124:313` "Articles - Create Post" (3 black content titles). Both are **Admin Panel**,
   not user-facing Blog. → folds into **Decision Log #52** (Admin content-area retrofit).
   Whether `123:56` should be retrofitted or tagged `[superseded]` is a separate call.

2. **Shared "Navigation" component set `1078:3761` renders unbound black icon glyphs.**
   `1102:216`–`1102:224` ("Subtract" / "Ellipse 61" / "Vector" boolean-op glyph parts)
   appear black across `2459:7671`, `2459:10083`, `2459:12447`, `2256:8925`, `2355:2137`
   (7 nodes × 5 frames = 35 instance nodes). This component was **not** in PR #99 batch 1's
   component list (which covered `2824:4309` "Web app Navbar", not `1078:3761`
   "Navigation"). A component-level fix touches every frame that instances it, including
   out-of-scope screens — needs its own shared-component pass. → **Decision Log #83(b)**.

3. **Sports flag / club-crest / jersey vector art** (~3,400 unbound paints per Sports page)
   — disclosed exception from PRs #98/#99 (round 3 §3.3 reverted a bind attempt here).
   Unchanged. Real-club-crest licensing on Match Details remains a separate legal/business
   question, not a token problem.

4. **`ph:soccer-ball-fill` hidden decorative frames** contain black vectors
   (`2256:11083/11085`, `2448:2181/2183`, etc.) — inside `hidden=true` parent frames, so
   not rendering. Not chased.

---

## 5. Task 3 — Naming cleanup: no in-scope action

- **"Settingd" typo (`1620:13390`):** `figma.getNodeByIdAsync('1620:13390')` returns
  **null** — the node does not exist on page `0:1`. A full-page search for any
  Settings-misspelling (`settingd|settting|settng|setings`) returned **zero** nodes. Either
  already fixed in a prior pass or a stale ticket reference. **No action.**
- **"22 duplicate Settings frames":** All 19 user-facing Settings frames have unique,
  clear `Settings — <descriptor>` names (verified live). The only bare-"Settings" frame is
  `1658:2303`, which is **Admin Panel** role-management (canvas region x≈41384, grouped with
  "Settings - Add new role" / "Settings - Edit role" / "Settings - Delete Role"). Out of
  scope. **No in-scope duplicates to rename.** The ticket's "22 duplicates" does not
  correspond to anything in user-facing Settings — likely Admin Panel, or already resolved
  by PR #99's Settings batch / PR #110.

---

## 6. Verification

- Variable collection confirmed live: `Soccernity Theme` (`VariableCollectionId:5096:2`),
  12 COLOR variables, IDs matching CLAUDE.md. No variable created/renamed/revalued.
- Per-frame `findAll` audit of every in-scope frame listed in §2 for: `green-tint-28`
  bindings, unbound black text fills, `brand/green`-bound text on light, non-canonical
  variable bindings.
- Post-fix re-audit of `5146:6635/6648/6661/6674/6687`, `2256:6802`, `2459:5234`,
  `124:313`: **0** `green-tint-28`, **0** unbound black text across all.
- Screenshots (this session): Club Picker states 1 & 2 (CTAs render dark navy labels,
  image-slot washes now the softer 12% tint), Bants "create topic" modal, Blog
  "Articles - Create Post" (revealed the Admin shell → reverted).
- Hand-computed WCAG contrast for navy `#282E65` on green `#7BB929` = 5.29:1.
- No real browser / Playwright check available (same ceiling as every prior Figma PR here).

---

## 7. Decision Log entries to add (Build Plan Section 9)

> **Numbering note:** the earlier recon report
> (`sprint-2-token-retrofit-audit-notifications-report.md` §7) proposed a `#80`–`#88`
> set that is **not yet transcribed** into the `.docx`. Neither pass is merged. This pass
> lands the actual Figma changes, so it takes `#80`–`#83`; when the recon report is
> committed, its proposed `#80`–`#88` must be **renumbered to start at `#84`**. The
> follow-up shell session reconciles both. `#45` remains a real un-written gap (per
> CLAUDE.md / the leaderboard design report).

| # | Title | Resolution |
|---|---|---|
| **#80** | **Club Picker CTA contrast** — reported as white-on-green (~2.3:1 AA fail) across 5 states. | **No bug.** Live inspection: CTA labels already bound to `color/text/on-green` (navy `#282E65`) on `brand/green` fill = **5.29:1, passes AA**; matches the standardized navy-on-solid-green combo PR #99 applied file-wide. No change made; deliberately **not** rebound to a navy fill (unrequested visible redesign). |
| **#81** | **`brand/green-tint-28` residuals in Club Picker + Bants** (Decision Log #47 follow-through). | Club Picker: 14 fills (club-logo image slots + "Action — joined" pills, all 5 states) never migrated by Round 1 (PR #98) — rebound to `brand/green-tint` (12%). Bants: 2 navbar Header **instances** (`2256:6802`, `2459:5234`) carried a stale instance-level `-28` override on the messages-glyph "Union" (shared component itself already correct) — overrides rebound to `brand/green-tint`. PR #99's "eliminated `-28` everywhere" claim was, again, over-stated for instances/older frames. |
| **#82** | **Hidden black ghost "Soccernity" wordmark duplicates** in all 5 Club Picker states (`5146:6645/6658/6671/6684/6697`). | Latent unbound `#000000` fill rebound to `brand/navy` ("no black at any opacity"). Nodes left `visible:false` (file precedent for ghost duplicates); not deleted. |
| **#83** | **Out-of-scope frames confirmed during this pass, left untouched.** | (a) `123:56` "Articles" + `124:313` "Articles - Create Post" are **Admin Panel** shell screens (not user-facing Blog); their unbound black content titles fold into **Decision Log #52**. An accidental edit to `124:313` was reverted. (b) Shared "Navigation" component set `1078:3761` renders unbound black icon glyphs (`1102:*`) inside 5 Bants frames — needs a dedicated shared-component pass. (c) Sports flag/crest/jersey art (~3,400 unbound paints/page) — disclosed exception, unchanged. (d) `1620:13390` "Settingd" does not exist on page `0:1`; no "22 duplicate Settings frames" exist in user-facing Settings (all 19 uniquely named; the only bare "Settings" frame `1658:2303` is Admin Panel). |

---

## 8. Draft CLAUDE.md status bullet

Added directly to CLAUDE.md this session (needs committing on branch
`sprint-2/token-verify-clubpicker-cta`):

> - **`sprint-2/token-verify-clubpicker-cta` — small Figma verification + fix pass over the
>   8 user-facing sections (Blog, Sports, Club Picker, Bants, Message, Community home feed,
>   Create Post, user-facing Settings).** Confirmed PR #98/#99's Layer-1 light-mode retrofit
>   holds: Message, Community, Create Post, and all 19 user-facing Settings frames are fully
>   clean; user-facing Blog and Sports are token-clean (Sports' remaining unbound paints are
>   the disclosed flag/crest/jersey art). **22 nodes fixed, all in scope:** Club Picker's 14
>   never-migrated `brand/green-tint-28` fills → `brand/green-tint`, its 5 hidden black
>   ghost-wordmark fills → `brand/navy`, 2 stale Bants navbar Header **instance** `-28`
>   overrides → `brand/green-tint`, 1 black Bants add-icon → `brand/navy`. **Club Picker CTA
>   contrast (the trigger for this pass) was already compliant** — labels bound to
>   `color/text/on-green` (navy) on green = 5.29:1 AA-pass; no change. Report:
>   `docs/sprint-2-clubpicker-cta-token-verify-report.md`. **Decision Log #80–#83 proposed**
>   (and the earlier recon report's proposed #80–#88 must be renumbered to start at #84).
>   Flagged, not fixed (out of scope): `123:56`/`124:313` are Admin Panel not Blog (→ DL
>   #52); shared "Navigation" component `1078:3761` has black icon glyphs across 5 Bants
>   frames; `1620:13390` "Settingd" node doesn't exist. Not merged — follow-up shell session
>   branches/commits/PRs and transcribes the Decision Log.

---

## 9. Git / handoff

**No branch/commit/PR this session (no shell).** A follow-up shell session must:
1. Create branch `sprint-2/token-verify-clubpicker-cta` from `main`.
2. Commit this report + the CLAUDE.md edit already made this session.
3. Transcribe Decision Log #80–#83 into `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9,
   and **renumber** the earlier recon report's proposed #80–#88 to #84–#92 (or reconcile as
   preferred). Consider finally writing the missing **#45**.
4. Open a PR against `main`. **Do not merge.**

**No application code, no backend, no Figma variables, no `.docx` touched. 22 Figma nodes
mutated (all in-scope), 3 reverted. CLAUDE.md edited.**
