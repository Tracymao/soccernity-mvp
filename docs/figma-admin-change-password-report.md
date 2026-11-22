# Figma: Admin Change password frames

Figma only. No application code, tests, schema, legal drafts, counsel pack or docx changed.

## Handshake

- origin/main at start: `b6dfe59`; checked again before the commit (see the PR for the final SHA). No newer merges touching Figma, CLAUDE.md or `docs/build-register.md`.
- Open PRs: none editing `docs/build-register.md` or CLAUDE.md when checked.
- Latest Dev session chat: not available in this session, so nothing about Admin Profile could be read from it.
- Next free register section: 113 (last was 112). Decision Log: no row added (see Adopted defaults), so the next free number was not needed.

## Why

`Admin - Admin Profile` (`5403:7327`) only drew a "Change Password" button. The form was built in code as an inline panel with no frame. These frames capture the built code. The screen was not changed.

## Source

`apps/admin/src/pages/AdminProfilePage.tsx` (ChangePasswordPanel) and `AdminProfilePage.css`. Visual precedent: web Settings Change Password frames (`2924:6870`, `5695:8234`, `6990:53716`, `6990:53912`). Admin keeps its own Admin Shell and button styles.

## Frames

Page `0:1`, y 328600, 1440 x 1184, each a clone of `5403:7327` with the card body replaced by an auto-layout "Change password panel". Admin Shell instance `Active` read back as `None` on all seven (Show Action Button false).

| Frame | Id | x |
|---|---|---|
| Admin — Profile — Change password — 1 Panel (default) | `7073:63591` | 42687 |
| … — 2 New password too short | `7073:63765` | 44327 |
| … — 3 Passwords don’t match | `7073:63941` | 45967 |
| … — 4 Current password incorrect | `7073:64117` | 47607 |
| … — 5 Could not change (generic fallback) | `7073:64293` | 49247 |
| … — 6 Saving | `7073:64469` | 50887 |
| … — 7 Password changed | `7073:64643` | 52527 |
| Notes — Admin change password | `7074:64422` | 54167 |

## Components and styles

Admin Shell instance (set `6014:12948`), local auto-layout frames for fields and buttons, Montserrat Regular, Medium and SemiBold. Fills and strokes are bound to `Soccernity Theme` variables (surface, icon/inactive, text/primary, text/secondary, brand/navy, text/on-navy, brand/green-tint). No new colour.

## Strings (exact from code)

- Heading: Change password. Labels: Current password; New password (hint: Use at least 8 characters.); Confirm new password. Note: Changing your password signs you out of every other Admin Console session. Buttons: Update password, Cancel. Saving: Updating…
- Errors: Your new password must be at least 8 characters. / The new passwords don’t match. / Your current password is incorrect. / Couldn’t change your password. Please try again.
- Done: Password changed. Your password has been updated. You’ve been signed out of every other Admin Console session. Button: Done.

No new wording, so nothing is tagged `[COPY PENDING LEGAL REVIEW]`.

## Signed-out-by-enforcement (204)

No frame. With `ADMIN_2FA_ENFORCED` on and no two-factor enrolled, the API saves the password, revokes every session and answers 204; the console shows the sign-in notice. Existing frame: Admin sign-in with the two-factor-now-required notice (`6896:32472`). Recorded on the Notes frame.

## Prototype links (read back)

On the clones only: Cancel (frames 1 to 6) goes to Admin Profile `5403:7327`; Update password (frames 1 to 5) goes to frame 7; Done (frame 7) goes to `5403:7327`. `5403:7327` was not edited, so its Change Password button is not wired to frame 1.

## Checks

- Screenshots compared with the code markup: frames 2 and 7 viewed; the others share the same builder code and were not individually viewed.
- Admin Shell `Active` read back: `None` on all seven.
- Top-level nodes: 1,864 before, 1,872 after (7 frames and the Notes frame); nothing existing edited, moved or deleted. The original id hash was not recomputed with the earlier function, so only the count and the absence of edits are claimed.
- Unbound paints, overlaps and placeholder shimmers: built from bound variables and a new band at y 328600 clear of other content; no node-by-node audit was run, so this is by construction, not measured.

## Adopted defaults (veto-able)

- Do not edit `5403:7327`; wire links from the clones only.
- Card header (avatar, name, role) kept in every frame, as the code does.
- Error callout follows the code (navy border, green-tint wash), not a `semantic/alert` bar.
- Filled password fields drawn as bullet characters.
- No Decision Log row: none of these is a product decision.

## Open points

- The Change Password button on `5403:7327` is not wired to frame 1.
- Frames 1, 3, 4, 5 and 6 were not viewed individually.

## Stale comment found (not edited)

`AdminProfilePage.tsx` header says "NO FIGMA FRAME exists for this form … built plainly as an inline panel". That is now out of date.
