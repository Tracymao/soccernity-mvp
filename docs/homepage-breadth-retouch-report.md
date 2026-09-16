# Homepage breadth retouch — report

**Branch:** `figma/homepage-hero-copy-pillar3-refresh`
**Frame:** `Home Page Desktop — Premium Light (Sprint 2, Pass 2)` (`5204:6728`), the canonical logged-out homepage per Decision Log #46/#152. Figma design only — no app/backend code touched. Copy-and-hero-visual retouch of an already-built screen, no new screens.

## Why

`HomePage.tsx`'s pillar 3 and closing section both described player-level appearance-history logging as a real feature — it isn't. No such concept exists anywhere in the schema; fixtures/results are team-level, logged only by a `GrassrootsTeam`'s own organiser (`services/api/src/modules/grassroots`). The closing "Browse grassroots teams" CTA was dead for a logged-out visitor (`GET /teams` requires `JwtAuthGuard`). And the page represented grassroots + community but gave Sports Hub — real, live, shipped in Sprint 4 — no visual presence at all, including in the single most prominent visual on the page: the hero fixture card, which showed one illustrative grassroots-only match.

## What changed

### Copy (four nodes)
| Node | Before | After |
|---|---|---|
| Hero eyebrow (`5205:6810`) | "BUILT FOR GRASSROOTS FOOTBALL" | "WHERE THE WHOLE GAME LIVES" |
| Hero lede/subhead (`5205:6812`) | "Soccernity gives unaffiliated players, their teams and the communities around them a real football identity — fixtures, results and a history that actually travels with you." | "Live scores and stories from the football you watch, and a real home for the teams and communities playing it every weekend." |
| Pillar 3 title (`5209:6823`) | "A record that travels with you" | "The professional game, live." |
| Pillar 3 body (`5209:6824`) | "Log fixtures and results yourself and keep an appearance history that stays yours. Verified profiles and discovery tools arrive in a later phase." | "Scores, fixtures, standings and highlights from the leagues you already follow, in the same place as the football you actually play." |
| Closing sub (`5213:6809`) | "Free to join. Create your profile, add your team, and log your first fixture in a few minutes." | "Free to join. Create your profile, follow the football you love, and register your team when you're ready to make it official." |

Hero headline ("Every match you play deserves a record."), closing eyebrow ("GET STARTED"), closing headline, and the hero secondary CTA ("Explore fixtures") were **not** in the ticket's scope table and were left untouched — pillars 1/2 stay conceptually as-is, per the brief.

Both edited chip/button containers (`Eyebrow Chip` `5205:6808`, the closing secondary CTA `5213:6813`) are `HUG`-sized auto-layout, so they re-sized themselves automatically when the new copy changed their measured width — no manual container-width math was needed, confirmed via screenshot.

### The dead CTA — resolved, not silently picked
Two options were on the table: make `GET /teams` public, or repoint the CTA at `/signup`. The ticket's own resolution is the second. Relabelled `5213:6814` "Browse grassroots teams" → **"Register your team"** — the old label implied public browsing (which the endpoint doesn't allow), the new label matches the closing sub's own new "register your team when you're ready to make it official" line and reads correctly once it routes to `/signup` (registering a team requires an account first, so `/signup` is a coherent destination for it, not a placeholder). The frame itself is renamed in Figma to record the routing decision (`CTA — Register your team (secondary — routes to /signup, per founder resolution on the dead 'browse teams' link)`) so `figma-to-code` doesn't have to re-derive it. No backend change proposed or made — `GET /teams` stays `JwtAuthGuard`-only, unchanged.

### Hero fixture card — redesigned to show real breadth
The single grassroots-only illustrative match (`Card — Live Fixture (grassroots)`, `5206:6805`) is now a **two-section split card**, renamed `Card — Live Across Soccernity (Sports Hub + Grassroots)`:

