# Figma pass K: incorrect-details reports screen, profile not-found state, stale notes, B-121 remainder, archive index

Date: 2026-10-18. Agent: figma-design-system / figma-screen-builder work in one session (the brief names both screen-building and retouching). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx` was changed. Branch `figma/pass-k-admin-incorrect-details-archive`, from `origin/main` `11f881d`.

Register rows touched (status lines added, original text unchanged): B-007, B-015, B-082, B-096, B-108, B-119, B-121. No new B-ID. One CLAUDE.md bullet added.

Session note: this pass was interrupted by a session limit after setup (the Figma skill was loaded, the branch was not yet created, nothing had been written to the canvas). On resume the canvas was re-read first: 846 top-level nodes, the J2 state, no pass K frame, no pass K doc, no branch. Nothing was rebuilt or duplicated. One clone artefact (a hidden `ARCHIVED — Button — Retry` carried over from the Held Investigations Load Error pattern) was found in my own Load Error frame and removed.

## 1. Admin incorrect-details reports screen (B-119)

Built from the endpoint contract in `services/api/src/modules/admin-users/admin-users.service.ts`: `GET /admin/users/incorrect-details-reports` returns `{ items: [{ userId, minorDisplayName, minorAccountStatus, guardianName, guardianEmail, consentStatus, reportedAt }], truncated }`, oldest first, capped at 200; `POST /admin/users/:id/incorrect-details-report/resolve` takes no body and returns `{ resolved: true }`, or a 404 "No open incorrect-details report for this user".

Eight frames, 1440 x 1184, on the Admin Shell instance (`Active = Users`, no action button), cloned from the pass C Held Investigations pattern so every binding is inherited. Band: x 79600 to 90940, y -6100 (checked clear of every other top-level node first).

| State | Frame | What it shows |
|---|---|---|
| List | `6737:27844` | explainer callout, table of four sample reports, a Resolve button per row |
| List, truncated | `6738:27962` | same list plus a Banner (Neutral): the first 200 open reports are shown (the `truncated` flag) |
| Empty | `6738:28144` | card: "No open incorrect-details reports" and one sentence on when one appears |
| Loading | `6738:29952` | header row and three skeleton rows, a Banner "Loading the open reports." |
| Load error | `6738:28328` | Banner (Error) and a Retry button (links to the Loading frame) |
| Resolve confirm | `6738:30173` | scrim and dialog: "Resolve incorrect-details report", Cancel / Resolve report |
| Resolve, already resolved (404) | `6738:28510` | Banner (Info) with the backend's message, the row is gone from the list: the 404 is drawn as an expected outcome (B-120) |
| Resolve, failed | `6738:28693` | Banner (Error): the report could not be resolved, it is still open |

Columns are exactly the response fields, in response order, plus an Action column: MINOR (display name), USER ID (truncated sample), ACCOUNT (status pill), GUARDIAN, GUARDIAN EMAIL, CONSENT (status pill), REPORTED, ACTION. No date of birth, no consent token and no note field are drawn (none is returned and the resolve endpoint takes no body). Names, emails, ids and dates are SAMPLE data ("Sample minor 1", `guardian1@example.com`).

Components used: Pill (account and consent status), Button (Back to users, Resolve, Retry, Cancel, Resolve report), Banner (truncated, loading, load error, 404, failed), Callout (the explainer). The dialog and the table stay local frames, as decided in Decision Log #405 item 10. Prototype links: first row Resolve opens the dialog, the dialog Cancel returns to the list, Retry opens the Loading frame (all read back).

Wording tagged `[COPY PENDING LEGAL REVIEW]` (it describes a child's account and a guardian's consent request): the explainer callout ("A guardian has said the details on a consent request are wrong. While a report is open the guardian cannot approve or start the card payment; they can still decline or withdraw. Resolving a report lets the guardian approve again. No date of birth is shown here.") and the dialog line ("Resolving clears the report, and the guardian can approve the request again. The action is recorded in the audit log."). The behaviour they state comes from B-029 and Decision Log #404 item 12; the wording is new.

On-canvas notes, using the Note component: copy pending legal review (`6738:30382`), scope open (`6738:30385`), scope open for the confirmation step (`6738:30388`, under the dialog frame).

SCOPE OPEN (also in section 9): whether resolving needs a confirmation step (the dialog is drawn as one option); which sidebar item hosts the screen; no link to User Detail; no success message after a resolve.

B-120 (apps/admin) can build from these frames.

## 2. Profile not-found state for the blocked user

Decision Log #404 / #402: a blocked user sees the blocker's profile as not found. No such frame existed (a search of frame names and of every text node for "not found", "404", "unavailable" found no profile state). The app's existing wording is `NotFoundPage`: "Page not found" with a "Back to home" link; this is what is drawn, so the state reads the same as a profile that does not exist.

| Frame | id | Notes |
|---|---|---|
| Profile — Not Found (blocked by the profile owner) — Desktop | `6738:30391` | 1440 x 320, real `header 4` navbar instance, heading and link cloned from the blocked-profile desktop frame (Montserrat, bound) |
| Community — Profile — Not Found (blocked by the profile owner) — Mobile | `6738:30526` | 390px, app bar "Profile" with the back arrow, same heading and link |
| NOTE (scope open) | `6738:30554` | generic app 404 (with the site footer, #228) or this in-profile state; the profile route has no code yet (B-082) |

No new wording was invented, so no legal tag is needed.

## 3. Stale notes updated

Each claim was verified on the canvas before the note was rewritten.

| Topic | Verified | Notes changed |
|---|---|---|
| 2FA rewired | "Can't scan? ›" (`6715:27345`, links to the manual key frame) and "Turn off" (`6715:27349`, links to Turn off) exist, mobile twins too; the enrolment chain is wired: Scan QR to Enter code, Turn on 2FA to Backup codes, I've saved my codes to 2FA is on, Done to the 2FA-on frame | `6711:27694`, `6711:27695`, `6711:27696` |
| Blocked users row exists | "Blocked users" row on Settings — Privacy desktop (`6714:28459`, links to `6705:26172`) and mobile (`6714:28468`, links to `6706:26580`) | `6705:26712`, `6706:26931` |
| Desktop Block body done | desktop Block confirmation `6655:27355` shows the consequences body; the old placeholder is hidden under `ARCHIVED — Placeholder` | `6706:26935` |
| Blocked user's view (made stale by section 2 above) | drawn in section 2 | `6706:26934` |

Other note updates:

- Design Notes frame `5644:8023`: new note "Contest notification rows — nine states, per-type icon discs (B-121)" (types, icon table, destinations, subtitle, badge, one SCOPE OPEN), plus an UPDATE line on the DL #87 note and on the copy-discipline note. The frame grew to 1999 tall; no overlap.
- The two J2 notes `6730:27844` and `6730:27853` moved below the grown feed frames (they would have overlapped) and four bullets were updated: the final-is-live destination and the winner row are closed by Decision Log #405 items 2 and 3, per-type icons and read/unread rows are now built, unverified-email accounts are closed by #405 item 4.
- Subtitle on both feeds: "… results and Contest updates." (was "… Contest wins."). Unread badge on both feeds: 14, the number of unread sample rows (was 3); the tab hugs the two digits.
- "Final week" sample finalist counts: the two archived Contest-page frames `6661:29122` and `6661:29321` sample 9 finalists (module `6661:26837` / `6661:26928`). They were NOT edited. A bullet was appended to their notes (`6664:27292`, `6664:27303`): the live carousel samples 6 finalists in 2 pages of 3 (pass J, #404 item 9), and the carousel component names ending "3 pages of 3 finalists" (`6697:26234`, `6697:27448`) are stale.

## 4. B-121 remainder: read and unread rows, per-type icon discs

Before: unread list 10 rows (5 Contest), read list 8 rows (3 Contest). After, on both feeds (desktop `5640:7815`, mobile `5643:8003`): 14 unread and 13 read rows. Every Contest event now exists in both states; the nine row variants are week opens, votes closing, week result, personal winner (`contest_win`, unchanged from #278), finalist, the final is live, final result (winners), final result (No winner this month), finalist upload reminder.

Added rows (title and destination reused from the J2 rows, so no new wording):

| Row | Desktop id | Mobile id |
|---|---|---|
| contest win [unread] | `6740:28913` | `6740:29048` |
| final result winners [unread] | `6740:28932` | `6740:29056` |
| final result no winner [unread] | `6740:28943` | `6740:29067` |
| finalist upload reminder [unread] | `6740:28954` | `6740:29078` |
| week opens [read] | `6740:28965` | `6740:29089` |
| votes closing [read] | `6740:28975` | `6740:29099` |
| week result [read] | `6740:28986` | `6740:29110` |
| finalist [read] | `6740:28998` | `6740:29122` |
| final is live [read] | `6740:29008` | `6740:29132` |

Icon disc per type (all on the green-tint disc, glyph bound to `color/text/primary`, reusing icons that already exist in the file):

| Type | Glyph | Source node |
|---|---|---|
| `contest_week_opens` | calendar (`uil:calender`) | `914:2241` |
| `contest_votes_closing` | clock (`bx:time`) | `5953:10801` |
| `contest_week_result` | bars (`carbon:chart-column`) | `6014:11154` |
| `contest_win` | trophy (`carbon:trophy`), unchanged | existing |
| `contest_finalist` | pin (`bi:pin-fill`) | `6673:31163` |
| `contest_reveal` (the final is live) | play (`play-circle`) | `2896:4722` |
| `contest_final_result` (winners and no winner share the type) | trophy (`mdi:trophy`) | `2072:5620` |
| `contest_upload_reminder` | video (`bx:video`) | `2025:8275` |

Every existing Contest row's glyph was swapped to its type icon too (8 rows per breakpoint). Destinations on the new rows are the ones drawn in pass J2 and fixed by #405 item 2 (desktop and mobile frame ids as in the J2 note); the original `contest_win` row keeps no destination.

Two defects found and fixed while building: the play glyph carried 75% opacity from its source (looked grey), set to 100% on the copies; replacing a title replaced its bold "Contest" / regular rest styling, restored on every Contest row title.

Audit of the Contest rows: 0 unbound paints. The only unbound paints were the non-rendering boolean-operation input shapes inside the existing trophy glyph (disclosed in #279); they are now bound to `color/text/primary` on the four `contest win` rows.

Not done (SCOPE OPEN, in the Design Notes note): the empty-state body ("… or you win a Contest round") and the coming-soon line ("… deeper Bants and Contest activity — are on the way") were not changed; both now understate Contest coverage.

## 5. Desktop day-1 Between Weeks frame

`6716:27347` and its note `6717:27474` moved from x 72989 (far right of the canvas) to x 28700, y 8650, next to the mobile twin `6716:27491` (x 28044, y 9700). The slot was chosen by scanning for the nearest free 1440 x 1444 area with a 60px margin; no overlap with any frame (checked after the move). The frame itself was not edited.

## 6. Legacy profile frames: archived none

Brief: confirm each of `1455:4362`, `1455:6626`, `5702:8250`, `5778:8490` has a replacement (own, other user and media, desktop and mobile) among the pass H profile frames, and archive only those that do.

The pass H profile frames are: desktop `6707:26727` / `6707:26938` (own profile, pinned final entry before and after the reveal), desktop `6707:26595` (other user, blocked by you), mobile `6709:26922` / `6709:27056` (own profile, pinned final entry, cloned from `5702:8250`), mobile `6706:26750` (other user, blocked by you). The two pinned desktop frames show the Posts tab with a finalist-only pinned entry (verified on a screenshot).

| Frame | What it is | Replacement among pass H frames | Archived |
|---|---|---|---|
| `1455:4362` User's post feed — Other User variant, desktop (legacy absolute layout, 2337 nodes) | the plain other-user profile | none: `6707:26595` is only the blocked state | no, stays visible |
| `1455:6626` User's Media feed — Own profile variant, desktop (legacy absolute layout) | the own profile on the Media tab | none: the pinned frames show the Posts tab for a finalist only | no, stays visible |
| `5702:8250` Community — Profile — Own — Mobile (already auto-layout) | the general own profile | none: the pass H mobile frames are finalist-only states cloned from it; it is also the target of the mobile drawer's "Signed in as" link (`I5874:10690;5870:10697`, a NAVIGATE) | no, stays visible |
| `5778:8490` Community — Profile · Media — Mobile (already auto-layout) | the own profile on the Media tab | none | no, stays visible |

A replacement would be needed first: a plain other-user desktop profile on auto-layout, a general own desktop profile (Posts, Media and Saved tabs) on auto-layout, and general mobile own and Media frames; and the drawer link would have to be re-pointed. Until then archiving would remove the only frame for those states. See Decision Log candidate 12.

## 7. Archive index

`docs/figma-archive-index.md`: every node whose name starts with `ARCHIVED` (398 at the time: 57 top-level frames with position, size and what replaced them; 341 nested hidden originals grouped by host frame with every id), plus what the index does not cover and four findings.

## 8. Audit

- Top-level nodes: 846 before, 860 after = 14 new (8 admin frames, 2 profile not-found frames, 4 notes). The ids of the original 846, in order, hash to the same value before and after (djb2 `228920698`). Nothing was deleted from the canvas, except one clone artefact inside my own new frame (section above).
- Whole-page node count after: 139,446; the 14 new top-level nodes hold 1,409 of them. A per-top-level-node `findAll` snapshot was NOT taken before the first write (only the id hash was), so a before count per frame does not exist for this pass. After counts of the existing nodes that were edited: feed desktop `5640:7815` 355, feed mobile `5643:8003` 269, Design Notes `5644:8023` 39, day-1 desktop `6716:27347` 123, legacy profile frames `1455:4362` 2337, `1455:6626` 2292, `5702:8250` 67, `5778:8490` 47 (the last four were not written to).
- Paints: the six profile/note frames and all notes 0 unbound. The eight admin frames show 38 unbound paints each, all inside the Admin Shell instance itself (`Rectangle 223` and the shell's icon rectangles, the shell's pre-existing debt); everything authored in them is bound. Contest rows 0 (section 4).
- No `brand/green-tint-28`, no new colour, Light mode only. Pill, Button, Banner, Callout used as instances.
- Overlaps: the 14 new nodes, the two moved Contest nodes, the moved J2 notes and the grown Design Notes frame were each checked against every visible top-level node: no overlaps. The two feed frames grew (desktop 2130 to 2922, mobile to 2732) by auto-layout; the notes under them were moved first.
- Not verified: no real-browser or prototype playback; the whole-canvas `get_metadata` pull was not used (standing check, Decision Log #404 item 14).

## 9. Decision Log candidates

1. Which sidebar item hosts the incorrect-details screen. Drawn under Users (the endpoints are `/admin/users/...`); Held Investigations and Flagged Images sit under Moderation.
2. Whether resolving needs a confirmation step (B-119 left it open). The endpoint has no body, so no note field exists; the dialog is one option.
3. Whether the screen shows raw API values for account and consent status (`active`, `pending`, `declined`) or labels; labels are drawn.
4. A success message after a resolve (the endpoint returns `{ resolved: true }`; the row leaves the list).
5. A link from a row to User Detail (B-109) and whether the DOB-correction flow is reached from here.
6. Whether a restricted-pending minor's name should show in full in a list read by moderators and superadmins (it is the display name the endpoint returns).
7. Profile not-found for a blocked user: the generic app 404 with the site footer (#228), or an in-profile state; and that the state must be identical for a user who does not exist.
8. Icon choices for Contest notifications: pin for finalist, play for the reveal, clock for votes closing, two different trophy glyphs for `contest_win` and `contest_final_result`. Founder to confirm, or ask for new glyphs.
9. Notification Centre empty-state body and coming-soon line now understate Contest coverage.
10. The Unread badge shows the sample count (14); the real value comes from `GET /notifications/unread-count`.
11. The carousel component names still say "3 pages of 3 finalists" (it is 2 pages).
12. Archiving the four legacy profile frames needs replacements first: plain other-user desktop, general own desktop (Posts, Media, Saved), general own mobile and Media mobile, and a re-pointed drawer link. Which agent builds them.
13. Process: every archive step should add a row to `docs/figma-archive-index.md` in the same PR, so the trail is not rebuilt from the canvas later.
14. Two archive names cite deleted ids (`2067:3006`, `2067:3176`); rename them to the real successors, or leave.

## 10. Not done, and why

- No archive of the four profile frames (section 6).
- No change to the empty-state copy (outside the brief, section 4).
- The pass E / pass F1 Contest frames and the J2 rows' destinations were not touched beyond the notes.
- The `.docx` Decision Log and the legal copy were not edited. Counsel review of every `[COPY PENDING LEGAL REVIEW]` string is still pending.
