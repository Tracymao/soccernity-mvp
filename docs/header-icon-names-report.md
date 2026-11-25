# Header icon names on hover (CH-H6, Decision Log #566, B-329)

Branch `feat/header-icon-names`, cut from `origin/main` `bdfd3da`. `apps/web` and docs only.

## What changed

- New `apps/web/src/layout/HeaderTip.tsx` and `HeaderTip.css`: one fixed-position label, navy `#282E65` (via `--sn-brand-navy`), white 12px text, rounded, shown about 150 ms after hover or keyboard focus, hidden at once on leave, blur or Escape. It is `aria-hidden="true"` and only displayed inside `@media (hover: hover)`, so touch devices never see it. It is placed from the icon's `getBoundingClientRect()`, so the nav list's `overflow-x: auto` (not changed) cannot clip it.
- `Header.tsx`: the nine primary nav icons (text from `primaryNavItems[].label`, not retyped), the Messages icon ("Messages") and the avatar button ("Account", not shown while the account menu is open). The hook is off in the mobile layout. The logo, search, Login button, mobile search icon, mobile drawer and account dropdown are not touched. Existing aria-labels are unchanged. `Header.css` is untouched.
- `Header.test.tsx`: 5 new tests (each nav label on hover and removed on leave, focus and Escape, aria-hidden and unchanged accessible names, Messages and Account and no label with the menu open, no label in the mobile layout). No existing test changed.
- Records: Decision Log #566 in the Build Plan docx (earlier rows checked cell by cell, unchanged), build-register row B-329 (W9, 0 gap frames), Section 7 row and heading, counters (329 B-IDs, 146 gap frames, W9 60), Section 130.
- Numbering: the brief said #565, but #565 is the 404 page (Section 129), so this is #566. Section 7 still has no rows for #557, #558, #564 and #565; only #566 was added.

## Verification

- `eslint` and `tsc --noEmit` in `apps/web`: clean.
- Full vitest: 162 files passed, 1 failed (2117 tests passed). The one failure is `ChangePasswordPage.test.tsx` ("flags the current field on a 401, keeps the typed values and stays on the form"). It fails alone and also in the main checkout without this change, so it is not caused by this work and was not touched.
- `npm run build:release` and `npm run check:pending-copy`: both OK.
- Real Chrome (built `dist` served with a single-page fallback, API calls answered in the browser; the logged-in view uses a fake session token), baseline `origin/main` build against this branch's build:

| View | Icons compared | Rects identical before/after | Labels shown / inside viewport | Horizontal overflow | Label gone after pointer leaves |
|---|---|---|---|---|---|
| logged out, 1440 | 9 + header | yes | 9/9, all inside | no | yes |
| logged out, 1280 | 9 + header | yes | 9/9, all inside | no | yes |
| logged out, 1024 | 9 + header | yes | 9/9, all inside | no | yes |
| logged in, 1440 | 11 + header | yes | 11/11, all inside | no | yes |

- Label text read back from the page: Sports Hub, Blog, Community, Leaderboard, Bants, Clubs, Grassroots, Scouting, Academy (plus Messages and Account when logged in), matching `navigation.ts`.
- First and last icon, label rect (x, y, w, h) against nav-list rect (left, right, top, bottom):
  - 1440: Sports Hub label `442.0, 66.5, 80.5, 24`; Academy label `924.2, 66.5, 70.1, 24`; nav list `466.8, 1289.5, 29, 61`.
  - 1280: same labels; nav list `466.8, 1129.5, 29, 61`.
  - 1024: Sports Hub `442.0, 66.5, 80.5, 24`; Academy `823.2, 66.5, 70.1, 24`; nav list `466.8, 873.5, 29, 61`.
  - Logged in, 1440: last label is Account `1360.5, 66.5, 64.0, 24`.
  The labels sit below the nav list (y 66.5 against its bottom at 61), so they are outside the clipped box, which is the point of the fixed placement.
- Screenshots were taken in the session scratchpad only and are not committed.

## Not verified / open points

1. The Figma navbar has no hover label frame. This is a code-only decision (Decision Log #566); Figma was not changed.
2. Only Chrome was tried. Safari and Firefox were not checked, and `:focus-visible` handling of the focus label was covered by the unit tests only, not by a real keyboard in a browser.
3. The `@media (hover: hover)` rule means a touch laptop that reports hover support shows the label on mouse hover and nothing on tap; this was not tried on real hardware.