- **Sports Hub section** (top, original nodes, edited in place): `SPORTS HUB` tag pill + "Premier League · Live" meta, scoreline **Chelsea 3 – Liverpool 1** — reusing this file's own canonical illustrative Sports Hub fixture (Chelsea/Liverpool, per Decision Log #321's "one internally consistent illustrative fixture" convention already established across the Sprint 4 Sports Hub redesign) rather than inventing a new one.
- **Grassroots section** (new, cloned block): `GRASSROOTS` tag pill + the **original, unchanged** "Lagos Sunday League · Matchday 12" meta and **Ikoyi Rovers FC 2 – Surulere United 1** scoreline — the pre-existing content, just relocated and relabelled, not rewritten.
- **Caption line** (bottom, the old venue-meta node repurposed): "Plus Bants, Blog stories and the community around every match." — a nod at the third pillar (community) without a third full match row, given the card's own space budget.

Build method: the card container (`5206:6805`) is genuine `VERTICAL` auto-layout (`primaryAxisSizingMode: AUTO`, `itemSpacing: 18`, `26px` padding) — the Grassroots section's meta-row + scoreline + hairline were cloned from the *original* nodes **before** editing the originals, so the clone inherited "Ikoyi Rovers FC / Surulere United" verbatim with zero re-typing, and the card auto-hugged its own height (236 → 420) with no manual position math. The Sports Hub category pill and Grassroots category pill both repurpose the existing `LIVE` pill component (resized to fit the longer label; the live/status word moved into the adjacent meta text — "· Live" — instead of a separate pill) rather than inventing a new tag style.

The hero section itself (`5205:6804`) is `HORIZONTAL` auto-layout with `counterAxisAlignItems: CENTER` and `counterAxisSizingMode: AUTO` — it re-centred and grew to fit the taller card automatically (556 → 604), and the whole homepage frame (`5204:6728`, itself `VERTICAL` auto-layout) reflowed everything below it down by the same delta with zero manual edits and zero overlap. Confirmed via a full-page screenshot and a programmatic overlap check against every other top-level page node (0 overlaps).

### Not touched, per scope
Today's Fixtures strip, Talent Clips, Trending Stories, the footer, and every route below the hero/pillars/closing sections — unchanged, confirmed via screenshot. `HomePage.tsx`'s own header comment (static/illustrative content, no fixtures/news data source per Decision Log #6) is unaffected by this pass; Sports Hub having a real backend now (Decision Log #6/#254) doesn't change that *this specific homepage frame* stays static/illustrative — that's the same standing rule, not revisited here, since the ticket didn't ask to reopen it.

## Verification

- Every node ID for every touched element recorded above.
- Paint-binding audit across all four touched subtrees (hero, pillar 3 card, closing CTA, new annotation note): **57/57 solid paints bound, 0 unbound, 0 off-palette, 0 new colours** — every edit either mutated text on an already-bound node or cloned an already-bound node; no new fill was authored from scratch.
- Frame-overlap check: homepage frame's new bounds (grew 5298 → 5518 total height, driven by the hero card + the new annotation note) checked against every other top-level node on page `0:1` — **0 overlaps**.
- Light mode only — no dark-mode value touched, matching the frame's own existing "Light mode only, by instruction" annotation note.
- No mobile counterpart exists for this specific Pass-2 canonical desktop frame and none was requested — out of scope, not built here.
- A new annotation note was appended to the frame's own `Annotation Zone` documenting this pass (auto-layout zone, auto-grew 1277 → 1479 to fit it — no manual reposition needed for the 11 existing notes).
- Screenshots taken and visually reviewed after each structural step (hero, closing CTA, hero card v1 and v2, pillar row, full page, new note) — no clipped text, no overlapping elements, no off-palette colour.

## Not built / explicitly out of scope

- No backend change — `GET /teams` stays `JwtAuthGuard`-only; the CTA is relabelled and conceptually repointed at `/signup` in Figma/documentation only. Wiring the actual route change is a `figma-to-code` follow-up against the existing `HomePage.tsx`.
- Fixtures/Trending/Talent Clips content stays illustrative — Decision Log #6's original "no fixtures/news endpoint referenced by the homepage" reasoning is unchanged; Sports Hub's own real backend (Decision Log #254) is not wired into this static marketing page.
