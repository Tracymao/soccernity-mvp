# Figma: admin Roles (Settings) frames restyled to the premium design (Decision Log #613)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed. Source of truth: `apps/admin/src/pages/settings/`, `pages/two-factor/` (reset card and dialog) and `components/stub/` at `origin/main` `7392074`.

All frames are 1440 wide, at least 1184 high, Admin Shell active item "Settings", title at (301,129), content at (301,258), width 1098, gap 20.

## Frames restyled (ids kept)

| Frame | State | New content |
| --- | --- | --- |
| `6909:34859` | Roles list | `7403:69134` |
| `6991:56553` | Remove account, confirm | `7403:69238` |
| `6991:56752` | Remove account, removing | `7403:69356` |
| `6991:56951` | Remove account, could not remove | `7403:69474` |
| `6991:57150` | Remove account, own account | `7403:69592` |
| `6991:57349` | Remove account, last active super admin | `7403:69708` |
| `6991:57548` | Remove account, done (banner and dimmed row) | `7403:69824` |
| `1658:2456` | Add Role, default | `7404:69278` |
| `5403:7205` | Delete Role stub | `7404:70015` |
| `6907:34127` | Edit role, two-factor on | `7405:69725` |
| `6908:34249` | Edit role, two-factor off | `7405:69774` |
| `6908:34407` | Edit role, confirm reset dialog | `7405:69985` |
| `6908:34466` | Edit role, reset done | `7405:69823` |
| `6902:33532` | Edit role, nothing to reset | `7405:69878` |
| `6902:33820` | Edit role, own account | `7405:69931` |

In each, the old layers are hidden inside a layer renamed "ARCHIVED Content", moved below the frame. Nothing was deleted.

## New frames (states the code renders and no frame drew)

| Frame | State |
| --- | --- |
| `7403:69931` | Roles, loading |
| `7403:70052` | Roles, load error |
| `7403:70176` | Roles, empty |
| `7404:69304` | Add Role, field errors |
| `7404:69459` | Add Role, saving |
| `7404:69602` | Add Role, could not create |
| `7404:69748` | Add Role, account created (generated password) |
| `7404:69892` | Add Role, not allowed |
| `7405:70050` | Edit role, saving |
| `7405:70213` | Edit role, "Role updated." |
| `7405:70378` | Edit role, save error |
| `7405:70544` | Edit role, loading |
| `7405:70663` | Edit role, not found |

## Archived frames (hidden, "ARCHIVED " prefix, moved below)

| Frame | Reason |
| --- | --- |
| `1658:2303` Settings | Old list layout (league-based roles, not the shipped columns). `6909:34859` draws the list. |
| `1658:2592` Settings - Edit role | Old "Edit Role" form with Name and Role only. The code's Edit role is a four-card page, drawn by `6907:34127`. |
| `6902:33251` Reset two-factor 1 | Older Edit admin with one two-factor card. Same state as `6907:34127`. |
| `6902:33382` Reset two-factor 2 | Same state as `6908:34407` (confirm dialog). |
| `6902:33682` Reset two-factor 4 | Same state as `6908:34466` (reset done). |

No prototype link from a visible admin or settings frame (366 checked) points to an archived frame.

`6902:33532` was kept but changed: it drew a "nothing to reset" **dialog**. The code closes the dialog and shows a banner in the card.

## Unsure (left alone, for the founder)

- `917:218` "Users - team members" draws a Users list (Username, Date Joined, Delete, Block, View), not Roles. Not touched.

## Where the old frames and the code disagreed (the code wins)

- Old list: league names beside the roles, icon-only edit and delete, red delete icon.
- Edit admin: title "Edit admin" and the "Back to staff" button became "Edit role" and a "← Roles" link. "Full name" became "Name". Role options are the raw lowercase values.
- Edit admin: cards were full width; the code caps them at 560.
- "Reset two-factor" was a filled button; the code uses an outline button.
- The reset dialog had a close box; the code has none, so none is drawn.
- Delete stub: shows the "Not available yet." banner, a disabled "Delete Role" and a filled navy "Cancel".
- "[COPY PENDING LEGAL REVIEW]" tags were on the old Edit admin and Reset two-factor frames. The code renders none, so the new layers have none (the old ones remain only in hidden layers).

