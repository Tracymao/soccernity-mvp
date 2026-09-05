# Sprint 2 — Legacy Footer Template Replacement (Decision Log #210)

**Branch:** `sprint-2/legacy-footer-template-replacement`
**Agent:** `figma-design-system`
**Scope:** Figma design only, scoped edit pass on existing frames — no new screens, no app/backend code.

## Summary

A second, previously-undiscovered legacy footer template — internally named `Group 47` (desktop) / `Group 55` (mobile), never wrapped in a node literally named "Footer" — was found live on Blog, Blog Article Detail, all 3 Legal pages, and Sports Hub desktop (22 frames). It was missed by every earlier "Footer"-named sweep (Decision Log #174, #204, #209) precisely because of that naming gap. All 22 instances have been replaced with clones of the canonical footer (Decision Log #46).

## Confirmed defects (live, not assumed)

- **No hairline divider** anywhere in either template variant.
- **Desktop: 0 of 6 social icons present.** The Social Bar section is entirely missing.
- **Mobile: only 3 of 6 icons present** (Facebook, Instagram, Twitter — TikTok, YouTube, LinkedIn missing).
- **Every single instance, desktop and mobile, has a duplicated "Terms of Service" label** in the Legal Links row, at the 4th slot position (between "Privacy Settings" and "Contact Us"). Investigated rather than assumed: the sibling legacy template already documented in Decision Log #209 ("Footer — Soccernity Global") uses the exact same 5-slot order — Terms of Service, Privacy Policy, Privacy Settings, **Cookie Policy**, Contact Us — with Cookie Policy sitting in that identical 4th position. This is strong circumstantial evidence the duplicate "Terms of Service" was originally "Cookie Policy" before a copy-paste error (likely: the ToS text node was cloned to create the 5th slot, and its content was never changed). This is disclosed as a probable explanation, not a certainty — no version history was available to confirm it — and is moot regardless, since the canonical 4-link footer that replaces this template doesn't have a 5th slot at all.
- **Desktop wordmark is bare "Soccernity." text with no paired Logo Mark icon** on 10 of the 12 desktop instances (Blog, Blog Article Detail, Contact Us, Terms of Service, Privacy Policy — all Logged In/Out pairs).

## The Sports Page "Group 103" question — investigated, NOT a recurrence of Decision Log #194

On Sports Page desktop specifically, the old footer's wordmark was a symbol instance named `Group 103` (component `437:3011`), which the task brief flagged as needing a check against Decision Log #194 (which found a different `Group 103` on Articles Page was NOT the correct logo lockup — `Group 102` was correct there).

Checked directly: `437:3011` contains a `Group` (the logo mark) + a `Soccernity` text node — a genuinely correct, properly-paired logo+wordmark lockup, confirmed visually via screenshot before replacement. This is a **different, coincidentally-same-named node** from the one #194 flagged — not the same bug recurring. No further action was needed on this specific finding beyond the standard footer replacement.

## The Article Detail Mobile dangling-wordmark risk — found and handled

On the two Blog — Article Detail Mobile frames (Logged In `6000:11346`, Logged Out `6000:11377`), the old footer's wordmark was **not** embedded inside the `Group 55` footer group like every other instance — it was a separate sibling instance of the same `437:3011` component, sitting at `y=5700` (inside the old footer's visual bounds but structurally outside `Group 55`). Left alone, this would have become an orphaned floating "Soccernity" wordmark rendering on top of the new canonical footer after `Group 55` was replaced.

Identified via full metadata inspection (not assumed) and deleted alongside the old footer group in both cases — node IDs `6000:11345` (Logged In) and `6000:11636` (Logged Out). Confirmed via screenshot: no dangling wordmark, no overlap on either frame after the swap.

## Method — a disclosed, evidence-based deviation from the brief's suggested reparent-into-fresh-shell approach

The task brief suggested the reparent-into-fresh-shell method used in prior sessions (Articles, Legal pages) for changing frame dimensions without triggering the known `frame.resize()`-on-GROUPs drift bug. Before committing to that heavier approach, the actual structural situation was checked live:

