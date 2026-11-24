# Figma gaps C: Edit Profile Phone field and Manage Account panel (G5)

Figma only. Page `0:1`, file `weZWWqggy9j13eX8bhFgs6`. No code, tests, strings, docx, register or legal draft changed. Frames are additions; no existing frame was edited. Nothing is tagged `[COPY PENDING LEGAL REVIEW]` (no code string carries it). Wording copied from `apps/web/src/pages/profile/EditProfileModal.tsx`, none invented.

## Frames (one row at y 347000)

| Frame | Id | x | Size |
|---|---|---|---|
| G5-1 Phone field, desktop | `7126:70207` | 0 | 560 x 353 |
| G5-2 Phone field, mobile | `7126:70221` | 660 | 390 x 368 |
| G5-3 Manage Account, collapsed | `7127:70207` | 1150 | |
| G5-4 Change Password, open | `7127:70241` | 1810 | 560 x 516 |
| G5-5 Mismatch error | `7127:70284` | 2470 | |
| G5-6 Success | `7127:70330` | 3130 | |
| G5-7 Deactivate, confirm | `7127:70375` | 3790 | |
| G5-8 Delete, confirm | `7127:70414` | 4450 | |
| G5-9 Password required, error | `7127:70453` | 5110 | 560 x 430 |
| Notes (G5) | `7128:70207` | 5770 | 408 x 1420 |

Naming: "Edit Profile, <Screen>, <State> (G5-k)".

## Prototype links (11, all read back, all inside the G5 set)
Change Password button in G5-3, G5-5, G5-6, G5-7, G5-8, G5-9 to G5-4; "Save new password" in G5-4 and G5-5 to G5-6; Deactivate in G5-3 to G5-7; Delete in G5-3 to G5-8; "Confirm deactivation" in G5-7 to G5-9. No links to existing frames.

## Reused
Structure and field label/input pattern of the existing Edit Profile Username frames, the error bar pattern (3px `semantic/alert` accent bar, navy text), the Notes frame style of `7102:68239`, Soccernity Theme Light variables only (no raw hex), Montserrat.

## Defaults (veto-able)
Error text is navy with an alert accent bar; success text is brand green; panels use green-tint; Delete is a navy-outlined button.

## Standing check
Top-level nodes 1,940 to 1,950 (+10: nine frames and Notes). No existing node edited. 0 overlaps among the new frames; 0 unbound fills (default white on auto-layout frames cleared, Notes fill bound to background/surface). The id hash I computed afterwards uses a different function from the earlier baseline (1696820904), so it is not comparable; the count and "nothing existing edited" are the evidence.

## Not matched / open
- No frames for the busy labels ("Saving..." and similar), the three fallback errors, or the deactivate/delete success redirect.
- The Delete panel has no password-required frame; it would reuse the G5-9 text.
- The "reset it" link goes to forgot-password; no frame for that destination.
- Screenshots taken: G5-1, G5-4, G5-9 only. G5-2, G5-3, G5-5 to G5-8 and Notes were not screenshotted, and node text was not re-read against the code after build.

## Code comments this PR makes stale (not edited)
- `EditProfileModal.tsx` line 21 (phone sentence).
- `EditProfileModal.tsx` line 24 (Manage Account has no Figma screen).
