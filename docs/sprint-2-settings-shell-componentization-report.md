# Sprint 2 — Settings shell componentization — PR 6 of 6 (FINAL)

**Agent:** figma-design-system · **Date:** 2026-09-07 · Figma design only — no app/backend code, no merge.
Executes structural finding **#11** of the Settings-family consolidation (Decision Log #230). Figma desktop app reconfirmed on "Soccernity-MVP" page `0:1` before every write.

> The Figma work in this PR was performed by the `figma-design-system` agent with no shell available; the branch, commit, docx Decision Log transcription (#249 + #230 flip + Section 7 edits) and the PR were finalised in a follow-up session — same pattern as PRs 1–5 of this set.

---

## 1. `Settings Shell` component set — the core of #11

| | |
|---|---|
| **Component set node** | **`6339:16094`** — `Settings Shell` |
| **Location** | parked off-canvas at `x 20000, y −16000` → `x 29240, y −13483`. **No clash** with the Admin Shell parked zone (`x 37943–53343, y −16153→−14929`), verified. |
| **Variant property** | **`Active`** — 6 values: `Account` (default) · `Security` · `Privacy` · `Notifications` · `Display` · `None` |
| **Variant node IDs** | Account `6324:15401` · Security `6326:138` · Privacy `6326:256` · Notifications `6326:374` · Display `6326:492` · None `6326:19` |
| **Contains** | header-4 web navbar instance (`0,0`), the nav-rail block `Frame 5910` (`Settings` H1 + 5 rail rows, at `344,116`), and the two column dividers `Line 106` / `Line 107` (`674,90` / `1239,90`). **Not** the content panel. |
| **Baked rail labels** (decisions #2/#3) | `Account` · **`Security & Account Settings`** · **`Privacy`** · **`Notification Preferences`** · **`Display, Language & Region`** — applied as instance-level text overrides on the `Frame 5904` row instances *inside each variant*. **The `Frame 5904` set (`2906:7170`) itself was NOT touched** — see §3. |
| **Active-row treatment** | the active section's rail row is set to the set's real `click…`/`clicked…` variant (navy fill + white label + accent bar), matching the file's existing convention and the Admin Shell precedent — not a hand-restyled look. `Active=None` → all five rows resting. |
| **Chevron alignment** | every rail row switched to `primaryAxisAlignItems: SPACE_BETWEEN` / `itemSpacing: 0` (the accent `Rectangle 351` set to `layoutPositioning: ABSOLUTE` so it doesn't consume the gap). Verified: **all five chevrons sit at `x 305`** across every variant, regardless of label length — the same layout trap PR 2 hit on the landing, fixed here once at component level. |
| **`ON_HOVER → CHANGE_TO`** | preserved on every resting row (inherited from the underlying `Frame 5904` variant + re-asserted). |

### NAVIGATE targets are **per-instance**, not baked — a discovered Figma constraint

The brief asked to bake the 5 `ON_CLICK → NAVIGATE` targets into the shell component. **Figma rejects this**: setting a `NAVIGATE` reaction on any node that is a descendant of a `COMPONENT` (variant or standalone) fails with *"the source may not be a valid prototype source … destinations must be a different top-level frame"* — the same family of limitation as Decision Log #103 (a variant component can't be an `OPEN_OVERLAY` destination). Confirmed by isolation test: `NAVIGATE` set on a descendant of a freshly-created standalone `COMPONENT` fails identically.

**Resolution, consistent with the existing file convention** (PR 4 established every `ON_CLICK → NAVIGATE` on these rails is already an instance-level override): the 5 targets are set as **per-instance overrides on each re-based frame's shell instance**. `ON_HOVER` is preserved on each row (`row.reactions = [...inheritedHover, navReaction]`). Targets:

| Rail row | → |
|---|---|
| Account | `2905:4798` |
| Security & Account Settings | `2926:8056` |
| Privacy | `6178:14437` |
| Notification Preferences | `2926:9721` |
| Display, Language & Region | `2922:5832` |

On each frame the row matching that frame's own `Active` section is **skipped** (no self-NAVIGATE — Figma rejects it and PR 4 established the convention). On `Active=None` (the landing) all 5 rows navigate.

## 2. All 23 desktop Settings frames re-based — content geometry byte-identical

Per frame: captured every non-shell / non-watermark child's `{x,y,w,h}` → deleted the 4 shell nodes (navbar instance, `Frame 5910`, `Line 106`, `Line 107`) → appended one `Settings Shell` instance at `(0,0)`, `1440×2517`, correct `Active` → set per-instance NAVIGATE overrides → re-read and compared. **`geomOK: true` on all 23 — zero content-panel deviation.**

| # | Frame (post-PR-4 name) | Node | `Active` | Content panel (x,y,w,h) — unchanged before→after | Shell instance |
|---|---|---|---|---|---|
| D1 | Settings — Account | `2905:4798` | Account | 688,186,396,560 | `6345:16036` |
| D2 | Settings — Account Info (Confirm Password) | `2922:6396` | Account | 688,125,536,244 | `6345:16162` |
| D3 | Settings — Account Information (Edit) | `2924:7112` | Account | 688,125,536,479 | `6345:16288` |
| D4 | Settings — Change Password | `2924:6870` | Account | 688,125,536,465 | `6345:16414` |
| D5 | Settings — Deactivate Account (Intro) | `2924:7358` | Account | 688,125,539,320 | `6345:16540` |
| D6 | Settings — Deactivate Account (Confirm) | `6213:15640` | Account | 688,125,536,372 | `6345:16666` |
| D7 | Settings — Delete Account (Confirm) | `6225:14789` | Account | 688,125,536,329 | `6345:16792` |
| D9 | Settings — Security & Account Settings | `2926:8056` | Security | 688,125,644,362 | `6345:16918` |
| D10 | Settings — Two-Factor Auth (SMS) | `2926:8294` | Security | 688,125,533,281 | `6345:17044` |
| D11 | Settings — Privacy | `6178:14437` | Privacy | 688,186,413,999 | `6345:17170` |
| D12 | Settings — Direct Messages & Read Receipts | `2926:8764` | Privacy | 688,125,533,175 | `6345:17296` |
| D13 | Settings — Your Posts (Sensitive Media) | `2926:8996` | Privacy | 688,125,533,170 | `6345:17422` |
| D15 | Settings — Notification Preferences | `2926:9721` | Notifications | 688,125,552,281 | `6345:17548` |
| D16 | Settings — Filters | `2926:9230` | Notifications | 688,125,533,188 | `6345:17674` |
| D17 | Settings — Push Notifications | `2927:9954` | Notifications | 688,125,533,183 | `6345:17800` |
| D18 | Settings — Email Notifications | `2927:10205` | Notifications | 688,125,533,341 | `6345:17926` |
| D19 | Settings — Muted accounts | `2926:9482` | Notifications | 688,125,293,218 | `6345:18052` |
| D20 | Settings — Display, Language & Region | `2922:5832` | Display | 687,188,454,486 | `6345:18178` |
| — | Settings — Overview (PR 2 landing) | `6295:15068` | None | 688,186,396,475 | `6345:18304` |
| — | Settings — Accessibility (PR 3 leaf) | `6304:15181` | Display | 688,125,533,324 | `6345:18431` |
| — | Settings — Display (PR 3 leaf) | `6304:15329` | Display | 688,125,533,227 | `6345:18557` |
| — | Settings — Language (PR 3 leaf) | `6304:15471` | Display | 688,125,533,378 | `6345:18683` |
| — | Settings — Data Usage (PR 3 leaf) | `6304:15615` | Display | 688,125,533,324 | `6345:18809` |

The PR 2/PR 3 instance-override rail labels are **superseded** — those frames now inherit the labels from the shell component, so no stray instance overrides remain (their old hand-built `Frame 5910` rails were deleted with the other shell pieces).

## 3. Label + heading fixes

**Rail labels** — baked into the `Settings Shell` component (§1), so correct on all 23 live desktop frames.

**`Frame 5904` component set (`2906:7170`) was deliberately NOT edited.** After this re-base, the only `Frame 5904` instances anywhere on live frames are the 5 rows inside each `Settings Shell` instance (which carry the correct override labels). The remaining `Frame 5904` variant labels ("security and account access" / "notifications" / "Display, Language and Region") are now only visible inside the **archived** frames (D8/M8/D14/M14 + the pre-archived Privacy & Safety), where they're irrelevant. Editing the set at component level would also have meant re-doing the per-variant `itemSpacing` layout trap on ~90 nested variant/instance nodes for zero live benefit. **Scoped: not touched. Labels are correct everywhere they render.**

**On-screen section headings** (per-frame content):

| Frame | Node | Old | New |
|---|---|---|---|
| D9 `2926:8056` | `2926:8165` | "Security" | **"Security & Account Settings"** |
| D15 `2926:9721` | `2926:9830` | "Preferences" | **"Notification Preferences"** |
| M9 `5695:8279` | `5695:8289` | "Security" | **"Security & Account Settings"** |
| M15 `5696:8340` | `5696:8350` | "Preferences" | **"Notification Preferences"** |

Screenshot-verified — desktop headings auto-grow (`WIDTH_AND_HEIGHT`); mobile headings sit in a fixed 350px column (`HEIGHT` auto-resize) and render cleanly.

## 4. Left-gutter re-balance — decision: **KEEP, applied uniformly**

**Proposal accepted: keep the empty `x 0–344` band; the rail stays at `x 344`, content panels at `x 688`, dividers at `x 674` / `x 1239`.** Baked into the `Settings Shell` component, so **all 23 frames are geometrically identical** — the real requirement of task 4.

Reasoning: reclaiming the band would require shifting the rail + both dividers *in the component* **and** every one of the 23 content panels left by ~244px. The content panels vary in width (293–644px) and internal layout; a 23-frame coordinated shift is real regression risk for a purely cosmetic gain. The header-4 navbar fills the full 1440px width, so the top of every frame reads edge-to-edge and the empty band sits anchored beneath it. PR 2 / PR 3 / PR 5 all deliberately kept this and the founder reviewed those.

Now that the shell is a real component, reclaiming is a **cheap, low-risk follow-up** (one component edit + a scripted `content.x -= N` across 23 frames) and does not block #230. Flagged, not done.

## 5. Section banners widened

| Banner | Node | Before | After |
|---|---|---|---|
| Desktop text "Settings" | `2930:10458` | `x −15259`, `w 3386`, left-ish | `x −16469`, `w 10707`, **CENTER**-aligned, `HEIGHT` auto-resize — spans the full live desktop row (`−16469` → `−5762`) |
| Desktop backing strip `Rectangle 350` | `2930:10457` | `x −16483`, `w 23459`, **unbound** navy fill | `x −16469`, `w 10707` (aligned to the text span), fill **bound to `brand/navy`** (`VariableID:5096:4`) — fixed a pre-existing unbound paint while in the file |
| Mobile text "Settings (Mobile)" | `5698:8239` | `x −4751`, `w 2666` | `x −4751`, `w 10580`, **CENTER**-aligned — spans the full live mobile row (`−4751` → `5829`) |

**Flagged, not covered:** the detached PR 3 Display-leaf clusters (desktop row at `y 6000`, mobile row at `y 8800`) sit in their own rows far from the main clusters; neither banner spans them without becoming ~17,000px tall. Same pre-existing gap PR 3 itself flagged — a small dedicated marker for those two rows is a follow-up. Archive strip at `y −13500` correctly excluded (all archived frames are `visible:false`).

## 6. Mobile — `Settings Back Bar — Mobile` component + swap

The mobile `‹ Settings` back bars were **structurally uniform** across every mobile section frame (a `FRAME` named "Back to Settings", `350×24`, children `‹` + `Settings`, first child of `Content`), so a full swap was clean.

- **New component: `Settings Back Bar — Mobile` (`6348:16292`)**, parked at `x 20000, y −13000` (clear of everything).
- **Swapped onto 22 mobile Settings frames** (all live section + leaf frames; excludes `Settings — Menu — Mobile` and `Settings — Overview — Mobile` which have no back bar by design). Each instance wired **`ON_CLICK → NAVIGATE → 6289:15068`** (`Settings — Menu — Mobile`) as a per-instance override — closing PR 5's "some wired, some not" inconsistency. The 4 mobile Display leaves previously pointed at `5649:8140` (PR 3); re-pointed to the menu hub for consistency, since the label reads "Settings" — a small, strictly-consistent divergence, disclosed.
- Instance IDs `6348:16293`…`6348:16377`. Remaining "Back to Settings" FRAMEs (3) are all inside ARCHIVED frames — left untouched.

M9 / M15 headings fixed (§3). Full mobile shell componentization (the Top Bar + Content structure) was **not** attempted — the back bar was the clean, proportionate touch; a `Top Bar — Soccernity` component + Content standardisation across ~24 mobile frames is a genuinely separate effort. **Flagged as a follow-up.**

## 7. Audit

- **`Settings Shell` set** (`6339:16094`): 508 solid paints, **508 bound, 0 unbound, 0 `brand/green-tint-28`, 0 new colours.** (The shared-navbar avatar `IMAGE` fill inside each variant's navbar instance is a non-solid fill and the already-documented shared-component debt — not editable from an instance.)
- **`Settings Back Bar — Mobile`** (`6348:16292`): 2 paints, 2 bound, 0 unbound.
- Everything else was a **deletion**, a **clone of an already-bound node**, a **variant swap**, a **reaction override**, a **text-characters edit** (reusing existing bound fills + fonts via the load→await→mutate recipe), or a **layout-property change** — no paints authored except the `Rectangle 350` fill *binding* (an improvement).
- **Overlaps:** 0 introduced. All 92 pre-existing page overlaps are the file's own section-banner-Rectangle-behind-its-label pattern; none involve any node this PR created or moved. Parked components clash neither the Admin zone nor each other.
- **Screenshot-verified:** all 6 `Active` states (Account, Security, Privacy, Notifications, Display, None) desktop + M1 / M9 / M15 mobile + both widened banners. Rails render correct labels, chevrons at `x 305`, active navy highlight on the right row, both dividers present, content panels intact, empty left gutter (intended), no clipping / no collision.

## 8. Flagged, not fixed (all out of scope for #11 / all pre-existing)

1. **Left-gutter reclaim** — kept deliberately; cheap component-level follow-up now available (§4).
2. **Detached Display-leaf rows** (desktop `y 6000`, mobile `y 8800`) — no banner marker; PR 3's own flag (§5).
3. **`Frame 5904` set (`2906:7170`) still carries stale variant labels** — only visible in archived frames now; a component-level fix + `itemSpacing` re-do would touch ~90 nested nodes for zero live benefit (§3).
4. **Mobile shell (Top Bar + Content) not componentized** — back bar done, the rest is a separate pass (§6).
5. **D15 subtitle `2926:9831` still reads "See information about your account"** and the D15 Push/Email row descriptions still carry 2FA boilerplate — pre-existing template junk flagged by PR 4/PR 5, text-hygiene scope, not headings.
6. **Navbar avatar `IMAGE` fill** — shared-component debt, not addressable from an instance.
7. The **Display-merge question is untouched** — Display stays a 4th leaf, unresolved (per the "Do NOT" list).

## 9. `use_figma` authoring gotchas hit (folded into CLAUDE.md's standing list)

- **`NAVIGATE` reactions cannot be set on any descendant of a `COMPONENT`** (variant or standalone) — Figma rejects with *"the source may not be a valid prototype source"*. Same family as Decision Log #103. Set NAVIGATE as a per-instance override instead. (`ON_HOVER → CHANGE_TO` is fine on component descendants.)
- **`node.clone()` parents the clone under `figma.currentPage`, not under the original's parent** — and `figma.currentPage` resets to the first (cover) page each `use_figma` call. 5 component clones silently landed on the cover page; had to `page.appendChild()` them back to `0:1` before `combineAsVariants` (which requires all nodes on the parent's page).
- **`instance.setProperties({ 'Property 1': … })` invalidates the node handle** — a `.reactions =` set immediately after on the same handle fails as an invalid prototype source. Re-fetch the row from its stable parent by index between the variant swap and any further mutation.
- **`component.clone()` drops instance-level reaction overrides on nested instances** — the NAVIGATE overrides cloned into variant 1 did not survive `clone()` into the other 5 variants (inherited `ON_HOVER` from the underlying variant component did survive). Set instance-level reactions explicitly on every variant.

---

## 10. Draft Decision Log entry — #249 (flips #230 → Resolved)

See Build Plan Section 9, Decision Log #249, transcribed in the finalising session.

## 11. Build Plan Section 7 — the paragraphs referencing "22 duplicate Settings frames"

Three paragraphs were updated in the finalising session to record the design-half consolidation as complete (real count 40 frames, not 22; shell componentized; all 23 desktop frames re-based) and the `figma-to-code` conversion of the consolidated set as the outstanding code-half work — only `PrivacySettingsPage.tsx` / `/settings/privacy` is shipped in `apps/web` today.
