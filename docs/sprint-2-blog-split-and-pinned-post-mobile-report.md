# Sprint 2 — Blog auth-state split + Normal Pinned Post mobile

Branch (to be created by the founder): `sprint-2/blog-split-and-pinned-post-mobile`

Figma design only. **No application code touched.** `BlogPage.tsx` is still a
`PlaceholderPage` stub, so there is nothing to convert here — that stays a
separate `figma-to-code` task.

File: "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1` ("Soccernity").

---

## 0. Pre-flight (verified live, not assumed)

- **Pages confirmed** as CLAUDE.md describes: `1860:2500` (cover), `2155:1285`
  (dump), `0:1` (Soccernity). All work is on `0:1`.
- **Token pass confirmed complete.** `Soccernity Theme`
  (`VariableCollectionId:5096:2`) exists and is populated — **13** COLOR
  variables, modes **Light** (`5096:0`, default) / **Dark** (`5096:1`). This is
  one more than CLAUDE.md's "Figma notes" section records (it says 12); the
  extra is `semantic/alert` (`VariableID:5670:8226`, `#FA0606`), added by
  PR #114 under Decision Log #99. **CLAUDE.md's Figma-notes variable count is
  stale by one** — worth correcting in a future doc sweep.
- Read via file key and via `use_figma` agree, so the desktop app has the
  correct file/page frontmost.

---

## 1. TASK 1 — Blog split into one frame per auth state

### 1.1 What existed

`Blog Page Desktop` (`1009:128`) and `Blog Page Mobile` (`41:4`) each carried
**both** navbar variants stacked at `0,0` — `header 4` visible, `header 7`
hidden — with a name that carried the toggle instruction
("logged-out state — toggle visible, hide header 4"). That was PR #151's
Decision Log #169 compromise, because Blog had one frame per breakpoint rather
than Sports' one-frame-per-auth-state.

Sports' convention, mirrored here: `Sports Page - when user is logged in`
(`1009:673`, one visible `header 4` instance, no `header 7` node at all) and
`Sports Page  - when user is not logged in` (`205:2`, one visible `header 7`).

### 1.2 New frames

| Frame | Node ID | Size | Position | Navbar instance | → component |
|---|---|---|---|---|---|
| Blog Page Desktop — Logged In | **`5953:10771`** | 1440 × 11756 | −35800, −30794 | `5953:11272` "Navbar — header 4" | `2838:3502` `Property 1=header 4` |
| Blog Page Desktop — Logged Out | **`5953:11364`** | 1440 × 11756 | −34160, −30794 | `5953:11866` "Navbar — header 7" | `2841:4104` `Property 1=header 7` |
| Blog Page Mobile — Logged In | **`5956:10960`** | **390** × 5753 | −32520, −30794 | `5956:11309` "Navbar — header 4 — mobile" | `5386:6576` `Property 1=header 4 — mobile` |
| Blog Page Mobile — Logged Out | **`5956:11331`** | **390** × 5753 | −31930, −30794 | `5956:11681` "Navbar — header 7 — mobile" | `5386:6575` `Property 1=header 7 — mobile` |

Each frame carries **exactly one** navbar instance, visible, matching its auth
state. The opposite variant is **removed**, not hidden — matching Sports, and
matching the brief. Instances are renamed to the plain Sports-style names
(`Navbar — header 4` / `Navbar — header 7`), dropping PR #151's toggle
instructions, which no longer apply.

**Also removed from the new frames only:** the dead, already-hidden legacy
header chrome that PR #151 hid rather than deleted — desktop `Rectangle 109`,
`Group`, `Rectangle 110`, `akar-icons:search`, `Search Soccernity`,
`Group 258`, `Ellipse 30`, `ci:notification-outline-dot`, `bx:message-dots`
(9 nodes); mobile `bx:menu` and `Group 102` (2 nodes). Carrying a dead
duplicate header into a brand-new frame invites someone unhiding it later. The
archived originals keep every one of these nodes intact, so nothing is lost.

### 1.3 The 375 → 390 mobile reflow (resolves Decision Log #171)

