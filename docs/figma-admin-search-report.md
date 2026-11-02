# Admin search bar: Figma pass for B-114

Branch `design/b114-admin-search`, cut from `origin/main` `0607b3b` (the docs PR for Decision Log #463 is merged and was read first). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx or `docs/build-register.md`. Nothing existing was edited, archived or deleted.

Written for: the `figma-to-code` and `backend-api` agents who will build the admin search bar, and the founder who verifies it.

## What was read first (live)

- The Admin Shell component set `6014:12948`. Its search bar is `Frame 5768` > `Group 826` (a 740 x 41 rectangle, a search icon and the text "Search Soccernity"), at (279, 186) in every shell. It has no states and does nothing.
- The Users list frame `917:218` (legacy). It draws the shell bar. The page hides it in code (`hideSearch`), so the frame needed no change.
- The six lists the results must match: Users `917:218`, Moderation Queue `5794:8635`, Contact enquiries `6876:30850`, Articles `123:56`, Staff `6909:34859`, Media review `6851:29675`. The columns each shows are what the result rows show.
- The F2 admin components `6671:27364` (Button, Pill, Field, Callout, Banner, Note) and the admin text styles. The Field control look (radius 6, 2 px navy focus stroke, green-tint fill) is what the new bar follows.

## Decisions I made (all veto-able)

1. **A new local component, not an edit of the shell.** `Admin Search Bar` (`6926:35951`, y 154000) has four states: Idle, Focused (2 px navy stroke, caret), With text (clear icon), Submitting (spinner and "Searching…"). On the page frames the shell's own bar (`Group 826`) is hidden on the instance and the component sits in its place. Changing the shell set would change every shell screen (29+), so adopting it there is left to the build.
2. **Users page.** Drawn the same as every page. No Users frame changed.
3. **One results page for versions 1 and 2.** Groups in the brief's order: Users, Reports, Contact enquiries, Articles, Staff, Media review. A kind the build does not search yet is just not returned.
4. **Groups with no match are not drawn** (no empty groups, no zero counts).
5. **Rows show only what the matching list shows**, plus one added column, MATCHED ON (for example "Email address (exact)"). It tells the admin why a row matched and shows nothing the query did not contain. Remove it if unwanted.
6. **Row links** open the existing detail frames (list below). Articles has no detail frame, so its rows link to the Articles list.
7. **Helper text** under the bar on every frame: "Email lookups need the full address, for example name@example.com." Frame 3 adds "Press Enter to search."
8. **No legal wording.** Nothing is tagged `[COPY PENDING LEGAL REVIEW]`. All new wording is functional.

## Frames (1440 wide, desktop only like the other admin frames)

Row 1, y 155400. Shell instance `Active=None`, action button off.

| # | Frame | Node | Shows |
|---|---|---|---|
| 1 | Idle (no query, superadmin) | `6927:35930` | Idle bar; "What you can search" card with all six kinds |
| 2 | Focused | `6927:36077` | Focused bar; same body |
| 3 | With text (not yet submitted) | `6927:36225` | Typed email, clear icon, "Press Enter to search" |
| 4 | Submitting (loading results) | `6927:36374` | Spinner bar; "Searching for …"; skeleton groups |
| 5 | Query too short | `6927:36526` | One character typed; Neutral banner "Type at least [N] characters" |
| 6 | No query, moderator | `6927:36648` | The what-can-I-search list without Articles and Staff |

Row 2, y 157800.

| # | Frame | Node | Shows |
|---|---|---|---|
| 7 | Results, email query (version 1 kinds) | `6928:36566` | Users 1, Contact enquiries 2 |
| 8 | Results, all six kinds (layout study) | `6928:36772` | Every group; 1440 x 1479 |
| 9 | A group at its cap | `6928:37148` | Users, count pill "[N]+", cap note, "more matches not shown" row |
| 10 | No results | `6928:37372` | Neutral banner "No results" with hints |
| 11 | Load error | `6928:37497` | Error banner and a Try again button |
| 12 | Results, editor (Articles only) | `6928:37621` | Only the Articles group |

Also: section title `6929:37312`, description `6929:37313`, ten F2 Note instances (SCOPE OPEN) from `6929:37314` to `6929:37341` (y 160000 to 161642).

Prototype links (read back): bar 1 to frame 2, bar 3 to frame 4, bar 4 to frame 7; every result row to its detail frame: Users `6647:25540` (User Detail), Reports `5796:8635`, Contact enquiries `6878:31198`, Staff `6907:34127` (Edit admin), Media review `6852:30003`, Articles `123:56`.

## Role-restricted variant

A kind a role cannot open is absent, with no "not allowed" wording. Frame 6 (moderator, no query) and frame 12 (editor, Articles only) show this. Staff is superadmin only. By the existing role guards: moderator and superadmin see Users, Reports, Contact enquiries and Media review; editor and superadmin see Articles.

## SCOPE OPEN (also on canvas as Notes)

- The per-group cap and the minimum query length are the backend's. Drawn as `[N]`, not decided.
- Whether the API returns per-group counts; the "N results in M groups" line and count pills assume it does.
- The results and counts must follow the same visibility rules as the lists. A report that concerns a minor, and anything tied to the withhold-guardian-notices flag, must not appear to an admin who is not child-safety vetted, with no wording that reveals it. Not drawn; the build and its tests must enforce it.
- MATCHED ON column (decision 5).
- Adopting `Admin Search Bar` into the shell (decision 1).
- Not drawn: mobile, a keyboard shortcut to focus the bar, recent searches, an animated spinner (frame 4 is a static arc), pagination inside a group.
- No endpoint lists `AdminActionLog` (build register Section 69c), so the audit rows #463 asks for on email-shaped searches are unreadable through the API. No UI is drawn for them.

## Standing check (Decision Log #404 item 14)

- Top-level nodes 1,169 to 1,194 (25 new: 1 component set, 12 frames, 2 texts, 10 notes). The hash of the original 1,169 ids is unchanged (`1512219232`).
- 535 solid paints on authored nodes (the Admin Shell instance internals excluded, as in earlier passes), 0 unbound, 0 text without a text style.
- 0 overlaps with any existing top-level node, 0 among the new ones.
- Screenshots read: 1, 4, 7, 8, 9, 11 and the component set. Frames 2, 3, 5, 6, 10 and 12 were built by the same code and not viewed one by one.

## Disclosures

- One `use_figma` call failed on a bug of mine (a read-back of the wrong node). Figma rolled the whole call back; the count above (1,194) shows nothing was duplicated. I re-ran it.
- One PowerShell call printed a `NativeCommandError` from git writing "Switched to a new branch" to stderr. The branch is correct.
- Screenshots were downloaded to the session scratchpad to look at them; none are committed.

## Follow-ups (nothing fixed here)

- Build: `figma-to-code` un-hides the bar on the Users page and wires the bar. `backend-api` sets the cap, minimum length, counts and role filtering.
- Figma: whether `Admin Search Bar` should replace `Group 826` in the Admin Shell set, a shell-wide change for `figma-design-system`.
- A "Matched on" decision and the "query too short" wording once the backend minimum is known.
