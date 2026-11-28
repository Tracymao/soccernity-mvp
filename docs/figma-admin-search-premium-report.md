# Figma: admin Search family restyled to the premium design (Decision Log #619)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed. Source of truth: `SearchPage.tsx`, `search.css`, `AdminSearchBar.tsx`, `adminSearch.ts` and the `admin-search` service at `origin/main` `1fbf62b`.

## Values, before and after

| Item | Before | After |
| --- | --- | --- |
| Page title | Inter Semi Bold 28, y45 | Montserrat SemiBold 24 at (301,129) |
| Search bar | (279,186), white, 1px border | (302,182) 740x44, radius 8, green tint 12%, no visible border (Focused keeps its navy edge) |
| Content | x300 y45 with a spacer, 1100 wide, gap 24 | x301 y258, 1098 wide, gap 20 |
| Cards and tables | radius 10 | radius 12, no stroke or shadow; cards padding 20, gap 12 |
| Table header | 43 high, uppercase | 40 high, green tint 12%, sentence case 12/500, navy 70% |
| Rows | 54 high, 13px | min 52, 1px hairline (navy 15%), 14/22 |
| Pills | 21 high | 24 high, 12/500, full radius |
| Row buttons | 34 high, radius 6, 13 Semi Bold | 32 high, radius 8, 5/12, 13 Medium |
| Try again | 34 high | 40 high, radius 8 |
| Banners | radius 10 | callout: radius 6, green tint, 3px bar (alert bar on load error), 12/14, 13/20 |
| Group titles | 16/24 | 18/24 |

The page has no select and no invalid-input styling in code, so no alert border is drawn. All fills and strokes on rebuilt layers are bound to variables.

## Frames

Rebuilt (frame ids kept; old layers hidden as "ARCHIVED Content" inside each frame, moved below it): `6927:35930`, `6927:36077`, `6927:36225`, `6927:36374`, `6927:36526`, `6927:36648`, `6928:36566`, `6928:36772` (now 1416 high), `6928:37148`, `6928:37372`, `6928:37497`, `6928:37621`, `6947:41433`, `6947:41607`. All 1440 wide; all others 1184 high. Row prototype links were copied to the new rows.

Tokens only: `6937:38451` (13, column reference), copy unchanged, headers and row labels now sentence case, height 1102 to 1175.

## Archived (hidden, "ARCHIVED " prefix, moved to y + height + 400; nothing deleted)

| Frame | Reason |
| --- | --- |
| `6938:38451` (14, by target username and display name) | `6947:41607` is the same state (query "nelson", the same two reports) with the newer "Reason category" column. "Target display name" is not a `matchedOn` key the server returns. |
| `6938:38813` (15, by reason category) | `6947:41433` is the same state (query "impersonation", the same two reports) with the newer column. |

No other frame linked to either one.

## Kept after doubt

- `6928:36772` (8, "layout study"): the only frame showing all six groups, including Staff and Media review. Updated to the shipped columns.
- `6927:36648` (6, moderator): the code's idle state has no per-role list, so this now looks the same as frame 1. It was outside the layout-study archive check, so it stays.

## Changed to follow the code

- Idle frames (1, 2, 3, 6): the per-group list is gone; the page draws only the title and one sentence.
- Helper: the full two-sentence line everywhere; frame 3 adds "Press Enter to search."
- Reports columns: Report, Type, Reason category, Status, Severity, Flags, Matched on. Staff gains Email. Media review gains Status and Reports.
- Users cells read "Display name (@username)". Dates have a two-digit day.
- Matched on: "Email address (exact)" replaces "Sender email (exact)"; "Target username" replaces "Target display name".
- "[N]" placeholders now read 3 (minimum length) and 20 (group cap). The "(layout study…)" text left the frame 8 summary.
- Submitting bar: the spinner replaces the search icon.
- Report ids, severities, people and the "Pending" media status are sample data.

## Carry-over and links

- "Review due" pill `7417:71009` on `6921:35449`: 89x26 to 89x24, sentence case.
- Eight rows on frame 13 linked to "Edit admin" (`6907:34127`). Those links were removed.
- Remaining links on touched frames: search states in order, User Detail, Enquiry Detail, Report Detail, Articles, Edit admin (staff row), Media review item. The video row opens the Picture item (unchanged from before; no change made).

## Checks

- Top-level count 2028; id hash (djb2-xor, ids joined with no separator, first 2028 excluding `7230:71662`) 1857274486. Both match the baseline.
- Queue content `5794:8710` 1100x620; Report Detail Content `5796:8710` 1098x1282; Appeal Review Content `5796:8828` 1098x1455.
- Touched frames: 1440 wide, 1184 or higher (frame 13 exempt), no overlaps, only unbound solid fill is "Rectangle 223", no text under 12px, no uppercase label, no "[COPY PENDING", one search bar (none on frame 13).

## Open for the code PR and the founder

- The search bar change is an override on these frames only. The `Admin Search Bar` component and `AdminSearchBar.css` (shared by every admin page) are still white with a 1px border. Decide whether the code changes everywhere or the frames go back.
- The code wraps the helper at 740px; the frames keep it on one line so content stays at y258.
- Media review's fixed CSS columns leave the Review button short of the table's right edge; the frame shows that as shipped.
- Frame 9 draws 6 sample rows although its pill reads "20+".
- Frame 13 copy is stale against the code: "Reason" (now "Reason category"), "Sender email (exact)", "Target display name", "[N]".

## Scope note

The brief says 22 frames in scope but its list holds 17 ids. All 17 were handled (14 rebuilt, 1 tokens only, 2 archived), plus the one pill on the User detail frame. If five more were intended, name them.
