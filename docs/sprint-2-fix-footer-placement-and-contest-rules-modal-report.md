# Sprint 2 — footer placement fixes + Contest Rules modal wiring

**Branch:** `sprint-2/fix-footer-placement-and-contest-rules-modal`
**Agent:** figma-to-code · **Date:** 2026-09-06
**Scope:** `apps/web` only. No `services/api` code touched.
**Depends on:** `sprint-2/leaderboard-footer-removal-and-contest-rules-modal` (PR #187, merged
— Decision Log #227).

---

## Part 1 — three site-footer route-placement fixes

`apps/web` renders the shared `<Footer />` via `FooterLayout`, a pathless layout route nested
under `AppShell` (Decision Log #213). Three routes were in the wrong place.

### 1. `/contest` was rendering a footer it should not

`ContestPage`'s canonical Figma frame (`2155:1062`) has no footer — confirmed live during the
`sprint-2/leaderboard-footer-removal-and-contest-rules-modal` audit — and `FooterLayout.tsx`'s
own header comment already documented that "Community / Clubs / ClubFanPage / Banter have no
footer". `contest` was nonetheless a `FooterLayout` child. **Moved to a direct `AppShell`
child**, alongside `community` / `banter` / `clubs`.

### 2. `/leaderboard` should also no longer render a footer

Founder decision (Decision Log #227) — the Leaderboard must not carry the site footer, and the
footer was removed from all 20 Leaderboard-family Figma frames. **Moved to a direct `AppShell`
child**, same as `contest`.

`LeaderboardPage.tsx` was checked for leftover footer-adjacent layout assumptions: none.
`.lb-page` is a flex column with `gap: 24px` and `margin: 0 auto` — no bottom margin/padding
tied to a footer being present. The `.lb-contest__footer` CSS class and a `/* footer bits */`
comment in `LeaderboardPage.css` are pre-existing names for **internal** page elements (the
"View this week's contest ›" link, the pagination/disclaimer lines), not the site footer —
left untouched to keep the diff minimal.

### 3. 404 (`NotFoundPage`) should get a footer

Founder decision — standard error-page recovery pattern (a footer full of navigation on the
page a lost user lands on). **Moved `{ path: "*", element: <NotFoundPage /> }` from a direct
`AppShell` child to a `FooterLayout` child.**

React Router ranks routes by specificity across the whole config regardless of nesting depth,
so moving the splat into a nested layout does not change what it matches — every concrete
route above and below still wins its own path. Verified (see tests below): a genuinely
unmatched path still 404s, and every other route still resolves.

### `FooterLayout` page set, corrected

`FooterLayout.tsx`'s header comment was rewritten from `Home, Sports Hub, Leaderboard, Blog,
Article Detail` to the now-true list:

> **Home, Sports Hub, Blog, Article Detail, 404.**

Items 1 and 2 land in this same PR, so there is no intermediate commit where the comment is
only half-corrected.

### `routes` export

`src/app/router.tsx` now exports `routes: RouteObject[]` separately from `router` (which is
`createBrowserRouter(routes)`), so a test can mount the real route tree via
`createMemoryRouter(routes, …)` without a browser history.

---

## Part 2 — Contest Rules link + modal wiring

Figma source: `Contest — Rules — Modal — Desktop` (`6241:14657`) / `— Mobile` (`6241:14677`);
`Contest rules ›` link `6245:14767` (desktop) / `6245:14768` (mobile). All from
`sprint-2/leaderboard-footer-removal-and-contest-rules-modal`.

### `src/pages/contest/ContestRulesModal.tsx` (+ `.css`)

Follows `EditProfileModal.tsx`'s established pattern: a fixed-inset overlay (scrim, `onClick`
→ close) wrapping a card that `stopPropagation`s. Added on top of that: `role="dialog"`,
`aria-modal="true"`, `aria-labelledby`, an Escape-key handler, and focusing the close button
on open.

The body renders the **exact** designed placeholder — nothing invented, nothing softened:

- A dashed block (`1.5px dashed var(--sn-brand-navy)` on `var(--sn-green-tint-12)`,
  `border-radius: 10px`) containing:
  - **`[PLACEHOLDER — founder to supply final Contest Rules copy before this ships]`**
  - *This modal is a structural shell only. The Contest Rules copy is written and owned by the
    founder directly — there is no legal-counsel review track for this content (unlike the
    Terms of Service / Privacy Policy).*
- A caption: *This body area scrolls vertically when the final rules content is longer than
  the modal.* (`.contest-rules-modal__body` is `overflow-y: auto`, `max-height` bounded.)

Tokens: `--sn-*` only, matching `ContestPage.css` / `EditProfileModal.css`. The scrim
(`rgba(40, 46, 101, 0.28)`) and the shadow (`0 4px 16px rgba(40,46,101,0.14)`, the Figma
`elevation/menu` value) are literals — the token map has no navy-with-alpha, the same
disclosed exception `EditProfileModal.css` / `LeaderboardPage.css` already make.

**The "founder to supply" marking is intentionally shipped visible.** Per the founder's
explicit, deliberately-different-from-ToS/Privacy decision (Decision Log #227), the real
Contest Rules copy is founder-owned with no counsel-review track — so this is not blocked and
ships with the placeholder until the founder writes the copy. A prominent code comment in
`ContestRulesModal.tsx` says so, to head off a future "fix" that removes it.

### `ContestPage.tsx`

- `useState` `rulesOpen`.
- A `Contest rules ›` **`<button type="button">`** (an in-page overlay, not a navigation —
  hence a button, not a `<Link>`), styled via `.contest-footnote__link` to read as the same
  chevron link as its sibling `View the Contest leaderboard →`.
- `{rulesOpen && <ContestRulesModal onClose={() => setRulesOpen(false)} />}`.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (209 modules).
- `npx vitest run` — **27 files / 177 tests, 0 failures** (up from 26 / 166):
  - **new** `src/app/router.test.tsx` (+8): FooterLayout membership is structurally exactly
    `{ index, sports-hub, blog, blog/:articleId, * }`; does not contain `leaderboard` or
    `contest`; and, mounting the real route tree — `/leaderboard` and `/contest` render with
    no `contentinfo`, an unmatched path 404s **and** shows the footer, `/` and `/sports-hub`
    still show the footer, `/community` still resolves with no footer.
  - `src/pages/ContestPage.test.tsx` (+3): the modal is closed until `Contest rules ›` is
    clicked; when open it shows the visible "founder to supply" placeholder and the "no
    legal-counsel review track" line (not real rules copy); it closes on the `×`, the overlay,
    and Escape.
  - No existing test changed.
- Dev-server smoke test: `/`, `/leaderboard`, `/contest`, `/sports-hub`, `/community`, and an
  unmatched path all HTTP 200 (SPA — the 404 is client-rendered).
- No real browser / Playwright check available in this environment — same ceiling as every
  prior `apps/web` PR.

## Decision Log

New entry **#228** (Build Plan Section 9). Forward-pointers appended to **#227** (the
`apps/web` follow-up it flagged is now done; the modal it designed is now wired) and **#213**
(`FooterLayout` page set corrected).

## Not merged — founder's call after review.
