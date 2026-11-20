# Figma W8: Bants room page, open-forum corrections (B-117) and room status and topics controls (B-071)

Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, Decision Log, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Date: 2026-11-07. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, 390 px mobile and 1440 px desktop. Founder statement: Decision Log #472 (B-071 is built now) and #404 item 10 (B-117: a Bants room is an open thread; anyone eligible posts and comments without joining; "join" stays only as the My Bants bookmark). Everything marked "default" below is veto-able.

Written for: the `figma-to-code` and `backend-api` agents that build B-071 and the open-forum change next, and the founder who reviews the frames.

## 1. What the code allows (read before drawing)

From `services/api/src/modules/banter/` on `origin/main` `453f878`:

- **Status:** `PATCH /banter-rooms/:id/status` `{ status: 'active' | 'inactive' }`. Room creator only (404 for a missing room, then 403 for anyone else). Guards: sign-in and guardian consent. A moderator can also set a room inactive through the report queue (action `room_deactivated`); there is no moderator reactivate action.
- **Topics:** `POST /banter-rooms/:id/topics` `{ names: string[] }` (1 to 5 names per call, 2 to 60 characters each, free text, find-or-create, case-insensitive). Room creator only (404 then 403). Guards: sign-in, guardian consent, verified email. `GET /banter-rooms/topics` lists the catalogue (20 per page, cursor). **There is no endpoint that removes a topic.**
- **The room read** (`GET /banter-rooms/:id`) returns status and the topic list, so every viewer can see the dot, the chips and (new, drawn here) an Inactive label.
- Under-16 accounts cannot open any Bants screen (whole controller blocked, Decision Log #346).
- `postToRoom` on main already has no membership check (B-117 backend is in). The register notes that say it still calls `assertRoomMembership` are stale; not edited here.

So the controls are drawn for **the room creator only**. Everyone else gets read-only chips and the status dot.

## 2. What was built

76 new top-level nodes on page `0:1`: 36 frames, 36 labels (48 px above each frame), a band title, a description line and 2 note frames. They sit in one clear band below all existing content (existing content ended at y 257,787; the band is x 51,045 to 57,105, y 258,200 to 266,310). Top-level nodes went from 1,535 to 1,611. Nothing was deleted, renamed, archived or edited.

Mobile frames are 390 x 780 clones of `5651:8253` (Bants — Post Page with Comments — Mobile, Inter). Desktop frames are 1440 x 760 and are slim rebuilds of `2256:11081` (Montserrat): the real `header 4` navbar instance, a back link, and the centre column (room header card, comment box, two comments). They do not carry the side rails of the original.

### Mobile (row 1 y 258,400; row 2 y 259,500; columns 450 px apart from x 51,045)

| Id | Frame | State |
|---|---|---|
| M1 `6998:54688` | Viewer, not in My Bants | open-forum correction: "Join room" becomes "Add to My Bants" (outline); read-only topic chips; comment box open |
| M2 `6999:54768` | Viewer, in My Bants | "In My Bants" (tint, check) |
| M3 `6998:54762` | Creator, controls visible | kebab (room menu) beside the title; chips plus a dashed "Add topic" chip |
| M4 `6999:54842` | Creator, room menu (deactivate) | menu with "Deactivate room" |
| M5 `6999:54930` | Creator, room menu (reactivate) | inactive room, menu with "Reactivate room" |
| M6 `6998:54845` | Deactivate, confirm | scrim and dialog |
| M7 `6999:55020` | Deactivate, saving | button "Deactivating…", Cancel dimmed |
| M8 `6999:55112` | Deactivate, error | error banner, "Try again" |
| M9 `6999:55207` | Creator, room inactive | grey dot, "Inactive" pill under the title |
| M10 `6999:55292` | Viewer, room inactive | same, no controls |
| M11 `6998:54937` | Add topics, default | bottom sheet: field, existing topics, "Show more topics", disabled Add |
| M12 `6999:55368` | Add topics, one typed and one picked | Add enabled, "Add 2 topics" |
| M13 `6999:55486` | Add topics, saving | fields dimmed, "Adding…" |
| M14 `6999:55604` | Add topics, could not save | error banner, "Try again" |
| M15 `6999:55725` | Add topics, name not accepted | field border alert, "Use 2 to 60 characters." |
| M16 `6999:55842` | Add topics, existing topics loading | skeleton chips |
| M17 `6999:55949` | Add topics, existing topics did not load | banner, "Try again", typing still possible |
| M18 `6999:56053` | Creator, no topics yet | "No topics yet." plus Add topic |
| M19 `6999:56133` | SCOPE OPEN, remove a topic | chips with a remove cross; banner says no endpoint exists |

### Desktop (rows at y 261,000 / 261,900 / 262,800 / 263,700 / 264,600; columns 1,540 px apart from x 51,045)

D1 `7002:55068` viewer, not in My Bants · D2 `7002:55222` creator controls · D3 `7002:55385` room menu (deactivate) · D4 `7002:55553` deactivate confirm · D5 `7002:55725` deactivate saving · D6 `7002:55897` deactivate error · D7 `7002:56072` inactive room, menu (reactivate) · D8 `7002:56242` viewer, inactive · D9 `7002:56398` add topics default (popover under the "Add topic" chip) · D10 `7002:56591` typed and picked · D11 `7002:56786` saving · D12 `7002:56981` could not save · D13 `7002:57179` name not accepted · D14 `7002:57373` existing topics loading · D15 `7002:57557` existing topics did not load · D16 `7002:57738` no topics yet · D17 `7002:57898` SCOPE OPEN remove a topic.

### Title and notes

Band title `7003:56921`, description `7003:56922`, SCOPE OPEN note for the controls `7003:56923`, open-forum audit note `7003:56935`.

## 3. Open-forum audit (B-117): every Bants frame, changed or left

Searched the visible text of 17 existing Bants frames for join, member, post and comment wording.

**Changed (new clones; the originals are untouched):**

- `5651:8253` Bants — Post Page with Comments — Mobile: a green "Join room" primary button. Clones M1 and M2 replace it with the My Bants bookmark ("Add to My Bants" outline, "In My Bants" tint). M3 to M19 build on the same clone. The comment box is never gated and says nothing about joining.

**Checked and left as they are:**

- Desktop post page `2256:11081`: no join control; "Write a comment…" is open. Correct as is.
- Desktop list and search: `2256:6802`, `2459:5234`, `2459:7671`, `2459:10083`, `2459:12447`, `2448:2179`. Mobile list and search: `5650:8074`, `5650:8161`, `5650:8221`, `5650:8314`, `5803:8876`, `5803:8917`, `5980:10881`. No join wording. The green and grey status dots in the list rows already match room status.
- Create topic frames `2355:2137`, `2256:8925`, `5651:8166`, `5651:8207`: no join wording.
- `2459:10077` (Banter post menu setting): items Reactivate, De-activate, Delete. Reused as the model for the room menu here (Reactivate and Deactivate), Delete not drawn (see section 5).

**Findings, not changed:**

- `5651:8207` says "this room is open to under-18s". Accounts under 16 cannot use Bants at all (#346), so the sentence overstates access. Needs a founder or counsel call.
- The create frames draw no scope choice, but `POST /banter-rooms` requires a scope type (club, league, country or topic; club also needs a club the person has joined).
- For the later figma-to-code PR: `apps/web/src/pages/BanterRoomPage.tsx` still shows the comment box only when `room.joined` and the line "Join this room to post in it." (around lines 234 to 265, and its header comment). The open-forum model removes both.

## 4. Requested item to frames

1. Controls for exactly the audience the code allows: creator only; M3 to M19, D2 to D17. Viewer frames: M1, M2, M10, D1, D8.
2. Open-forum audit: section 3.
3. B-071 controls: status (menu, confirm, saving, error, inactive look: M4 to M10, D3 to D8), topics (chips, add from the list, empty, loading, error, saving: M3, M11 to M18, D2, D9 to D16), remove (M19, D17, SCOPE OPEN only).
4. Placement in a clear band: section 2.
5. This file and the standing check: section 7.

## 5. Decisions made while drawing (defaults, veto-able)

- Status control lives in a room menu (kebab beside the title) because the existing design already does this (`2459:10077`). Topics control lives in the chip row (a dashed "Add topic" chip), where the chips are.
- Deactivate asks for confirmation; Reactivate does not (it is reversible and low risk).
- New "Inactive" pill next to the grey dot, so the state is not colour only.
- Wording: "Add to My Bants", "In My Bants", "Deactivate room", "Reactivate room", "Add topics". Existing menu wording was "De-activate"; shortened to match the rest of the app.
- Mobile uses Inter and desktop uses Montserrat, matching the frames each one extends. Components are local frames in the file's own tokens (the F2 admin components are Inter and admin-styled, so they were not used).
- Delete is not drawn in the room menu (no endpoint).
- Nothing is tagged `[COPY PENDING LEGAL REVIEW]`: a room's status and topics make no promise about safety or data.

## 6. Undecided points (on the canvas as SCOPE OPEN, not guessed)

1. Remove a topic: no endpoint exists.
2. Room delete: the old menu lists Delete, no endpoint.
3. What "inactive" does: nothing else reads the field, so posting and reading are not blocked; the design only changes the dot and the pill.
4. A moderator-deactivated room can be reactivated by its creator (no moderator reactivate action); the creator would see "Reactivate room" in that case.
5. Topic list paging, free-text names and the 5-per-call limit are drawn as a helper line and "Show more topics".
6. A refused request (consent, verified email) uses the generic error; no separate state.
7. Under-16 accounts and the "open to under-18s" sentence (section 3).

## 7. Standing check (Decision Log #404 item 14)

- Page `0:1` top-level nodes: 1,535 before, 1,611 after (+76: 36 frames, 36 labels, band title, description, 2 notes). A hash of the original top-level ids was taken before the first write (4258250208) and is identical after (the 1,535 original ids, same order); nothing deleted.
- 1,908 solid paints and 375 strokes on new nodes (instance internals excluded): 0 unbound. All text is Inter or Montserrat. 0 overlaps between the new top-level nodes and 0 overlaps with existing content in the band's bounding box.
- Inherited, not counted: the `header 4` and `header 4 — mobile` navbar instances keep their own known avatar `IMAGE` fill debt.
- Screenshot comparison by eye: M3, M4, M5, M8, M10, M11, M13, M15, M17, M19, D2, D6, D10, D17. Not individually viewed (same builder code): M1, M2, M6, M7, M9, M12, M14, M16, M18, D1, D3 to D5, D7 to D9, D11 to D16. Defects found and fixed: the Inactive pill beside the title made the title wrap on mobile (moved under the title); the SCOPE OPEN banner covered a comment on M19 (moved below the list). One build call failed on a plain-frame layout error and rolled back cleanly; the rerun had no leftovers.

## 8. Follow-ups for the next docs PR (not edited here)

Status lines on B-071 and B-117 (Figma half built, this file), and on B-042 and B-054 (audit result: only `5651:8253` carried join wording; B-054's frame `2256:11081` is correct). The stale register notes about `assertRoomMembership` can be corrected in the same pass.
