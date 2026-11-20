# sprint-2/privacy-settings-to-code — report

**Agent:** figma-to-code · **Date:** 2026-09-06
**Scope:** `apps/web` only — no `services/api` code.
**Figma source (read fresh after PR #181 / Decision Log #222 landed):**
`Settings — Privacy` (`6178:14437`, desktop) / `Settings — Privacy — Mobile`
(`6185:14547`), file `weZWWqggy9j13eX8bhFgs6`.
**Build Plan Decision Log:** #223 added (Section 9).

Converts the **consolidated** Privacy page (Decision Log #222 — the old
`Settings — Privacy & Safety` screen was merged into it) into a real React
page + route. **This is the first Settings route in `apps/web`** — CLAUDE.md
and Build Plan Section 6 both had the Settings area deferred to Sprint 3/6, so
there was no existing "Settings family" page pattern to follow. This page sets
one, reusing `ClubsPage` / `ProfilePage`'s `--sn-*` light-theme tokens and
centered-column layout.

---

## Sequencing

The task said "start once PR H1 (`sprint-2/privacy-settings-design`) is
merged." H1 (PR #175) was merged, **and** the later consolidation PR
`sprint-2/auth-navbar-delete-account-privacy-consolidation` (PR #181,
Decision Log #222) — which CLAUDE.md's newest bullet said explicitly blocks
`figma-to-code` and redefines the canonical Privacy page — was also merged
to `main` (confirmed with the founder before starting). Figma was read fresh
against the consolidated frames, not PR #175's narrower scope.

---

## What was built

### New files

| File | Purpose |
|---|---|
| `src/pages/PrivacySettingsPage.tsx` | The page. Route `/settings/privacy`. |
| `src/pages/settings/PrivacySettingsPage.css` | Styles — `--sn-*` tokens, light mode. |
| `src/pages/PrivacySettingsPage.test.tsx` | 9 tests. |

### Routes (`src/app/router.tsx`)

Added as direct `AppShell` children (no footer — the Settings Figma frames
carry their own Top Bar, not the site footer; same as `CommunityPage` /
`ProfilePage`):

- `/settings` → `<Navigate to="/settings/privacy" replace />` — a bare
  `/settings` is not a 404; it lands on the one built Settings screen.
- `/settings/privacy` → `PrivacySettingsPage`.
- `/settings/deactivate` and `/settings/delete-account` → `PlaceholderPage`
  **stubs**. Real routes, wired from the Privacy page's "Account status"
  row, but the K1/K2/K3 account-deactivation-flow screens (Figma
  `2924:7358` / `6213:15640` / `6225:14789`; backend
  `POST /auth/deactivate-account` + `/auth/delete-account`, both merged)
  are not yet converted. **The founder chose stub routes** over disabled
  links or building those screens in this PR.

### Navigation entry point (judgment call — flagged)

`navigation.ts`'s `Settings` items in `accountMenuItems` (desktop account
dropdown) and `drawerNavItems` (mobile nav drawer) were `available: false`
(rendered disabled). Flipped to available now that `/settings` resolves.
Reasoning: a disabled "Settings" row sitting in a nav slot that already
exists, next to a page that now genuinely exists, is worse UX than either
extreme — and leaving the page reachable by direct URL only would repeat
the orphan-page problem Decision Log #156 flagged for Clubs. Only the
Privacy category is real (the others render disabled on the page), but the
account now has a reachable Settings entry. `Header.test.tsx` (×2
assertions) updated accordingly.

### Footer (drift fix — adjacent to scope)

Decision Log #222 Part 4 removed the "Privacy Settings" link from the
canonical Figma footer file-wide (founder: "remove, don't relink"). The
code footer (`Footer.tsx`) still listed it as a non-interactive legal
link — now removed to match, along with its `Footer.test.tsx` assertion.
Result everywhere: `Terms of Service · Privacy Policy · Contact Us`.

---

## The 7 rows — what's real, what's a disclosed stub

Checked live against `services/api` before building. Per CLAUDE.md's
standing discipline and the task brief's own "blocks on a small backend-api
addition — flag rather than fake," every control with no backend is
rendered **visibly, disabled, with a short note** — never something that
looks live but silently does nothing.

| Row | Backend today | This PR |
|---|---|---|
| **Public profile** | No `User` visibility column, no endpoint (`UpdateUserDto` = `displayName` + `phone` only) | Toggle rendered **disabled** (visual only, `role="img"` with a state label), note: profiles are currently visible to all signed-in members. Flagged. |
| **Your Post** | No post-visibility backend; Figma sub-page `2926:8996` not converted | **Disabled** row + "Not available yet." |
| **Direct Message** | No DM-permission backend; Figma sub-page `2926:8764` not converted | **Disabled** row + "Not available yet." |
| **Download my data** | No data-export / DSAR endpoint anywhere in `services/api` | **Disabled** row + note. Flagged. |
| **Account status** | `POST /auth/deactivate-account` + `/auth/delete-account` both merged | "Active" (definitionally true — a deactivated / pending-deletion account has revoked sessions and can't authenticate). Two real `<Link>`s → `/settings/deactivate`, `/settings/delete-account` (stub routes). |
| **Guardian approval** | **REAL** — `GET /auth/guardian-consent/status` | Minors only (`isMinor` from `GET /users/:id`). Pill: `confirmed` → "Approved", `pending` → "Pending" + the guardian email. A 404 from the status endpoint = not a minor = **row hidden**. Any other error → the row shows a soft "couldn't load" message (only minors reach this branch). "Change guardian email" → **disabled** ("Coming soon" — no `PATCH`-guardian-email endpoint exists, the same gap `GuardianConsentPage.tsx` already flags); the row as a whole links to `/guardian-consent` (the real minor status page). |
| **Marketing emails** | `services/api` sends only transactional email (verify, guardian-consent, password-reset via Postmark) | Rendered as designed — disabled toggle + "Coming soon" pill. |

### Deliberate divergences from the Figma frame (flagged)

- **`Approved` pill colour.** The frame uses white text on the green pill.
  The app's own convention (`ClubJoinButton`) is navy-on-green
  (`--sn-text-on-green`), which also passes AA — followed here.
- **Left profile mini-card + "Trending News" / "Suggested" sidebars**
  (desktop frame) — static lorem-ipsum with no Section 4 endpoint,
  identical to `ProfilePage`'s own source frame. **Not reproduced**, same
  discipline `ProfilePage.tsx` applies.
- **Settings category rail** — rendered (it's real chrome in both frames
  and orients the user), but the four non-Privacy categories are genuinely
  unbuilt (not even stubs), so they render disabled rather than as links
  to the 404 page — same treatment `navigation.ts` gives Messages /
  Notifications (Decision Log #166).
- **"Top Bar — Soccernity"** in the frames is not reproduced — `AppShell`
  renders the shared site `Header`, same as every other routed page.

---

## Backend gaps surfaced (Decision Log #223 — none fixed here, `apps/web`-only PR)

For a future `backend-api` pass:

1. **Profile visibility** — a `User.isProfilePublic` (or similar) column +
   `PATCH /users/:id` support, plus the read-side enforcement across the
   feed / profile / follower-graph endpoints. This is the one control on
   the page users would most expect to work.
2. **Data export / DSAR** — a `POST /users/:id/data-export` (request-style,
   emails a link) endpoint. Named directly in the Privacy Policy draft
   (`docs/legal-copy-draft-tos-privacy-policy.md`) as a data-subject right.
3. **Change guardian email** — no `PATCH`-guardian-email / restart-consent
   endpoint (Decision Log #60 describes the required "restart the consent
   flow from scratch" behaviour for the design; no code exists). Already on
   the "Backend requirements parked" list in CLAUDE.md.
4. **Your Post / Direct Message interaction-privacy** — post-visibility and
   DM-permission models + endpoints, plus converting the destination
   sub-pages (`2926:8996` / `2926:8764`).

---

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle (200 modules).
- `npx vitest run` — **20 files / 132 tests, 0 failures** (up from 19/123
  — `PrivacySettingsPage.test.tsx` +9; `Header.test.tsx` / `Footer.test.tsx`
  updated, no net count change).
- Dev-server smoke test: `/`, `/settings`, `/settings/privacy`,
  `/settings/deactivate`, `/settings/delete-account`, `/profile` all HTTP
  200, clean dev-server log.
- No real browser / Playwright check available in this environment — same
  ceiling as every prior `apps/web` PR.
