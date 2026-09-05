# sprint-2/shared-footer-layout — figma-to-code report

**Agent:** figma-to-code · **Date:** 2026-09-05 · **Scope:** `apps/web` only, `services/api` untouched.

Extracts the site footer into a shared component and wires it through a new pathless layout
route so it lands on exactly the pages whose canonical Figma frame carries it — and no others.

## The founder decision + the real gap it closes

The footer should be a shared component, not copy-pasted per page. A live Figma/code audit
found this is not purely an architecture cleanup:

- Only `HomePage.tsx` had a footer — written **inline**.
- **Sports Hub, Leaderboard, Blog, and Article Detail** all carry the canonical footer
  (standardized file-wide in Decision Log #209/#210) in their own canonical Figma frame,
  and never got one when they were converted from `PlaceholderPage` stubs (PR #171 / #172).
  Those PRs disclosed the omission as "matching convention" — but the convention was
  incomplete for these four pages.
- **Community, Clubs, ClubFanPage, Banter** have **no** footer in their Figma frames —
  confirmed live via `get_metadata`, not assumed — so they must not gain one.

## Canonical footer re-verification (before extracting)

`get_design_context` / `get_metadata` on the canonical footer — desktop `5213:6816`,
mobile `5543:7662`:

| Element | Canonical Figma | HomePage's inline footer (before) |
|---|---|---|
| Logo mark + "Soccernity" wordmark | ✅ | wordmark only, **no logo mark** |
| Social bar — 6 icons (facebook, instagram, twitter, Tik Tok, YouTube, LinkedIn) | ✅ | **absent entirely** |
| Legal links (Terms of Service, Privacy Policy, Privacy Settings, Contact Us) | ✅ with green bullet dots | present, **no bullets** |
| 1px rule | ✅ | **absent** |
| Copyright paragraph | ✅ | ✅ (matches) |

**The inline footer had drifted.** So the shared `Footer.tsx` is built to **canonical**, not
copied from HomePage — logo mark, full social bar, bullet separators, and rule all restored.
This is exactly the "confirm it wasn't already drifting before you copy it forward" check the
task called for.

## What was built

### `src/layout/Footer.tsx` + `Footer.css`

- Logo mark reuses the existing `src/assets/icons/soccernity-logo-mark.svg` (same asset
  `Header.tsx` / `AuthTopBar.tsx` use — single source of truth for the brand mark; its
  Figma node is `Layer_8`, the same node the footer frame references).
- 6 social icon SVGs downloaded from Figma into `src/assets/icons/social-*.svg`. Each
  carries its brand-green `#7BB929` fill baked in — the same convention `nav-blog.svg` etc.
  already use for exported Figma glyphs.
- **Legal links and social icons render as non-interactive `<span>`s.** There are no
  `/terms`, `/privacy`, `/contact` routes (legal pages unconverted — Decision Log #203),
  and Soccernity has no published social accounts. Rendering real links would 404 or
  fabricate a destination. Same discipline as HomePage's previous footer and Decision Log
  #166.
- **1px rule**: Figma binds `--sn-icon-inactive` (navy @ 15%), which is invisible on the
  navy footer ground. `Footer.css` uses `rgba(255,255,255,0.15)` to preserve the visible
  intent. Flagged in Decision Log #213.
- **Full-bleed**: `.sn-footer` breaks out of `AppShell`'s 32px content padding with
  `margin: 24px -32px -32px` — the same negative-margin technique `HomePage.css` /
  `SignupSplitScreen.css` already use. On HomePage, its `.home { margin: -32px }` collapses
  the top gap to a small seamless overlap into the navy closing section; on the four
  centred pages it leaves a 24px gap before the navy footer.

### `src/layout/FooterLayout.tsx`

Pathless layout route: `<Outlet />` + `<Footer />`. Nested under `AppShell`.

### `src/app/router.tsx`

`apps/web` now has **three** layout wrappers; a new page picks one:

| Wrapper | Chrome | Routes |
|---|---|---|
| `AuthChrome` | logo-only Top Bar | `/login`, `/signup`, `/forgot-password`, `/reset-password` (Decision Log #172) |
| `AppShell` direct child | `Header`, **no footer** | `/community`, `/clubs`, `/clubs/:id`, `/banter`, `/guardian-consent*`, `/profile`, `/verify-email`, `*` |
| `FooterLayout` (nested under `AppShell`) | `Header` + shared `<Footer />` | `/` (Home), `/sports-hub`, `/leaderboard`, `/blog`, `/blog/:articleId` |

`FooterLayout` is the `AuthChrome` split's mirror, one layer deeper — no per-route
conditional, no `useLocation` sniffing.

### `HomePage.tsx` / `HomePage.css`

Inline `<footer>` JSX and all `.home-footer*` rules removed; `.home footer` dropped from the
shared padding selector. `.home { margin: -32px }` untouched.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean |
| `npx vitest run` | **19 files / 123 tests, 0 failures** (up from 18/119 — new `src/layout/Footer.test.tsx`, 4 tests; **no existing test changed**) |
| Real-router footer split (throwaway spec, deleted before commit) | rendered the real `src/app/router.tsx` at all 12 routes — **exactly one `<footer>`** on `/`, `/sports-hub`, `/leaderboard`, `/blog`, `/blog/:id`; **zero** on `/community`, `/clubs`, `/clubs/:id`, `/banter`, `/profile`, `/verify-email`, 404 |
| Dev-server smoke | `/`, `/sports-hub`, `/leaderboard`, `/blog`, `/blog/:id`, `/community`, `/clubs`, `/banter` → all HTTP 200 |

No existing test broke — the footer moved but its content didn't, and no page test asserted
on footer content. No real browser / Playwright check is available — same ceiling as every
prior `apps/web` PR.

## Not done / follow-ups

- **Legal pages** (Contact Us / ToS / Privacy Policy) have no React implementation
  (blocked on Decision Log #203 / counsel). When that conversion runs, adding those routes
  as `FooterLayout` children is all that's needed — their Figma frames carry the footer
  (Decision Log #202 retrofit). Nothing to wire now.
- Legal links / social icons become real `<a>`s once `/terms`, `/privacy`, `/contact` and
  real social URLs exist.
- Auth routes (`AuthChrome`) are out of scope and untouched.