- All 22 parent frames use `layoutMode: "NONE"` (absolute layout, not auto-layout) — unlike Decision Log #209's targets, which were all `VERTICAL` auto-layout and resized automatically with zero risk.
- The previously-documented drift bug (`frame.resize()` on a `layoutMode: NONE` frame applying each leaf's own constraints, with `GROUP`s having none of their own) was specifically reproduced on **width**-axis resizes in the Blog/Articles/Legal-pages sessions.
- Since this task only needed a **height**-axis change (footer height differs from canonical; width stays 1440/390 throughout), a direct empirical test was run before touching any of the 22 real targets: on a representative frame (`Contact Us Desktop — Logged In`), and then again on the largest/most complex frame (`Blog Page Desktop — Logged In`, 556 total descendant nodes), the frame was resized taller by +100px, every single descendant node's `x`/`y`/`width`/`height` was deep-snapshotted before and after, and then reverted. **Result: zero drift in every one of 556 nodes checked**, including nested GROUP leaves — every relevant node in this file already carries `vertical: "MIN"` constraints, so a height-only resize (holding width constant) doesn't trigger the failure mode the width-axis bug depends on.

Based on this direct evidence, the simpler approach was used instead: clone the canonical footer, insert it at the old footer's exact index and position (`x=0`, same `y`), remove the old footer, then resize the parent frame's height by the exact per-frame delta (`new_footer_height − old_footer_height`) rather than a hardcoded assumption. This correctly handled the two Article Detail Mobile frames, whose old footer was **not** flush against the frame's bottom edge (139px of trailing content/whitespace existed below it) — a delta-based resize preserves that trailing space exactly, rather than assuming the footer was always the bottom-most content.

Desktop frames shrank by ~15px (canonical 314.002 vs. old 329). Mobile frames grew by ~167px (canonical 418.002 vs. old 251).

## Verification

- **Paint bindings**: every new footer's variable set (`brand/green`, `color/text/on-navy`, `color/icon/inactive`, `brand/navy`) matches the canonical footer's own bindings exactly.
- **Screenshots, before/after by family**: Blog Page Desktop, Blog Article Detail Desktop, Contact Us Desktop, Terms of Service Desktop, Privacy Policy Desktop, Sports Page Desktop, Blog Page Mobile, Contact Us Mobile, Terms of Service Mobile, Privacy Policy Mobile, and both Article Detail Mobile frames (full-frame + footer close-up, specifically re-checked for the dangling-wordmark risk) — all clean, no overlap, no visual regression.
- **File-wide sweep**: searched page `0:1` for any `GROUP` named `"Group 47"` or `"Group 55"` carrying the broken template's tell-tale duplicate-"Terms of Service" marker. Found 10 matches — **all confirmed to sit inside already-archived, hidden top-level frames** (the pre-navbar-retrofit originals from the Blog/Articles/Contact Us/Terms of Service/Privacy Policy split sessions) — zero live instances remain anywhere.
- **Node IDs of all 22 new footers**: `6158:111`, `6158:246`, `6158:392`, `6158:527`, `6158:673`, `6158:808`, `6158:954`, `6158:1089`, `6158:1235`, `6158:1370`, `6158:1505`, `6158:1671`, `6158:1748`, `6158:1815`, `6158:1891`, `6158:1958`, `6158:2034`, `6158:2101`, `6158:2177`, `6158:2244`, `6158:2320`, `6158:2387`.

## Not touched

- The canonical footers themselves (`5213:6816`, `5543:7662`).
- Any archived/hidden frame (10 remaining "Group 47"/"Group 55" instances inside archived originals — left as-is, matching this project's established archived-content precedent).
- Sports Hub mobile — already replaced with the canonical footer in the prior `sprint-2/footer-standardization` PR (Decision Log #209), correctly excluded from this task's scope.

## Decision Log

New entry **#210** added to Build Plan Section 9, explicitly noting this is a distinct, previously-undiscovered defect and not a duplicate of #204/#209.

Not merged — founder's call after review.
