# Bants "Create a topic" dialog, emoji picker, room description and profile uploads-off state (build-register B-042 / B-117)

Branch `frontend/bants-create-topic`, from `origin/main` `babc441`. `apps/web` plus Playwright files only. No backend, schema, Figma, `docs/build-register.md` or Build Plan docx change; no new dependency.

## What the frames draw (Figma pass Y, `docs/figma-pass-y-report.md`)

| Node | Frame | What it draws |
|---|---|---|
| `2355:2137` | Desktop, empty | Create a topic dialog: header with title and close, avatar and Title field, Scope row (Club, League, Country, Topic) with the list open, "Description (optional)" field, emoji icon, Post button disabled. GIF, poll and attachment controls are hidden in the file. |
| `2256:8925` | Desktop, filled | Same, with a title and description entered, Post enabled. |
| `5651:8166` | Mobile, empty | Same as a bottom sheet, with the note "Post stays disabled until a title is entered." (annotation). |
| `5651:8207` | Mobile, filled | Scope = Club with a Chelsea club select. |
| `7061:63618` / `7060:63607` | Emoji picker desktop / mobile | Inline card, "Emoji" label, 3 x 6 grid. |
| `6998:54688`, `6999:54768`, `7002:55068` | Room pages | Optional muted description under the room title. |

## What was built

- **Create dialog** (`pages/banter/CreateTopicDialog.tsx`, replaces the inline form in `BanterPage.tsx`): dialog on desktop, bottom sheet at 820 px or less (`useIsMobile`), on the shared `BanterModal` (focus into Title, Tab trapped, Escape and the X close unless a request is running, focus returns to the "Create a room" opener). Fields: Title (2 to 120), Scope (Club disabled when the person has no club; club select when Club is chosen, with the existing loading, empty and error hints), Description (optional, multi-line, counter `n / 500`). Post is disabled until a trimmed title exists (and, for Club, until a club is picked); while it runs it reads "Creating…"; API errors show in the dialog; success navigates to `/banter/:id`. The description is sent trimmed and left out when blank.
- **Emoji picker** (`pages/banter/EmojiPicker.tsx`): self-contained, 18 emoji including soccer ball and trophy, `role="group"` named "Emoji", each cell a button with a spoken name, one tab stop with arrow keys, Home and End, Escape closes and returns focus to the emoji button, a press outside closes, closes after one choice unless Shift is held. Inserts at the caret (or replaces the selection) of Description only.
- **The 500 limit** is one constant, `BANTER_ROOM_DESCRIPTION_MAX_LENGTH` in `api/banter.ts`. It is counted in UTF-16 code units (`String.length`), the same way the API's `@MaxLength` counts. The textarea has `maxLength`, an emoji is inserted only if the result still fits, and a cell that would not fit is `aria-disabled` and ignored. (The check is conservative: it ignores that a selection being replaced frees room.)
- **Room page**: the description shows under the title as a React text node (never HTML), wrapping, only when non-null.
- **`ProfileImageControl`**: 403 `media_uploads_disabled` and 503 `uploads_unavailable` (via `isUploadsOffError`, now matching any error carrying the code, so `UsersApiError` works) show "Uploads aren’t available right now.", disable Choose / Choose another / Replace, and show no Try again. Remove stays enabled. Other failures behave as before.

## Wording differences from today's screen

- "Create a room" form becomes "Create a topic" dialog (heading). The hero button on the page is kept as "Create a room" because the frames do not draw the page.
- "Room name" becomes "Title"; "Create room" becomes "Post"; "Creating…" is reused for the pending state.
- No "Cancel" button: the close X replaces it (the frames draw only the X).
- New strings: "Description (optional)" and the aria-only names "Emoji", "Close" and the 18 emoji names. The mobile annotation note is not rendered.
- Uploads-off line on the profile picture and cover: "Uploads aren’t available right now." (was the server sentence plus Try again).

## Not built

Attachments, GIF, poll, description editing, a Cancel button, the annotation note, any change to who may create a room, composers untouched.

## Tests

- Vitest: Bants, room, creator-controls, profile-control set 8 files / 135 tests, 0 failures (new: `EmojiPicker.test.tsx`, `CreateTopicDialog.test.tsx`, a description block in `BanterRoomPage.test.tsx`, an uploads-off block in `ProfileImageControl.test.tsx`; existing `BanterPage.test.tsx` only changed label and button text). Wider run of `src/pages/community`, `src/api`, `src/pages/profile`, `src/lib`: 588 passed, 0 failed. `tsc --noEmit` and eslint clean.
- `npm run check:pending-copy`: 246 places before and after; no string tagged, no manifest row added (none of the new wording is a legal or safety promise).
- Playwright, real Chrome and API: new spec 63 (5 tests: title, description and emoji with the description shown at the top of the new room and stored; title only; Post disabled until a title and Escape returns focus; 390 px sheet with the picker open and no sideways scroll; uploads off shows the profile state) plus specs 45, 46, 62 all pass. Spec 59 changed in one assertion and in its header comment (the profile control now shows the uploads-off state, controls disabled, no Try again, instead of the server sentence with Try again): 7 of 7 pass when run alone. In the combined run its first test failed with `API /health never became healthy` after the restart (an environment timeout, not an assertion); the rerun of the file alone passed.
- Screenshots are in `docs/b042-screens/63-*.png`.

## Not run

The full Playwright suite, other specs, `apps/admin` and `services/api` suites, CI, any check in Safari or Firefox.

## Defaults to veto

The X as the only close control; the 18-emoji set; focus goes back to the Description after a pick; the conservative remaining-room check; Club stays disabled when there is no club.
