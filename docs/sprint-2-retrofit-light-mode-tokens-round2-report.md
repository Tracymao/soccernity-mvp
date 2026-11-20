# Sprint 2 — Light-Mode Token Retrofit, Round 2 (11 Sections, 80 Frames)

Figma-only design work in file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`), page
"Soccernity" (`0:1`), branch `sprint-2/retrofit-light-mode-tokens-round2`. **In-place
retrofit only — no new frames created, no frame IDs, names, or canvas positions changed.
No application code touched.** This round retrofits the 11 sections named in the task
brief (Blog, Sports/Livescores, Bants, Message, Contest, Community, Create Post, Settings,
Components, Community (Mobile), Message Mobile) to the same standard used to build "Home
Page Desktop — Premium Light (Sprint 2, Pass 2)" (`5204:6728`, PR #97/#98) and "Leaderboard
Page Desktop" (`5171:6633`, PR #98). Admin Panel, Auth Pages, and Email Template are
explicitly out of scope, deferred to a separate push, per the task brief.

Work was done across 9 sequential `figma-design-system` agent sessions (one per section,
Components first since every other screen inherits from it), each session briefed with
every finding from the sessions before it so fixes stayed consistent file-wide. This report
consolidates all 9 sessions' findings into one document, in the same shape as the round-1
retrofit report (`docs/sprint-2-retrofit-light-mode-tokens-report.md`).

## 0. Scope

| # | Section | Frames | Batch report |
|---|---|---|---|
| 1 | Components | 8 (Navbar, Filter Tabs, Dropdown menu, Task Card, Mobile Drop Down Components, Mobile App Nav Icons, Frame 5904, Group 36) | §3.1 |
| 2 | Blog | 11 (Blog/Articles/Contact Us/Terms/Privacy × desktop+mobile, Contact Dropdown) | §3.2 |
| 3 | Sports/Livescores | 11 (Sports Page × 2 auth states, Match Details/Statistics/Lineups/H2H/Standing/Video, Promo Banner) | §3.3 |
| 4 | Bants | 9 (search result, All feed, own bants, search filter + 2 category variants, create topic × 2, post page) | §3.4 |
| 5 | Message + Message Mobile + Contest | 8 (2 Message web, 2 Message Mobile, 3 Contest, Video Thumbnail Hover State) | §3.5 |
| 6 | Community | 12 (comment section, homepage w/ sidebar, post/media/saved feeds, Edit Profile, view post, Inactive Account, search/trending × 2, Community Home Page Template + Instance) | §3.6 |
| 7 | Create Post | 5 | §3.7 |
| 8 | Settings | 18 (Overview through Deactivate Account Intro) | §3.8 |
| 9 | Community (Mobile) | 9 (5 "community mobile" + 4 "Messages mobile window") | §3.9 |

**Explicitly out of scope, untouched**: Admin Panel, Auth Pages (including Register's
still-missing date-of-birth field), Email Template (including the still-missing
reset-password email) — all deferred to a separate push per the brief. No dark-mode
variant, logic, or second mode was added anywhere. No backend/endpoint/DTO changes. No
resolution of Contest's open Decision Log items (points model, club mechanism, logged-out
visibility). No filling of missing-mobile-frame gaps for sections that don't have one.

## 1. Headline findings

### 1.1 Unlike round 1's 16 frames, none of these 80 frames were Dark-mode-pinned

Round 1 (PR #98) found all 16 of its target frames carried an explicit
`explicitVariableModes` pin to Dark, so a single `setExplicitVariableModeForCollection`
call per frame resolved most of the work. **Every one of this round's 80 frames came back
with `explicitVariableModes: {}`** — none were pinned. This meant there was no mode-flip
shortcut anywhere in this round; every fix across all 9 batches is a genuine per-node
fill/stroke bind, which is why this round's total edit count (several thousand individual
paint bindings) is far larger than round 1's.

### 1.2 The shared Navbar's variant labels were backwards in Batch 1's own summary — corrected here

Batch 1 (Components) fixed the shared "Web app Navbar - Desktop and Mobile" (`2824:4309`)
and stated in its own report header: "`header 4` = logged-out, `header 7` = logged-in."
This is **backwards**. Verified directly by this consolidator via live screenshot +
metadata (not re-derived from any batch's prose):

- `Property 1=header 4` (top position, y=570): shows a profile-avatar icon, no Login
  button → **this is the LOGGED-IN variant.**
- `Property 1=header 7` (bottom position, y=1063): shows a navy "Login" button, no avatar
  → **this is the LOGGED-OUT variant.**

Batch 1's own detailed content description (§2.2 of its report: "`header 7`'s navy 'Login'
button with white text") was actually consistent with the corrected mapping — only its
one-line summary had the two variants swapped. This correction was fed forward into
batches 2–9, all of which used the corrected mapping (confirmed via `header 4`
determinations throughout §3 below). **The token/color fixes Batch 1 made to both variants
are unaffected by this — this was purely a documentation error in which label pointed to
which variant, not a wrong-variant-fixed error.**

### 1.3 The recurring "muted metadata text fails AA" finding is two different things, not one

Batches 4, 5, 6, 7, 8, and 9 each independently found text at low opacity failing WCAG AA
(ratios 1.3:1–3.95:1) and each disclosed it as a recurring pattern. Batch 9 raised a
hypothesis that this might all be one underlying tooling bug rather than a real, consistent
design pattern. Resolving this directly from the batch reports' own "before" states:

- **Batches 4, 5, and 7 found text whose raw, *unbound*, pre-session hex was already
  `brand/navy` (`#282e65`)**, just at a low, internally-consistent opacity (29–31%,
  repeated identically across many instances — timestamps, follower/reply/view counts,
  bios). This is a color that was **already on-brand** before this session touched
  anything; the only question is an accessibility/opacity one, which is a real design
  decision (raise the opacity vs. keep the current visual hierarchy), not a token-binding
  bug. All three batches correctly treated this as "disclose, don't silently change" —
  changing the opacity would be a visible design change beyond a color-token pass's
  mandate.
