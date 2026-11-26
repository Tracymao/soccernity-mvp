# Design tokens

`index.ts` mirrors the Figma variables and foundations (owned by the figma-design-system agent). Colours are applied at runtime by `applyTheme` (web) and `adminTheme` (admin). The static foundations below are plain CSS in `foundations.css`, imported by both app entries.

`apps/web/src/theme/foundations.test.ts` fails if `index.ts` and `foundations.css` disagree.

Nothing uses these yet. New work should; old CSS migrates later, one file at a time.

## Scales (defaults approved 2026-11-25, veto-able)

- **Radius** (`--sn-radius-*`): sm 6, md 8, lg 12, xl 16, full 999. Legacy, not for new use: 2 (accent bars only) and 10.
- **Type** (`--sn-text-<step>-size` / `-line`): caption 12/16, body-sm 13/20, body 14/22 (UI default), nav 15/20 (admin sidebar labels), body-lg 16/24, lead 18/28, title-sm 20/28, title 24/32, headline 32/40, display 44/52, hero 62/68 (Home hero only). Minimum size for new work is 12.
- **Fonts**: `--sn-font-display` (Montserrat) for hero, display, headline, title and title-sm on public web pages; `--sn-font-ui` (Inter) for everything else, including all admin screens.
- **Elevation**: `--sn-elevation-1|2|3`; level 0 is `none`. Shadow colours only through the existing `--sn-shadow-*` colour tokens.
- **Motion**: durations fast 120 ms, base 200 ms, slow 320 ms (exits use the next shorter one); easings `--sn-ease-out|in|standard|linear`; distances 4, 8, 16 px; stagger step 40 ms, at most 6 items. Animate transform and opacity only (hover colour changes allowed).

## Reduced motion

One global switch in `foundations.css`: under `prefers-reduced-motion: reduce` the three durations become 0.01ms and the three distances 0, and `html` gets `scroll-behavior: auto`. There is deliberately no blanket `animation: none`, so existing per-component reduced-motion blocks and spinners keep working. Motion tokens live in CSS, not in the theme functions, because inline custom properties would beat this override.

## Migration guide (old value to token)

| Old | Use |
| --- | --- |
| radius 4, 5 | `--sn-radius-sm` |
| radius 10 | `--sn-radius-md` for controls, `--sn-radius-lg` for containers |
| radius 14 | `--sn-radius-lg` |
| radius 18, 20 | `--sn-radius-xl` |
| radius 25 and above on pills | `--sn-radius-full` |
| text under 12px | `caption` (12/16) |
