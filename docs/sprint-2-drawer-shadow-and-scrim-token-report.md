# Drawer directional shadow + scrim token (Figma only)

Branch `figma/drawer-shadow-and-scrim-token`. Decision Log #352, #353; forward-pointers on #183, #163. No app/backend code.

## Part 1 - directional drawer shadow (VISIBLE change - review the render)

- New effect style `elevation/overlay-right` (`S:ddf29a992d19d87a24ff6b44f116289f69454333,`). Same three layers, radii (6/24/56) and bound colour variables (`color/shadow/overlay-ambient`, `color/shadow/elevated`, `color/shadow/overlay-key`) as `elevation/overlay`; only the offsets change, from y 2/8/24 to **x 2/8/24, y 0**, so the shadow casts to the right - the leading edge of a drawer that slides in from the left.
- Applied to `Navigation Drawer - Mobile` Panel `5870:10692` only (inherited by the instance in `Community - Home Feed (Navigation Drawer Open) - Mobile`).
- `Settings - Delete Role` Confirm Dialog `5404:7370` and everything else on `elevation/overlay` left on the vertical version. No colour variable edited.
- Verified by screenshot of the component: a soft shadow falls onto the scrim at the panel's right edge. The offset values (2/8/24) mirror the old vertical magnitudes; tune if you want more/less reach.

## Part 2 - `color/overlay/scrim` token (should look identical)

- New COLOR variable `color/overlay/scrim` (`VariableID:6545:22215`, scopes FRAME_FILL / SHAPE_FILL) in `Soccernity Theme` (now 17 variables). Light: navy `#282E65` @ 27.75% = 1 - 0.85^2, the exact composite of the old two 15% fills. Dark: `#0D0F21` @ 65%, following the dark ramp of the shadow family (30 / 45 / 55 for ambient / elevated / key; a full-surface scrim sits above them). The dark value is derived, not visually checked - the file ships light-only.
- Search (whole page `0:1`, every node with 2+ visible fills all bound to `color/icon/inactive`) found **8**: drawer component Scrim `5870:10690` + instance override `I5874:10690;5870:10690`, Contest Rules modal desktop `6242:14767` / mobile `6244:14767`, Admin Open-the-final `6276:16200`, and three Bants filter dialogs `2459:10005`, `2459:12080`, `2459:14444`. All now one fill bound to the token.
- File convention is paint opacity = token alpha, bound to the variable. Setting opacity 1 renders solid navy (caught in a screenshot, corrected). The instance override did not follow the component and had to be set explicitly.
- Before/after pixel samples: modal (188,190,210) -> (187,190,209); drawer scrim (196,198,212) -> (195,197,212). Difference <=1/255 (rounding).

## Not changed, flagged

Other scrims use a different pattern - `brand/navy` with paint opacity 45% (`Settings - Delete Role` `5404:7369`, two archived Contest frames) or 30% (`Message` actions menu `5709:8503`). Different strengths, so moving them to the token would be a visible change. Candidate follow-up. #163(2) (drawer nav-list divergence) untouched.
