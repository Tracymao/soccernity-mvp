# Sprint 2 — Home Page Hero Rework

Figma-only visual fix in file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`),
page "Soccernity" (`0:1`), frame "Home Page Desktop" (`2631:3951`), by the
`figma-design-system` agent, branch `sprint-2/homepage-hero-rework`.
No application code was touched — this is additive/corrective Figma work
only, scoped strictly to the hero section per the task brief.

## 1. What was wrong (recap)

Two competing hero background frames occupied the same position
(`2631:3969`, hidden, containing a working play button and divider;
`2654:14944`/`2654:14946`, visible, bare rectangles with neither). The
real headline/CTA/illustration content ("feel passion", inside
`2632:6117` "Frame 5849") lived in a separate frame stacked *below* the
hero (`y=956–1541`) instead of overlaying it. A stray, huge, off-canvas
"player 1" rectangle (`2631:4043`) sat unused at `x≈2241, y≈2767`.

## 2. What was rebuilt / merged / deleted

**Geometry check before touching anything**: the hidden frame `2631:3969`
and the visible frame `2654:14944` share *identical* bounds
(`x=95, y=116, w=1294, h=562`) — strong evidence they're the same
conceptual hero box, just mid-replacement. The play button (`Frame 5843`,
`2631:6027`) and divider (`Rectangle 324`, `2631:6019`) inside the hidden
frame were horizontally centered on that exact 1294px box (divider:
128px/129px margins; play button: dead center), and the "feel passion"
content frame's height (472px) matched the box almost exactly against the
divider's original relative offset (470px) — this is how the overlay
composition below was reconstructed, not invented from scratch.

- **Play button + divider merged into the visible hero.** Both nodes were
  moved (not cloned — the originals were reparented, so no duplicate
  content was created) out of the hidden frame and into a new overlay
  container, positioned at local `(577, 505)` and `(128, 470)`
  respectively — the same relative position they held in the hidden
  design, expressed against the shared `(95, 116)` hero-box origin.
- **"Frame 5849" repurposed as the hero overlay**, renamed
  `hero content overlay`, resized from `1439×585` to `1294×562`, and
  moved from `(1, 956)` to `(95, 116)` — i.e. from "stacked block below
  the hero" to "same footprint as the hero box, overlaid on it." Its
  existing children — `feel passion` (`2631:3998`: headline, Login/Sign
  Up CTA, `twoBallers` illustration group) — were repositioned to local
  `(2, 0)` inside the resized frame; content itself (text, buttons,
  illustration) was not altered.
- **Z-order fixed.** The overlay frame was moved above the photo
  background (`Frame 5851`, `2654:14946`) in paint order — it was
  originally *behind* it, which would have hidden the merged content
  entirely — while the `Header` instance (`2841:4506`) was re-appended
  last so the nav bar stays topmost.
- **Hidden frame `2631:3969` deleted** once its content (play button,
  divider) was confirmed moved out and the merge was verified via
  screenshot (see §4). Confirmed empty before deletion — its only
  remaining child was the now-unused background wrapper `Frame 5852`.
- **Stray debris `2631:4043` deleted** — the off-canvas ~2401×2365
  rounded-rectangle "player 1" at `x≈2241, y≈2767`. This is a distinct
  node from the real "player 1" artwork inside the `twoBallers` group
  (`2631:4009`) — confirmed by ID before deleting, per the brief's
  explicit warning not to confuse the two.
- **Downstream sections shifted up 585px to close the gap.** Moving
  "feel passion" out of its old `y=956–1541` slot left a 585px blank gap
  before "Today's fixture." Rather than leave a visibly broken hole,
  every section from the fixture bar downward was shifted up by exactly
  585px — **position only, zero change to internal content, size, or
  layout of any section**: `Frame 5850`/fixture `1541→956`, `about us`
  `1742→1157`, `talent` `2230→1645`, `trending` `2662→2077`, `footer`
  `3857→3272`. The overall `Home Page Desktop` frame was resized from
  `4186` to `3601` tall to remove the resulting trailing blank canvas.
  **Flagged explicitly**: this is a small step beyond "hero section
  only," but it's a mechanical, position-only consequence of the merge,
  not a redesign of those sections — done to avoid shipping an obviously
  broken 585px blank gap. If this is unwanted, it's a one-line revert
  (shift those five frames back down 585px and grow the page frame back
  to 4186).

Node IDs touched, for reference: `2632:6117` (renamed/resized/repositioned,
now "hero content overlay"), `2631:3998`, `2631:6019`, `2631:6027`
(reparented + repositioned), `2654:14946`/`2841:4506` (z-order only),
`2631:3969` (deleted), `2631:4043` (deleted), `2632:6118`/`2632:6114`/
`2632:6113`/`2631:4044`/`2631:4012` (Y-position only).

## 3. Verified visually, before and after

- Before: full-frame screenshot showed the bare grass-photo hero with no
  play button/divider, and "Feel The Passion" as a separate white block
  underneath.
- The hidden frame (`2631:3969`) was temporarily unhidden inside a
  `use_figma` script (screenshot API doesn't render hidden nodes) to
  confirm its play button/divider structure before merging — not just
  inferred from metadata.
- After: full-frame screenshot confirms the headline, Login/Sign Up CTA,
  and both player illustrations now render directly over the grass photo,
  followed by the divider and play button (circular, with left/right
  arrows), with no gap before "Today's fixture." A tight crop of the
  overlay frame independently confirmed both buttons ("Login" and
  "Sign up") render correctly — the initial merge briefly shifted child
  positions via Figma's constraint-based resize behavior, caught and
  fixed by re-setting positions (and normalizing constraints to
  top-left) after the resize completed, rather than before.

## 4. Issue 3 — artwork placeholder check (explicit, not left ambiguous)

**Real artwork is present, not placeholders.** Direct inspection of
`player 1` (`2631:4009`), `player 3` (`2631:4011`), and `ball 2
soccernity` (`2631:4010`) inside the `twoBallers` group confirms all
three carry genuine `IMAGE`-type fills with valid, non-empty
`imageHash` values (not a flat/placeholder `SOLID` fill) — this was
checked programmatically via the Plugin API, not assumed from the visual
alone. The rendered screenshot independently confirms two fully-realized
illustrated football players (navy #8 kit; green kit) and a soccer ball,
consistent with finished artwork. **No substitution or fabrication was
needed or made.**

## 5. Explicitly open items — not decided here

1. **Footer LinkedIn icon (`2869:17884`, inside `sm` / `2632:14943`) is
   currently `hidden=true`.** This predates this session, sits outside
   the hero scope, and per the brief this is a separate, undecided
   question — **not touched, not decided, flagged only.**
2. **Real club-crest licensing on the Match Details screen** — out of
   scope for this task entirely (not part of the home page), and
   explicitly not a design-token problem; flagged for the founder/legal
   as the brief instructs, not addressed here.

## 6. CLAUDE.md "Where things stand right now" — deliberately not updated

This is a narrow, Figma-only visual bug fix on the home page hero. It
doesn't resolve or newly discover anything that section already
describes or should describe (no Decision Log item, no Sprint status
line, no cross-agent dependency changes as a result of this work) — the
home page itself isn't mentioned anywhere in that section today. Per
CLAUDE.md's own instruction, an update is only required when a PR's own
work resolves/implements/discovers something that section describes.
Judgment call: not updating it here, stated explicitly rather than
silently skipped. The one open item worth a human's attention (§5.1, the
LinkedIn icon) is a pre-existing, unrelated question, not something this
PR resolves.

## 7. Sections confirmed untouched (content-wise)

Fixture, about-us, talent, and trending sections were **not** redesigned
or content-edited — verified by reading each one's node tree before and
after this session, confirming zero changes to any child node beyond the
parent frame's own Y position (§2, done only to close the gap left by the
hero merge). Their internal structure, text, images, and spacing are
pixel-for-pixel identical to before this session.
