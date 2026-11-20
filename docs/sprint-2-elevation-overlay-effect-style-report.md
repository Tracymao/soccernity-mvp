# sprint-2/elevation-overlay-effect-style -- report

Agent: figma-design-system. Date: 2026-09-21. Resolves Decision Log #182, #183; forward-pointer on #163.

**Visible design change -- review the render, not just the diff.**

## What was built
- Effect style `elevation/overlay`: ambient (y2, blur6), key (y8, blur24, existing `color/shadow/elevated`), deep (y24, blur56). All colours bound to variables.
- New variables (`Soccernity Theme`, scope `EFFECT_COLOR`): `color/shadow/overlay-ambient` (Light navy `#282E65` @8%, Dark `#0D0F21` @30%), `color/shadow/overlay-key` (Light navy @12%, Dark `#0D0F21` @55%). Separate variables are needed since a bound colour has one alpha for all layers.

## Applied to
| Node | Id | Before |
|---|---|---|
| Settings - Delete Role / Confirm Dialog | 5404:7370 | no effect |
| Navigation Drawer - Mobile / Panel | 5870:10692 | no effect (instance `I5874:10690;5870:10692` inherits) |

## Not touched / flagged
- 4-layer `#130A2E` date-picker panels: intact (out of scope).
- Contest Rules dialogs (6242:14768, 6244:14768), Open-the-final dialog (6276:16201): still `elevation/menu`; candidates for retargeting.
- Drawer uses vertical offsets, not a horizontal leading-edge offset.
- No scrim fill token created (#163(1) folded into this style family).

## Verification
Screenshots of `5403:7205` and `5870:10689` reviewed. Effects read back: 3 layers, each colour bound. No new fills; no palette additions.