`41:4` was 375px — non-canonical. Both new mobile frames are **390px**.

**A real bug was hit and fixed mid-task, not papered over.** `frame.resize()`
on an absolute-layout frame still applies **child constraints**. GROUP nodes
have no `constraints` property of their own (verified: `'constraints' in node`
is `false` for every GROUP child here) — their leaf descendants carry them — so
widening 375 → 390 silently drifted two children by +4px: `Group 3`
(150 → 154) and `Trending Topics` (113 → 117). A first build shipped that
drift plus a second error (the footer background's `x` was set to the frame's
**page** coordinate, because a leaf's `.x` inside a GROUP is *frame*-relative,
not group-relative — that blew the footer group out to 32838px wide). Both bad
clones were **deleted and rebuilt**, this time capturing exact source geometry
first and re-asserting each child's `x`/`y`/`w`/`h` after the resize. The
rebuild's own drift report confirms only those same two nodes moved and both
were corrected.

**Reflow strategy — a judgment call, stated plainly.** For a +15px widen the
choice was (a) re-centre the existing composition, or (b) stretch the 335px
content column to 350px to use the extra width. I chose **(a)**. Option (b)
means `GROUP.resize()` on six large legacy groups, which stretches leaf
children — the article hero photos and `Intersect` thumbnails would take a
~4.5% horizontal distortion, and text boxes would re-wrap. That is a real
visual regression traded for 15px of column. Re-centring preserves every image
aspect ratio, every text wrap and every internal alignment exactly.

Result: content column stays 335px wide, side margins go 20/20 → **28/27**;
full-bleed footer background (`Rectangle 17`) genuinely widened to 390 at
`x = 0`; navbar instances resized to 390 wide. Verified per-child:

| Child | x | width | right margin |
|---|---|---|---|
| Group 37 | 78 | 235 | 77 |
| Group 3 | 158 | 74.7 | 157.3 |
| Group 36 (hero) | 36 | 318 | 36 |
| Group 42 / 44 / 45 / 46 ×3 | 28 | 335 | 27 |
| Trending Topics | 121 | 148 | 121 |
| Group 55 (footer) | 0 | **390** | 0 |
| Navbar | 0 | **390** | 0 |

If the founder would rather have the true 350px column, that is a deliberate
rebuild of those six groups, not a resize — flag it and it can be done as its
own pass.

### 1.4 Archived originals — confirmed

Both hidden (`visible = false`) and renamed. **Naming deviation, flagged:** the
brief specified `ARCHIVED - ` (hyphen); the file's own established convention
across 12 existing archived frames is `ARCHIVED — ` (em dash) plus a
parenthetical "superseded by …" note. I matched the file, since consistency
with what is already built outranks the brief's incidental punctuation.

| Node ID | New name | visible |
|---|---|---|
| `1009:128` | `ARCHIVED — Blog Page Desktop (superseded by Blog Page Desktop — Logged In / — Logged Out)` | **false** |
| `41:4` | `ARCHIVED — Blog Page Mobile (375px — superseded by Blog Page Mobile — Logged In / — Logged Out at 390px)` | **false** |

Neither is deleted. Both retain all original content including the legacy
chrome removed from the new frames.

### 1.5 Section banner

The Blog section banner `5942:12065` ended at x −31761; the new frames run to
−31540. Widened 11792 → **12093** (right edge −31460) so all four sit inside
the labelled section — same housekeeping PR #104 did for Auth Pages / Email
Template / Guardian Consent. The "Blog" label text was not moved.

---

## 2. TASK 2 — Community — Home Feed with Normal Pinned Post — Mobile

**Node ID: `5956:12797`** — 390 × 562, at 13531, 23522 (the next 500px slot in
the existing Create Post mobile row, after `5818:9031`).

### 2.1 Navbar — exactly as asked

- Instance node: **`5956:12798`**, named `Navbar — header 4 — mobile`
- Points to component: **`5386:6576`** (`Property 1=header 4 — mobile`)
- Which lives in component set: `2824:4309` (`Web app Navbar - Desktop and Mobile`)

