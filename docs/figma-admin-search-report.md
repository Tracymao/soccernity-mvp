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

---

# Pass 2: search on every admin screen, resolved columns, report search and the Audit log (Decision Log #464)

Branch `design/b114-search-everywhere`, cut from fresh `origin/main` `29df380` (the docs PR for Decision Log #464, PR #604, is merged and was read first). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx or `docs/build-register.md`. Written for: `figma-to-code` and `backend-api`, and the founder who verifies it.

Founder decisions this pass draws (2026-11-02, #464): (1) the search bar is on every admin screen; (2) every column the search frames draw is built; (3) reports are searchable by reference, target username or display name and reason category, never by the report description; (4) the audit log becomes readable: a superadmin reads every row, any other admin only the rows of their own actions. Everything below that is not in those four is a default for the founder to veto, and the canvas says so (notes `6942:39697` to `6942:39721`).

## A. The bar on every admin screen

- **Where it lives.** An `Admin Search Bar` instance (component set `6926:35951`, State=Idle) is now a child of `Frame 5768` in all 11 variants of the Admin Shell set `6014:12948`, at index 0 (ids `6934:37286` to `6934:37322`). The old bar (`Group 826`) is hidden in each variant, not deleted. `Frame 5768` went from 1021 x 41 to 1021 x 44 to match the bar (the Create button stays 41 tall, top-aligned).
- **Reach.** All 155 shell instances sit directly in their page frames, so every visible admin screen got the bar from the shell alone: **140 of 140 visible shell frames show a bar** (checked by script). Pre-session screens (sign-in, enrolment, code prompt, recovery, the user-side screens) have no shell and no bar on purpose: there is no session.
- **No hand-copied pieces.** Two frames had their shell header band removed in the instance (`5796:8635` Report Detail & Action, `5796:8753` Appeal Review), so the shell cannot supply a bar. Each got a standalone `Admin Search Bar` instance at the shell position (`6934:37838`, `6934:37842`).
- **The 12 search frames** (1 to 12) carry their own state-specific bar, so the shell's nested bar is hidden on those instances (an instance override); their standalone bars and prototype links are unchanged.
- **Clearance spacers (14 frames).** In 14 frames content already sat under the shell bar band (the ghost green band behind the cards in Enquiry Detail, Report Detail and Appeal Review). A visible bar would have made that a real overlap, so a `Spacer — clears Admin Shell search bar` frame was inserted in each `Content` frame before the first card, so content starts at y 252 or lower: Enquiry Detail `6878:31198`, `6878:31438`, `6879:31526`, `6879:31599`; Report Detail `5796:8635`, `6672:27278`, `6672:27349`, `6672:27420`, `6672:28898`, `6870:30620`, `6878:31683`; Appeal Review `5796:8753`, `6672:29059`, `6870:30808`. Nothing deleted. Re-surveyed after: no visible collision (the two nodes the script still flags are hidden ARCHIVED duplicate callouts; the visible callout sits at y 266).
- **Every frame changed.** The 11 shell variants; the 14 spacer frames (two of them with a standalone bar); the 12 search frames (nested bar hidden; frames 7 and 8 also gained a column, see B). All other frames only inherit the shell and are listed in the appendix. The 25 archived hidden contest frames also inherit the new Activity row and the bar; nothing else about them changed.
- **Not changed, flagged.** On newer frames the shell bar starts at x 279 while the content column starts at x 300 (21 px). This is the shell's own pre-existing position (the legacy bar was there too) and is left as is.

## B. Resolved SCOPE OPEN notes and the columns

- **The columns were already drawn.** Frame 8 already had MATCHED ON, REASON, SOURCE, UPLOADER and TWO-FACTOR (the first report did not list them). What was missing was group and role per column. **New frame 13** `6937:38451` is the reference: for each column, its group, who sees it, the existing list that already shows the same column, what it shows and what it never shows. Every column traces to an existing list: Moderation queue (Reason), Contact enquiries list (Source), Media review queue (Source, Uploader), Staff list (Two-factor).
- **SOURCE on Contact enquiries** (Signed-in or Guest) was the one column an existing list shows that the search rows did not; added to the Contact enquiries cards in frames 7 and 8 (SUBJECT narrowed 220 to 120 to make room).
- **The `[N]` placeholders** (frame 5 minimum length, frame 9 cap, count pills) stay as placeholders the backend fills. Frame 13 has a second table, "Placeholders the backend fills": where each is drawn, what fills it, and the backend default today (3 characters, 20 per group; both adopted defaults, veto-able).
- **Role and vetting.** Frame 13 states that REASON and UPLOADER rows about a minor appear only for a child-safety-vetted admin; TWO-FACTOR is superadmin only; the others follow the group's role.

## C. Report search results

Two layout-study frames cloned from frame 8 and trimmed to the Reports group: **14** `6938:38451` (query "nelson": matched on Target username, Target display name) and **15** `6938:38813` (query "impersonation": matched on Reason category). Columns REPORTED, TYPE, REASON, STATUS, MATCHED ON, Review. The row shows the target by public name; the report description is never shown or matched. Reference matching is frame 8's existing "Report ID" row.

## D. Audit log (two variants, four states each)

All 1440 x 1184, light, built from the Contact enquiries list frame (filter card, table, empty card, error banner), so they share its components. Titles: **Audit log** (superadmin) and **My activity** (every other admin).

| Frame | Audit log (superadmin) | My activity (other admins) |
|---|---|---|
| 1 List | `6939:39109` | `6939:39539` |
| 2 Empty | `6940:38937` | `6940:39550` |
| 3 Loading | `6940:39127` | `6940:39724` |
| 4 Load error | `6940:39356` | `6940:39925` |

- **List.** Superadmin columns: TIME, ACTOR, ACTION, TARGET TYPE, TARGET, NOTES; filters Action kind, Actor, From, To. My activity: the same without ACTOR and without the Actor filter (every row is the admin's own). TARGET is a link (underlined, prototype `NAVIGATE`) to the existing detail frames: Report `5796:8635`, Staff `6907:34127`, Enquiry `6878:31198`, Media `6852:30003`, User `6647:25540`; "Email search" has no target. Sample action names come from the backend list (`report.actioned`, `user.status_updated`, `admin_user.two_factor_reset`, `contact_enquiry.escalated`, `media.rejected`, `admin.search_performed`, and so on).
- **Absent rows.** A row about a minor or a guardian notice is simply not drawn for an admin who is not child-safety vetted. No frame carries "hidden" wording, and the empty state reads only "No activity yet" ("Actions taken by admins will appear here." / "Your actions will appear here."), so it does not hint that rows are missing.
- **Loading** uses skeleton bars aligned to the columns; **Load error** reuses the existing Error Banner ("Couldn’t load the audit log" / "Couldn’t load your activity", "Check the connection and try again.").
- **Navigation, every role.** A new nav row **Activity** (after Media) was added to all 10 shell variants, and a new variant **`Active=Activity`** (`6935:38528`) highlights it; the shell set was refitted to 16,940 wide. One nav label for every role because the shell has no role variants; the page title differs. The icon is a pulse line drawn as a vector with strokes bound to `color/text/primary` and `color/text/on-navy`.

## E. Wording defaults for the founder to veto

Nav label "Activity"; titles "Audit log" and "My activity"; filter labels "Action kind", "Actor", "From", "To" and their helper lines; empty-state lines; error titles; action-name labels ("Report actioned", "Two-factor reset", "Enquiry escalated", and so on); the MATCHED ON values; the note texts. None is a legal or safety promise, so **nothing is tagged `[COPY PENDING LEGAL REVIEW]`**.

## F. Still open (recorded on canvas, not decided)

- A reason category does not exist yet on a report (free text only); the REASON column's sample values are illustrative (#464 open point 3).
- Display-name matching can match a real name, including a minor's; how that is shown is the backend's and the vetting rule's.
- Whether long audit notes (some carry an admin's reason) are shown in full, shortened, or only to a superadmin.
- Whether `admin.search_performed` rows appear in the list (default: yes, kind and count only).
- Not drawn: paging ("Load more"), a row detail panel, export, how long the log is kept, how a row is judged to be about a minor when the target is anonymised or purged, a filtered-empty state, a minor-aware example row (an absent row cannot be drawn).
- The 12 search frames now have two bars in structure (shell copy hidden, own bar shown). If the founder prefers one, the own bars can be deleted and the shell bar's State set per frame.

## G. Standing check (Decision Log #404 item 14)

- Top-level nodes 1,194 (the count after the first pass) to **1,216**: 22 new (frames 13, 14, 15; 8 audit frames; 1 section title; 1 description; 9 notes). All 22 are the last 22 page children. **No before-hash was taken for this pass** (a gap in my procedure): the 1,194 earlier ids were counted, not compared with a stored hash.
- 550 solid paints on authored new nodes (Admin Shell instance internals excluded): 0 unbound. 66 on the new shell additions (bar instances and Activity rows): 0 unbound.
- 0 overlaps of any new top-level node with any other top-level node.
- Screenshots read: both roles' list, empty, loading and error states (sampled across both), frames 7, 13 and 14, the Users and Enquiry Detail frames, the Appeal Review base frame, and the `Active=Activity` variant. Frame 15 and the other Report Detail / Appeal Review frames were built by the same code and checked by the collision survey, not viewed one by one.

## H. Disclosures

- A first build call for the audit frames failed on a wrong prototype-reaction shape (it needs `transition: null, resetVideoPosition: false`). Figma rolled the whole call back (page count unchanged at 1,197); I re-ran it.
- Cloning the `Active=None` variant dropped the `Show Action Button` and `Action Label` bindings (the known clone gotcha), so the Create button showed on the first Audit log frames. I re-bound them on the Activity variant and confirmed it hidden on all eight frames.
- One read-only script threw on my own code (a `.replace` on an undefined value); a `python -I` check for a docx module failed with `ModuleNotFoundError` and changed nothing; one `cat >>` append failed on a shell quoting error and wrote nothing; `git checkout -B` set the upstream to `origin/main` and I unset it.
- **The shared checkout was switched to another session's branch (`backend/b283-delete-rejected-media`, with uncommitted `services/api` edits) while I worked.** None of those edits is mine and none is in this PR; I did the docs work in my own worktree (`soccernity-b114-everywhere`) and committed only the two docs files.
- Screenshots were downloaded to the session scratchpad to look at them; none are committed.

## I. Follow-ups (nothing fixed here)

- `figma-to-code`: remove `hideSearch` where it hides the bar; build the Activity nav row and the Audit log / My activity screens against the new endpoint; the new columns.
- `backend-api`: the audit-log read endpoint with the reader rule and the vetting filter; the search fields (MATCHED ON, REASON, SOURCE, UPLOADER, TWO-FACTOR) and report search by target name and reason category.
- `figma-design-system`: whether the shell should offer role variants for the nav label; the 21 px bar/content offset.

## Appendix: visible shell frames that now show the bar

Counts by shell variant: None 24 (including search frames 1 to 12, frames 14 and 15, the two-factor profile frames and Admin Profile), Dashboard 1, Articles 2, Users 30, Moderation 35, Categories 2, Contest 18, Competitions 2, Media 4, Settings 14, Activity 8 (the new frames). Total 140 visible; 25 archived hidden frames carry the shell too and were not changed.

Users (30): `6921:36445`, `6921:35655`, `6921:36121`, `6921:35894`, `6921:35449`, `6737:27844`, `6649:25217`, `6738:28510`, `6921:35065`, `6752:30141`, `6649:24462`, `917:218`, `6647:25540`, `6920:34766`, `6738:27962`, `6921:36281`, `6738:28144`, `6649:25721`, `6738:28328`, `6752:29980`, `6649:24714`, `6738:29952`, `6649:25463`, `6649:24980`, `6647:25789`, `6649:25952`, `6921:34878`, `6738:30173`, `6738:28693`, `6921:35255`.

Moderation (35): `6878:31438`, `6672:27420`, `6852:30658`, `6870:30620`, `6851:30038`, `6876:30850`, `6879:31526`, `6852:30985`, `6672:28898`, `5796:8753`, `6852:30323`, `6876:31297`, `6647:23351`, `6879:31599`, `6876:31513`, `6878:31683`, `6647:25320`, `6870:30808`, `6647:23603`, `6852:30003`, `6851:30333`, `6672:29059`, `6647:24566`, `6647:25103`, `6647:24833`, `6878:31198`, `6851:29675`, `6672:27278`, `5794:8635`, `6672:27349`, `5796:8635`, `6647:24060`, `6852:31327`, `6647:23831`, `6647:24318`.

Contest (18): `6838:29547`, `6645:22922`, `6646:22745`, `6644:23174`, `6644:22559`, `6646:23984`, `6643:21973`, `6646:23765`, `6646:23097`, `6645:22444`, `6645:22705`, `6646:24345`, `6644:22852`, `6646:23419`, `6643:21602`, `6644:21820`, `6644:23391`, `6644:22188`.

Settings (14): `6907:34127`, `1658:2303`, `6902:33820`, `6908:34466`, `6909:34859`, `6908:34407`, `1658:2456`, `5403:7205`, `6908:34249`, `6902:33532`, `1658:2592`, `6902:33682`, `6902:33251`, `6902:33382`.

None (24): `6928:37621`, `6902:32811`, `6938:38813`, `6928:37148`, `6938:38451`, `6927:36225`, `6927:36077`, `6928:37497`, `6906:33959`, `6927:36648`, `6902:32691`, `6906:33808`, `6906:34113`, `6902:32565`, `6902:32956`, `6928:36566`, `6927:36526`, `6928:36772`, `6927:35930`, `6902:33104`, `6906:33681`, `6927:36374`, `6928:37372`, `5403:7327`.

Dashboard `110:5`; Articles `124:313`, `123:56`; Categories `138:93`, `128:488`; Competitions `5569:7813`, `5566:8033`; Media `396:442`, `917:24`, `916:2362`, `361:553`; Activity `6940:39724`, `6940:38937`, `6940:39127`, `6940:39550`, `6940:39356`, `6940:39925`, `6939:39539`, `6939:39109`.