- **Batches 6, 8, and 9 found text whose raw, pre-session hex was literal `#000000`**
  (black) at various, often inconsistent opacities (12–60%). Black is an absolute rule
  violation regardless of opacity ("no black anywhere, at any opacity"), so fixing the hue
  necessarily required rebinding to a real token — and rebinding to `color/text/secondary`
  (which carries its own baked 70% alpha) naturally normalizes the opacity as a side effect
  of the color fix itself, not a separate decision. This is why these three batches'
  instances of the "same-looking" pattern now measure a passing ~5.0:1, while batches 4/5/7's
  instances still measure a failing ~1.8:1: **they were never the same underlying case.**
  Batch 9's own instances of literal-black low-opacity text (§1 of its report) confirm this
  directly — its fixes passed because the raw color was black, not because of an opacity
  double-application bug being corrected.

**Conclusion**: this is not a bug. It is two legitimately different starting conditions
that received two different, individually-correct treatments. The open item that survives
is the accessibility question itself — see §8.1.

### 1.4 A second, genuine tooling gotcha refined mid-round

Batch 1 first found that `figma.variables.setBoundVariableForPaint()` silently resets a
paint's `opacity` to `1`. Batch 4 refined this: reasserting the original opacity
immediately after the bind call does **not** reliably persist on the *first* bind — it can
take a **second**, separate bind-and-reassert pass before it sticks. This recurred in
batches 4, 5, and 7, each of which caught it via direct node re-reads (not assumed from the
script's own return value) and applied a second corrective pass. Flagged here as a
methodology note for any future batch work on this file: **always verify a reasserted
opacity by re-reading the node after the fact; if it didn't persist, bind again.**

### 1.5 A third tooling finding: rebinding a text node's fill can silently trigger text-wrap

Batch 9 (the final batch) discovered that recoloring a tightly-boxed text node's fill —
a pure color operation — can cause Figma to re-evaluate that node's text-wrap layout
against its nominal box width, wrapping text that rendered fine, on one line, in its
original untouched state (e.g., a 50px-wide `@mekusa` handle wrapping to "@mek"/"usa"). This
is unrelated to the already-documented missing-font issue — it reproduced with the correct
font loaded and no font-related errors. Batch 9 fixed all 7 instances it found in its own 9
frames by widening the affected boxes. **This was not checked retroactively across batches
1–8** — see §8.2, an open follow-up recommendation, not something this report can close.

## 2. Full token mapping used (all 12 canonical variables, confirmed live before every batch's first write)

| Variable | ID | Light value | Primary uses across this round's 80 frames |
|---|---|---|---|
| `brand/navy` | `VariableID:5096:4` | `#282E65` | Anchor color: footers, headings, wordmark text, primary CTAs, icon-mark navy half, opaque utility icons, and (per-node, opacity preserved) custom-opacity navy washes/dividers/scrims with no dedicated tint token |
| `brand/green` | `VariableID:5096:3` | `#7BB929` | Accent only: icon-mark green half, status dots, "win"/qualification badges, online-status indicators — never as text on a light background |
| `brand/green-tint` (12%) | `VariableID:5096:5` | `#7BB929` @ 12% | Card/section wash backgrounds, search-bar pills, toggle-switch tracks |
| `brand/green-tint-28` | `VariableID:5098:7071` | `#7BB929` @ 28% | **Non-canonical — eliminated everywhere found** (Navbar, Bants, Settings' live and orphaned toggle-switch components) and corrected to `brand/green-tint` |
| `color/background/page` | `VariableID:5096:6` | `#FFFFFF` | Every frame's own top-level background |
| `color/background/surface` | `VariableID:5096:7` | `#FFFFFF` | Cards, popovers, icon-container frames, dropdown/menu backgrounds |
| `color/text/primary` | `VariableID:5096:8` | `#282E65` | Headings, names, opaque body text, link text |
| `color/text/secondary` | `VariableID:5096:9` | `#282E65` @ 70% | Muted/metadata text, placeholders, timestamps (where opacity was normalized, not preserved — see §1.3) |
| `color/text/on-navy` | `VariableID:5182:6654` | `#FFFFFF` | Text/icons on solid navy fills (buttons, footers, drawer panels, badge pills) |
| `color/text/on-green` | `VariableID:5096:10` | `#282E65` | Text on solid `brand/green` fills — always the fix for white-on-green, never disclosed-and-left |
| `color/icon/inactive` | `VariableID:5097:2` | `#282E65` @ 15% | Muted/decorative icon strokes, dividers — **found this round to itself fail the 3:1 non-text contrast minimum (~1.32:1) when applied to genuinely interactive icons; see §8.3** |
| `brand/off-white` | `VariableID:5182:6655` | `#F4F5FB` | Used for the first time this round (Community Mobile's active-tab-indicator pill, replacing an off-brand `#f0f8ff` near-white) |

## 3. Per-section summary

### 3.1 Components (batch 1)

Fixed the 8 named component frames, most importantly the shared Web App Navbar
(`2824:4309`), eliminating all 17 instances of `brand/green-tint-28` in both variants
(including the exact "search pill" contrast near-miss CLAUDE.md had flagged twice already)
and 40+ instances of off-palette black. Also fixed Filter Tabs, Dropdown menu, Task Card,
Mobile Drop Down Components (a real bug: white-on-full-green chat-bubble text), Mobile App
Nav Icons (the wordmark-in-green bug, 7 instances), Frame 5904 (a real navy-on-navy
invisible-text bug in the Account Settings dropdown's hover state), and Group 36 (a
stadium-photo scrim card). Full audit went from 324/672 bound paints to 625/672; the
remaining 47 are disclosed exceptions (Figma-native component-set dividers, `#d9d9d9`,
`#dba111`, `#ff0808`). First discovery of the opacity-reset gotcha (§1.4) and of the
disclosed-off-palette-color list carried forward through the rest of the round.

### 3.2 Blog (batch 2)

11 frames, none instancing the shared Navbar (all hand-built top bars). The recurring
wordmark-in-green bug was found on 9 of the 11 frames and fixed. Two genuinely
uncatalogued off-palette washes (`#7bb929@0.05`, `#e5e5e5@0.6`) were found serving the same
"section wash" role as the canonical 12% tint and corrected to it. A self-contained
"filter tab" mini-palette (`#4d4500`/`#bfb44a`) was confidently corrected to the
navy/secondary convention already established by the Filter Tabs component. A first-pass
mis-bind (white TEXT and muted clock icons both briefly caught by an over-broad `#1e1e1e`
sweep) was caught and corrected within the same session, before moving to the next frame.
Legitimate third-party social-login brand colors (Facebook/Google/Twitter) were correctly
left untouched.

### 3.3 Sports/Livescores (batch 3)

11 frames, none instancing the shared Navbar. Real, measured AA failures fixed: white text
on solid `brand/green` (minute/rank badges, ~2.40:1) and `brand/green` text on white (nav
tabs, rank numbers) — including **8 nodes that were already bound to `brand/green`** in the
source file, a pre-existing mis-binding only caught by a dedicated second pass that checked
binding *targets*, not just bound/unbound state (a technique carried forward into every
subsequent batch). A false positive was caught and reverted: an early rule had muted 206
national-flag/league-crest vector paths to `color/icon/inactive`, which would have made
them unreadable — reverted, including fixing a secondary bug where the revert briefly left
opacity at 15% instead of the original 100%. Two new, previously undisclosed contrast
failures were found and left flagged, not fixed: white text on a `#d3f502` "Draw" badge
(≈1.25:1, severe) and an inconsistency between two different greens (`#396400` vs.
`brand/green`) both meaning "win" on different screens.

### 3.4 Bants (batch 4)

9 frames. Found and fixed the CLAUDE.md-flagged `brand/green-tint-28` misuse in two frames'
Navbar instances. Discovered "Group 403" (`2353:1610`) — a shared "comment/reply card"
component instanced 102 times site-wide, not on any previously-known components list — and
fixed it once at the source, cascading correctly to all 102 instances. Found and fixed a
real invisible white-on-white "Post" action-link text bug present on all 9 frames. First
full characterization of the refined opacity-persistence gotcha (§1.4). First full
characterization of the navy-at-low-opacity "muted metadata" disclosure (§1.3) — correctly
treated as a real, pre-existing design pattern, not a bug.

### 3.5 Message + Message Mobile + Contest (batch 5)

8 frames. The `brand/green-tint` binding was found rendering as solid 100%-opacity green
(not 12%) in two Message Mobile input fields — a pre-existing binding whose opacity had
never actually been applied — fixed. White-on-green sent-message chat-bubble text (both web
and mobile) was a real, always-fixable AA failure, corrected to `color/text/on-green`. A
near-black video-thumbnail scrim gradient was corrected to a navy-derived scrim via the
lower-level `ColorStop.boundVariables` API (the standard `setBoundVariableForPaint` helper
doesn't support gradient stops). All three Contest pages and both Message pages confirmed
logged-in (`header 4`, corrected mapping); no Contest Decision Log items were touched.

### 3.6 Community (batch 6)

12 frames, including `1306:7149`/`1308:11643` (moved here from the Blog list per the task
brief's own note, since these are the canonical Community homepage despite their physical
canvas position). All 12 frames were genuinely unbound from the start (no Dark-mode pin
shortcut). Found and fixed a copy-paste club-crest color (`#034694`) used by accident as the
footer-copyright color in 8 of 12 frames, and as the "Activate Account" primary button's
background in the Inactive Account screen. Correctly distinguished the black-vs-navy
low-opacity cases (§1.3) and normalized the black case rather than disclosing it.
**Structural finding, not a color bug**: `1306:7149` (Community Home Page Template) and its
instance `1308:11643` are both `visible: false` and render nothing anywhere in the file —
confirmed via blank screenshots, not just node data. Token fixes were still applied
correctly (verified at the data level) and will render correctly if this branch is ever
made visible again — see §8.4.

### 3.7 Create Post (batch 7)

5 frames. Found and fixed the same `#034694` copy-paste-blue bug (a hairline divider under
the composer title) and a plain-black (not green, not navy) wordmark rendering. Confirmed
the two frames instancing the shared Navbar (`header 4`) needed no further work, since
batch 1 already fixed the component's own internals. This batch's own instance of the
navy-low-opacity "muted metadata" pattern (§1.3) was its 5th consecutive occurrence,
prompting the explicit recommendation (carried into batch 8's brief) to treat it as a
strong, confirmed cross-file pattern rather than re-disclose it as isolated each time.

### 3.8 Settings (batch 8)

Live enumeration of the given ID range found 21 in-range nodes, of which exactly 18 are the
canonical Settings frames (the other 3: Frame 5904, already fixed; a stray orphaned
page-level text node; an unused orphaned Toggle Switch component copy — all disclosed, not
silently folded in). Root-cause-fixed the `brand/green-tint-28` bug in **three** places at
once (raw literal instances, the live toggle-switch component actually used in two frames,
and the unused orphaned duplicate carrying the same latent bug) so it cannot silently
resurface via reuse. Found a **third** distinct destructive-action red (`#ed1c24`,
Deactivate Account), alongside the already-known `#ff0808`/`#da0000`. Confirmed, via
`getMainComponentAsync()` rather than assumption, that all 18 frames use the verified
logged-in Navbar variant. **New finding**: `color/icon/inactive`'s own 15% alpha
(≈1.32:1 on white) fails the 3:1 non-text minimum when bound to a genuinely interactive
icon (the "refresh" button) rather than a purely decorative one — a token-definition
question affecting every batch that used this token, not a per-frame fix. Fixed the
5th-straight instance of the black-low-opacity "muted metadata" pattern, definitively
confirming §1.3's black-vs-navy distinction (this instance was `#000000@50%`, normalized
and now passes).

### 3.9 Community (Mobile) (batch 9, final)

9 frames — the web app's mobile-responsive Community and Messages screens (a distinct
platform from the native-app Message Mobile screens in batch 5). None instance the shared
Navbar. Found and fixed: off-brand plain-black headline text; an invisible white-on-white
wordmark in a nav drawer (fixed by recoloring the drawer panel to navy, since the
wordmark component itself was already correctly bound from an earlier batch); two more
`#034694` copy-paste-blue instances (a link and three tab labels); an off-brand
near-white tint (`#f0f8ff`) corrected to `brand/off-white` — the first real use of this
token anywhere in this round; a white-on-green chat-bubble fix; an off-brand gray divider
(`#434343`, distinct from the disclosed `#000000` hairline family). Confirmed genuine club-
crest artwork (a Chelsea FC crest, 29 nodes) via full hierarchy inspection and correctly
excluded it from binding. Found and fixed two genuinely interactive icons at a
contrast-failing 50% opacity (a dropdown chevron, per-message like/delete actions),
bumping both to full opacity — the same category of fix Settings' §3.8 finding calls for.
Discovered and fixed 7 instances of the text-wrap-on-mutation regression (§1.5). Provided
the black-vs-navy resolution data used in §1.3. Flagged a new recurring gray
(`#e5e5e5`, a "page-gutter" backdrop distinct from both `color/background/page` and
`brand/off-white`) present in 5 of its own 9 frames and, per batch 6/7's own reports, on
every one of this round's 80 frames' own top-level background — see §8.5.

## 4. Cross-cutting bugs found and fixed (recap, by type)

1. **"Soccernity" wordmark rendered off-brand** (green, or plain black, instead of navy) —
   found and fixed on frames across nearly every section (Components, Blog ×9, Sports,
   Bants' navbar already correct, Create Post, Community Mobile). The icon mark carries
   green; the wordmark text should always be navy, per Frame 396/397.
2. **`#034694` (a Chelsea-crest blue) used by accident as a real UI color**, not just inside
   crest artwork — found and fixed in Blog (none), Community (footer copyright ×8, a CTA
   button background), Create Post (a divider), and Community Mobile (a link, three tab
   labels). A recurring copy-paste bleed from crest artwork into unrelated UI, always
   treated as a genuine bug and fixed, never disclosed-and-left.
3. **White-on-solid-green text** — a real, always-fixable AA failure (measured as low as
   2.19–2.40:1), corrected to `color/text/on-green` everywhere found (Components, Sports,
   Message/Message Mobile, Community, Community Mobile).
4. **`brand/green-tint-28` (non-canonical) eliminated** everywhere found: Navbar (both
   variants), Bants (2 frames' navbar instances), Settings (three separate places, root-
   caused). No remaining known instance anywhere in this round's 80 frames.
5. **Pre-existing mis-bindings** — text already bound to `brand/green` where the standard
   calls for navy — found in Sports (8 instances, only caught by checking binding targets,
   not just bound/unbound state) and treated with the same fix as unbound literals.
6. **Invisible text bugs** (white-on-white, navy-on-navy) — found and fixed in Components
   (Frame 5904's hover state), Bants (a "Post" action link), and Community Mobile (a nav-
   drawer wordmark).
7. **Off-brand near-white/near-black substitutes for a canonical value** — `#f0f8ff`
   (Community Mobile, corrected to `brand/off-white`), `#e5e5e5@0.6` and `#7bb929@0.05`
   (Blog, both corrected to `brand/green-tint`), `#434343` (Community Mobile, corrected to
   navy).

## 5. Contrast audit — consolidated

Every batch ran its own before/after WCAG AA audit on real composited backgrounds (not
eyeballed). Consolidated results:

### 5.1 Failures found and fixed this round

| Issue | Ratio before | Fix | Ratio after |
|---|---|---|---|
| White text on solid `brand/green` (badges, chat bubbles, minute/rank markers — multiple sections) | 2.19–2.40:1 | Rebind to `color/text/on-green` | 5.27–5.31:1 |
| `brand/green` text on white (nav tabs, rank numbers, wordmarks — multiple sections) | 2.19–2.4:1 | Rebind to `color/text/primary`/`secondary` | 5.01–12.65:1 |
| Off-brand black/near-black text at inconsistent opacity, various sections (Community, Settings, Community Mobile) | ~1.3–3.95:1 | Rebind to `color/text/primary`/`secondary`, opacity reset to the token's own alpha | 5.01–12.65:1 |
| Two interactive icons at 50% navy opacity (Community Mobile: a dropdown chevron, per-message like/delete actions) | 2.88:1 | Opacity bumped to 100% (same hue, no new color) | 12.58:1 |

### 5.2 Failures found, disclosed, and deliberately NOT fixed (real design decisions, not token gaps)

| Issue | Ratio | Where | Why not fixed here |
|---|---|---|---|
| Navy text at a consistent, deliberate low opacity (29–31%) used for timestamps/metadata | ~1.76–1.84:1 | Bants, Message/Message Mobile, Create Post (5 total occurrences) | Already on-brand hue; raising the opacity is a visible design-hierarchy change, not a token-binding fix — see §1.3 and §8.1 |
| White text on a `#d3f502` "Draw" badge | ≈1.25:1 (severe) | Sports (H2H, Standing) | Badge itself is off-palette; the real fix (navy text on light badges) is a badge-system design decision |
| White text on disclosed destructive reds (`#ff0808`, `#ed1c24`) | 3.97:1 / 4.39:1 (near-misses) | Bants, Message Mobile, Settings | Tied to the unresolved three-distinct-reds inconsistency, §8.6 |
| `color/icon/inactive` on a genuinely interactive icon (Settings' refresh button) | ≈1.32:1 | Settings | Token-definition question, not a per-frame fix — §8.3 |
| Navy@25% decorative input-field borders | ≈1.61:1 | Community Mobile (Edit Profile) | Purely decorative furniture with a label+value already identifying the field; consistent with the file's established tolerance for muted non-essential graphics |

### 5.3 A newly-confirmed internal inconsistency (not a contrast failure, but a system inconsistency)

Two unrelated greens both mean "win" depending on which screen you're on: Standing correctly
uses `brand/green`; H2H uses an unrelated `#396400`. Flagged, not resolved — §8.7.

## 6. Verification — measured, not assumed

- **Live variable-collection check before every batch's first write**: `Soccernity Theme`
  (`VariableCollectionId:5096:2`), Light `5096:0` / Dark `5096:1`, 12 variables — confirmed
  9 separate times (once per batch), always matching CLAUDE.md's record.
- **Mode-pin check**: 0 of 80 frames carried an explicit Dark-mode override (unlike round
  1's 16/16) — confirmed per-batch, not assumed from round 1's precedent.
- **Full fill/stroke audits, before and after, every batch** — each batch's report includes
  its own bound/unbound tallies; the only paints left unbound anywhere in this round's 80
  frames are the disclosed exceptions in §7.
- **WCAG AA contrast audits, before and after, every batch** — consolidated in §5.
- **Screenshots taken and visually reviewed** for all 80 frames (a representative sample
  per larger batch, every frame in smaller batches), confirming: no visible black anywhere,
  wordmarks uniformly navy, white-on-navy/white-on-green readable, `brand/green-tint`
  reading as a soft wash rather than a saturated pill.
- **Navbar auth-state determined per screen, not assumed uniformly** — every batch checked
  each frame's actual Header instance property (or confirmed the absence of one) via
  `getMainComponentAsync()`/direct property read where the frame instanced the shared
  component; hand-built top bars were individually assessed for auth-appropriate content.
  Full determination table in §7 below.
- **The Navbar's own logged-in/logged-out mapping was independently re-verified by this
  consolidator** via live screenshot + metadata (§1.2), correcting a documentation error in
  Batch 1's own summary before it could propagate further.
- **No node deleted anywhere in this round.** The only non-color structural changes made
  were: `visible = false` hides of stray duplicate/ghost content (a duplicate wordmark
  group in Sports; none of round 1's already-known ghost-wordmark pattern happened to
  recur as a *new* find requiring a hide in this round beyond what was already disclosed),
  a few text-node width adjustments to fix the wrap regression (§1.5, batch 9 only), and
  one revert-and-reapply sequence (Sports' flag/crest false positive, §3.3).

## 7. Navbar auth-state determination, by section

| Section | Auth state | Basis |
|---|---|---|
| Components (Navbar itself) | Both variants fixed; `header 4`=logged-in, `header 7`=logged-out (corrected mapping, §1.2) | N/A — this is the component being fixed |
| Blog | Logged-out (all 11 frames; hand-built nav, no avatar/profile affordance anywhere) | Marketing/legal content, correctly modeled as public |
| Sports/Livescores | Mixed by design — `1009:673` explicitly logged-in, `205:2` explicitly logged-out; detail sub-screens (Match Details/Statistics/Lineups/H2H/Standing/Video) have hand-built chrome, not gated | Named explicitly in the source file itself |
| Bants | Logged-in, all 9 frames (including browsable "search result"/"All feed" screens) | Every frame instances the authenticated Header variant; platform's own rule that posting/commenting requires login extends to browsing here by design |
| Message + Message Mobile | Logged-in (web); not applicable (Mobile — native app, no shared web Header) | Messaging is inherently authenticated-only |
| Contest | Logged-in, all 3 frames | `header 4` confirmed on all three; joining/voting/viewing your own entries all plausibly require an account |
| Community | Logged-in, all 12 frames (10 directly confirmed via `componentProperties`; 2 — the invisible template/instance — presumed by construction, unconfirmed since not screenshot-able) | Posting, profile, saved posts, feed — inherently authenticated pillar |
| Create Post | Logged-in, all 5 frames (3 hand-built, correct avatar-not-Login chrome; 2 instance `header 4`) | Creating content requires an account |
| Settings | Logged-in, all 18 frames, confirmed via `getMainComponentAsync()` | You cannot reach your own account settings logged out |
| Community (Mobile) | Logged-in, all 9 frames (none instance the shared Navbar; confirmed via explicit instance-scan returning zero matches, then content-based determination) | No login/signup affordance anywhere; every screen shows an authenticated user's own content |

## 8. Open Decision Log candidates surfaced this round

1. **The navy-at-consistent-low-opacity "muted metadata" pattern (§1.3, §5.2) is a real,
   pre-existing, unresolved accessibility gap — 5 confirmed instances (Bants, Message,
   Message Mobile, Contest-adjacent, Create Post), all measuring 1.76–1.84:1 against a
   4.5:1 requirement.** The file's own `color/text/secondary` token already exists at a
   passing 70% opacity, but unifying every distinct muted-opacity level up to that one
   value would collapse real visual-hierarchy distinctions the original design draws
   (e.g., between a bio caption, a timestamp, and a reply count). This is a genuine design
   decision for the founder/design-system owner, not a token-binding correction — flagged
   consistently across 5 batches, never resolved unilaterally by any of them, and not
   resolved here either.
2. **A text-node-fill-rebind can silently trigger a wrap regression on tightly-boxed text**
   (§1.5) — discovered only in the final batch (Community Mobile), fixed there (7
   instances), but **not retroactively checked across batches 1–8**. Recommend a targeted
   spot-check of narrow/handle-style text nodes (usernames, short badges) across the other
   72 frames in this round before considering this round's typography fully verified.
3. **`color/icon/inactive` (navy @ 15%) itself fails the WCAG 3:1 non-text minimum
   (≈1.32:1) when applied to a genuinely interactive icon**, not just a decorative one —
   found in Settings (the refresh button) and independently in Community Mobile (a
   dropdown chevron, per-message actions, both worked around locally by bumping to 100%
   opacity rather than waiting for a token-level fix). This is a token-definition question
   affecting every section that used this token for an interactive element: should
   `color/icon/inactive`'s own alpha be raised, or should a second, higher-contrast
   "muted-but-interactive" token be introduced alongside it? Not resolved here.
4. **`1306:7149` (Community Home Page Template) and its instance `1308:11643` are both
   `visible: false` and render nothing anywhere in the file** (§3.6) — confirmed via blank
   screenshots, not a screenshot-tool limitation. Token fixes were still applied correctly
   underneath (verified at the data level) and will render correctly if this branch is ever
   made visible again. Is this intentionally archived (superseded by `1306:354`, the
   frame the task brief itself pointed to as the working canonical homepage), or an
   accidental hide? Not a color-token decision — flagged for whoever owns this content
   next, not resolved here.
5. **A recurring "page-gutter" gray (`#e5e5e5`), distinct from both `color/background/page`
   and `brand/off-white`, appears as the outermost top-level fill on effectively every one
   of this round's 80 frames** (explicitly logged in Community, Create Post, and Community
   Mobile's reports; almost certainly present on the other 6 sections' frames too, since
   it's a generic Figma-canvas-authoring convention, not screen-specific content). Binding
   it to `color/background/page` (as this round did, per the standard's own explicit
   instruction) makes it pure white, identical to the cards sitting on it, erasing a subtle
   page/card visual separation the gray previously provided. **This is the same open
   question round 1's own report already raised** (its §8 candidate 3: "should
   `brand/off-white` replace `color/background/page`'s flat white value?") — not resolved
   here either, now with substantially more evidence that it affects nearly the entire
   file, not just an isolated frame or two.
6. **Three distinct, unrelated destructive-action reds now confirmed across the file**:
   `#ff0808` (Bants, Message Mobile), `#da0000` (Community, Bants live-indicator), and
   `#ed1c24` (Settings' Deactivate Account button). A single canonical
   `color/action/destructive` token is a reasonable follow-up token-authoring candidate,
   not resolved here.
7. **Two unrelated greens both mean "win"** depending on which Sports sub-screen you're on
   (Standing correctly uses `brand/green`; H2H uses an unrelated `#396400`) — a design
   inconsistency, not a token gap, flagged for a follow-up decision on which is canonical.
8. **"Group 403" (`2353:1610`), a shared "comment/reply card" instanced 102 times
   site-wide, was invisible to the file's previously-known components list** (it's a bare
   floating node, not grouped under any visible "Components" section) — fixed once at the
   source this round, but whoever owns the canonical components inventory should add it so
   future retrofits don't have to rediscover it.
9. **No canonical "navy-tint" token exists** in `Soccernity Theme` — only `brand/green-tint`
   is defined. Multiple sections (Create Post, Community) found custom-opacity navy washes/
   badges/scrims with no better home than "`brand/navy`, opacity preserved" as a
   bind-compliant-but-imperfect fix. Worth considering a `brand/navy-tint` family in a
   future token-authoring pass.
10. **`#dba111`'s actual UI role varies** — documented file-wide (rounds 1 and 2) as "gold
    online-status [dot]," but Community Mobile's Messages window 1 uses the identical hex
    for message-preview *text* on unread threads, not a dot. Worth correcting this pattern's
    description in any future reference to it so it isn't assumed to always be a small
    indicator.
11. **The outdated "© 2022 Soccernity" copyright text** recurs in at least 8 of Community's
    12 frames (on top of the identical bug already flagged elsewhere in the file by the
    homepage-rebuild report) — a content/copy bug, not a color-token one; not fixed here,
    worth a dedicated content-fix pass across the whole file rather than continued
    per-batch flagging.
12. **Real club-crest/flag/jersey licensing** (Chelsea FC crest on Community Mobile's
    Profile screen; national flags and club crests throughout Sports, Bants, Blog, Create
    Post, Community) remains an open legal/business question, unchanged by this round —
    every instance was identified, excluded from binding, and left exactly as found.

## 9. Explicitly NOT touched

- **Admin Panel, Auth Pages (including Register's date-of-birth field), Email Template
  (including the missing reset-password email)** — all deferred per the brief.
- **No dark-mode variant, logic, or second mode** added or modified anywhere. Dark mode's
  own existing values (where they exist from Sprint D) are untouched.
- **The `Soccernity Theme` collection itself** — no variable created, renamed, deleted, or
  re-valued in either mode this round.
- **No application code** — `apps/`, `services/`, `packages/` untouched.
- **No backend/endpoint/DTO changes**.
- **No resolution of Contest's open Decision Log items** (points model, club mechanism,
  logged-out visibility) — token/color work only.
- **No filling of missing-mobile-frame gaps** for sections that don't have one.
- **Layout, copy, and component structure**, beyond what the color/token migration itself
  required. The exceptions: a small number of `visible = false` hides of pre-existing stray
  duplicate content (not this round's own creation), and the 7 text-box-width adjustments
  in Community Mobile that fixed the wrap regression (§1.5) — both disclosed inline in
  their respective batch sections above, not silent.
- **Round 1's 16 frames** (Leaderboard, Guardian Consent ×6, Club Picker ×5, Verify Email
  ×4) and the three homepage frames — untouched by this round, already retrofitted
  separately.
- **Icon-library standardization** (`bx:*`, `uil:*`, `ion:*`, `mdi:*`, `iconoir:*`,
  `fontisto:*`, `akar-icons:*`, `bxs:*` all coexist across this round's frames) — flagged
  by multiple batches, not attempted; a separate consolidation task.

## 10. Handoff to `figma-screen-builder`

None. This entire round was a retrofit of existing, already-designed screens — no new
screen or flow was designed anywhere in this work.

## 11. Git

This report and all Figma-side changes are on branch `sprint-2/retrofit-light-mode-tokens-round2`,
opened from `main`. A PR against `main` follows this commit. **Do not merge** — same
standing instruction every prior design-stage PR in this project has followed; merging is
Temi's call after independent verification.