Identical to `5818:9031`'s own navbar. This is a feed **state**, not a compose
sub-view, so it correctly takes the site navbar rather than the
`App Bar — Create Post` treatment (PR #151 / Decision Log #170).

### 2.2 Pattern reused, and what actually changed

Cloned from `5818:9031` verbatim, so composer, both post cards, engagement
rows, spacing, radii and every token binding are inherited rather than
re-authored. Checked against desktop `2565:3951` vs `2496:4462`: **the only
difference between the normal and contest desktop variants is the pin badge
label** — `2565:4178` characters `" post"` vs `2502:6698` `"Contest post"`.
There is no contest count badge and no other contest chrome on the feed frames
(the count badge belongs to `5818:8997`, the Contest-mode *composer*), so
nothing else needed removing — confirmed by walking both desktop subtrees, not
assumed.

Changes made:

| Node | Before | After |
|---|---|---|
| `5956:12836` (badge frame) | `Badge — Contest post` | `Badge — Pinned post` |
| `5956:12840` (label) | `Contest post` | **`Pinned post`** |
| `5956:12806` (post card) | `Post — Emeka John [pinned · Contest post]` | `Post — Emeka John [pinned · normal post]` |
| `5956:12837` (pin icon frame fill) | unbound `#ffffff` (`visible:false`) | bound to `color/text/on-navy` |

The badge hugs its text, so it narrowed 107 → 101px; it is `ABSOLUTE`-positioned
inside the card, so its `x` was recomputed to **243** to keep its right edge on
the card's content edge (344 = 358 card width − 14 padding). Verified: right
edge 344 = content right 344.

### 2.3 Copy decision — flagged, not silently taken

Desktop renders the normal badge as a pin glyph plus a pill reading **"post"**
(the string is literally `" post"`, with a leading space). Screenshotted at 3×
to confirm — it reads as a truncated label, not a deliberate one. I used
**"Pinned post"** on the mobile frame instead, parallel to "Contest post".

This deliberately follows the precedent already set by PR #112 / Decision Log
#92: correct copy on the **new** frame, leave the desktop original alone, and
flag the divergence rather than silently editing a screen that belongs to
`figma-design-system`. See candidate **A** below.

---

## 3. Paint audit (measured per frame, whole subtree, fills + strokes)

| Frame | Bound | Unbound | Off-palette | `green-tint-28` |
|---|---|---|---|---|
| `5953:10771` Blog Desktop — Logged In | 351 | 40 | 40 (`#d9d9d9`) | **0** |
| `5953:11364` Blog Desktop — Logged Out | 344 | 40 | 40 (`#d9d9d9`) | **0** |
| `5956:10960` Blog Mobile — Logged In | 239 | 6 | 6 (`#d9d9d9`) | **0** |
| `5956:11331` Blog Mobile — Logged Out | 232 | 6 | 6 (`#d9d9d9`) | **0** |
| `5956:12797` Normal Pinned Post — Mobile | 71 | **0** | **0** | **0** |

**Zero `brand/green-tint-28` anywhere** (Decision Log #47 honoured). **Zero new
colours.** Light mode only. **Zero frame overlaps** — checked all five new
frames against every one of the 435 page-level nodes.

**Honest framing of the `#d9d9d9`:** every one of those paints is *inherited
verbatim* from the cloned source, not authored by me. The only paint this pass
genuinely authored is the pinned-post badge, which is at 0 unbound / 0
off-palette. I deliberately did **not** rebind the inherited greys — see
candidate **B**; that is a Blog-section-wide retrofit and doing it on 4 of the
6 frames in the section would leave the section half-migrated.

---

## 4. Decision Log candidates

**A — Pinned-post badge copy: mobile says "Pinned post", desktop says " post".**
Desktop `2565:4178` on `2565:3951` has characters `" post"` — leading space,
and a label that reads as unfinished next to its own sibling "Contest post".
The new mobile frame uses "Pinned post". Desktop was intentionally not edited
(it is an already-built screen, `figma-design-system`'s domain). Recommend
aligning desktop to "Pinned post" in that agent's next pass. Same
correct-on-new / flag-on-old shape as Decision Log #92.

**B — `#d9d9d9` debt across the whole Blog section; PR #111's "Blog is
token-clean" was incomplete.** `docs/sprint-2-clubpicker-cta-token-verify-report.md`
recorded user-facing Blog as token-clean. Measured directly: **40** unbound
off-palette `#d9d9d9` paints on Blog Desktop, **6** on Blog Mobile, plus **5**
on `Articles Page Desktop` (`54:434`) and **4** on `Articles Page mobile`
(`87:80`) — the two other frames in the same section. 39 of the 40 desktop ones
are image-backing plates fully covered by real photos (invisible in render);
the exception is candidate C. Recommend one section-wide rebind by
`figma-design-system` (`brand/green-tint` for placeholder plates, the precedent
PR #128 set for the Contest fan-avatar greys) rather than a per-frame fix.

**C — A visible, unlabelled grey pill sits in the desktop Blog footer.**
`Rectangle 14`, 294 × 67, `#d9d9d9`, fully visible, centred above the footer
links: `5953:11228` (Logged In), `5953:11821` (Logged Out), `1009:603`
(archived original). It renders as a bare grey capsule on navy. The mobile
footer has a `"Soccernity."` wordmark in exactly that slot and no such pill, so
this is very likely a **missing wordmark placeholder on desktop**, not a
decorative element. Not fixed here because "what should this be?" is a design
answer I do not own — binding it to a token would hide the defect rather than
resolve it.

**D — Pre-existing 7px text collision in the Blog mobile article cards.**
The card headline ("Kane joins 250 club after heading Spurs past Wolves")
overlaps its own body copy by 7px on every article row. **Proven inherited, not
introduced by the reflow**: headline/body geometry is byte-identical between the
archived 375px original and the new 390px frame (headline bottom 967, body top
960, on all rows in both). Needs a real fix in `figma-design-system`'s next
Blog pass.

**E — `Articles Page Desktop` / `Articles Page mobile` were never navbar-
retrofitted, and mobile is still 375px.** `54:434` has **zero** navbar
instances; `87:80` has only a legacy `Group 103` logo lockup, not a Navbar
variant, and is 375px wide. Both sit inside the Blog section banner alongside
the frames this pass just split. They need the same treatment (canonical
navbar, auth-state split, 390px) to make the section internally consistent. Not
bundled here — outside this brief's named scope, and it is its own sized piece
of work.

**F — Archive-name punctuation.** Brief said `ARCHIVED - `; file convention
(12 existing frames) is `ARCHIVED — `. Used the file convention. Noting it so
the difference is deliberate and visible rather than looking like a typo.

**G — Blog mobile keeps a 335px content column inside a 390px frame.**
Re-centred rather than widened, for the image-distortion reason in §1.3.
Margins are 28/27 rather than the file's more common 20/20. If a true 350px
column is wanted, that is a rebuild of six legacy absolute-layout groups.

---

## 5. Resolves / relates to

- **Decision Log #169** — resolved. Blog no longer carries both navbar variants
  on one frame; it now matches the Sports one-frame-per-auth-state convention.
- **Decision Log #171** — resolved. Blog mobile is 390px, the canonical width.
- **Decision Log #170** — the follow-up it flagged is closed: mobile now has a
  counterpart to desktop `2565:3951`, alongside the existing contest counterpart
  `5818:9031`.
- **Decision Log #47** — honoured, 0 `brand/green-tint-28` introduced.
- Non-negotiable #3 (two-colour palette) — honoured, 0 new colours.

---

## 6. All node IDs, for transcription

**Created (5):**
`5953:10771`, `5953:11364`, `5956:10960`, `5956:11331`, `5956:12797`

**Mutated (5):** `1009:128` (archived), `41:4` (archived), `5942:12065`
(banner widened), `5956:12837` (pin fill bound), plus the renames/removals
inside the five new frames listed above.

**Deleted:** two intermediate mobile clones (`5954:10940`, `5954:11311`) that
carried the constraint drift described in §1.3. They never reached a verified
state and are not part of this delivery.