## Code has them, no frame

- Roles "Load more" / "Loading…" (the sample has fewer than 50 rows).
- Add Role: success with a password you set (no generated-password block), "Copied." and copy-failed lines, the 409, 403 and 400 messages, the length-limit and password-mismatch errors.
- Edit role: "Updating…", status error, "Reactivate account", the vetted state with its "Recorded …" line, vetting error, the "Couldn't load this admin account" variant.
- Reset dialog: "Working…" and "Couldn’t reset two-factor. Please try again."

## Notes for a code PR

"Code" sizes are from a throwaway headless-Chrome harness (real `foundations.css` and these CSS files, hand-copied markup, runtime colour variables not set) or read from the CSS. Not measured in a built app.

| File | Item | Code | Frames |
| --- | --- | --- | --- |
| settings.css | Table header | 43 high, uppercase | 40, sentence case |
| settings.css | Table row | 57 high, 13px | 52 minimum, 14/22 |
| settings.css | Pill | 21 high, `text-transform: lowercase` | 24 high, capitalised |
| settings.css | Card and table radius | 10 | 12 |
| settings.css | Callout | radius 8, padding 14/16, line 1.5 | radius 6, padding 12/14, 13/20 |
| settings.css | `.rl-error` | bordered box, radius 4 | alert callout with alert bar |
| settings.css | `.rl-loading` | 17 high | 22 |
| settings.css | `.rl-btn` | 39 high, radius 6 | 40, radius 8 |
| settings.css | `.rl-btn--sm` | 29 high, 12px | 32, 13 Medium, padding 5/12 |
| settings.css | `.rl-field select` | 42 high, radius 6, bordered | 44, radius 8, green tint 12%, 2px transparent border |
| addRole.css | Card | padding 28/32, gap 18, shadow; title 14 | padding 20, gap 12, no shadow; title 16 |
| addRole.css | Inputs | 36 high, underline | 44, radius 8, green tint 12%; alert border when invalid |
| addRole.css | Submit / Back to Roles | pill, 41 high, bold | 40, radius 8, Semi Bold |
| removeAccount.css | Dialog width and radius | 560, 16 | same |
| removeAccount.css | Buttons | 39 high, radius 6 | 40, radius 8 |
| removeAccount.css | Body padding | 22/28/16 | 22/28, gap 16 |
| twoFactor.css | Reset dialog | 460, radius 10, padding 24, no header band | 560, radius 16, header band and divider |
| twoFactor.css | Buttons | 42 high, radius 4 | 40, radius 8 |
| twoFactor.css | Banner | radius 8, 1px border | radius 6, no stroke |
| twoFactor.css | Card | radius 10, extra `margin-top: 20px` | radius 12, same 20 gap as the other cards |
| AdminStub.css | Stub banner | dashed border, radius 8 | callout |

There is no textarea on these pages. `twoFactor.css` is shared with the sign-in and profile screens, so scope any change.

## Checks

- **Top-level count is 2017, not 2004:** the 13 new state frames were appended at the end of the page. The first 2004 ids are unchanged and in order: their hash (excluding `7230:71662`) is **2327422288**.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- All 28 touched and new frames, outside the Admin Shell: no overlap with another visible top-level frame, no unbound solid fill or stroke, no text under 12px, no uppercase label, no "[COPY PENDING" text, one search bar.
- After those checks, 7 paints were given the correct fallback colour for their bound variable (some frames had rendered black). Bindings did not change.
- Screenshots (1000px) taken across all four groups. Contrast was not measured. Dark mode was not checked.
- Sample people are reused from the old frames. "Nkem Obi" and the generated password are invented sample data.
