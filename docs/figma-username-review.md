# Figma: the revoked-username review route (B-139 part c, Decision Log #467)

Pass `design/b139-username-review`, 2026-11-03. Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.

Written for: the figma-to-code agent (web and admin) and the backend agent building the route, plus the founder reviewing wording.

## 1. What was decided (Decision Log #467, read from the merged docs PR #624)

A revoked user can ask once, within 30 days of the revocation, for a review (optional message of up to 500 characters). A DIFFERENT moderator or superadmin decides (for a minor's account only a child-safety-vetted admin; if the revoker is the only eligible admin the request waits). Two final outcomes: REINSTATE (the old username returns, the record is removed) or DECLINE (record and permanent bar stay; internal reason of at least 10 characters). The user is told by the status on the create-profile screen and an in-app notification, no new email. An admin "Username reviews" list with a decide dialog, for moderator and superadmin.

## 2. Where everything is

Clear bands below the existing canvas (nothing overlaps any existing top-level node; checked by bounding box).

### Admin (desktop 1440 x 1184, Admin Shell set `6014:12948`, F2 Button / Pill / Field / Callout / Banner / Note instances)

| Frame | Node | Position |
|---|---|---|
| List (Pending), the default view | `6955:42228` | x 0, y 192000 |
| List (Decided) | `6955:42587` | x 1640, y 192000 |
| List (Empty) | `6955:42945` | x 3280, y 192000 |
| List (Loading) | `6955:43121` | x 4920, y 192000 |
| List (Error) | `6955:43361` | x 6560, y 192000 |
| Detail (Pending): the request, the removal, Reinstate / Decline buttons | `6955:43541` | x 0, y 193800 |
| Detail (Decided): decision recorded banner, decision card, no actions | `6955:43828` | x 1640, y 193800 |
| Decide dialog (Reinstate, valid reason, 36 / 500) | `6955:44021` | x 3280, y 193800 |
| Decide dialog (Decline, reason too short, error, 0 / 500) | `6955:44629` | x 4920 |
| Decide dialog (Saving) | `6955:44829` | x 6560 |
| Decide dialog (Error: new username chosen) | `6955:45029` | x 8200 |
| Decide dialog (Error: you removed this username) | `6955:45233` | x 9840 |
| Decide dialog (Error: already decided) | `6955:45437` | x 11480 |
| Decide dialog (Error: child-safety vetting needed) | `6955:45641` | x 13120 |
| Decide dialog (Error: could not save) | `6955:45845` | x 14760 |

List columns: REQUESTED, PERSON (display name), USERNAME REMOVED, REMOVED BY, REMOVED ON, STATUS (Pending / Reinstated / Declined pill), ACTION (Review / View). Filter: Status (Pending, decided or all) with Apply filter. The empty state reads only "No pending requests." and never hints that anything is hidden.

**Admin navigation.** A new row "Username reviews" (icon `icon/username-review`, a person with a check) was added to ALL 11 existing variants of the Admin Shell set, directly after Moderation, and a new variant `Active=Username reviews` (`6954:42324`) was added; the set was resized 16940 to 18380 wide (no variant moved: before/after positions compared). **This changes every admin screen that instances the shell (about 140 frames): each now shows the extra row.** The nav column grows from 476 to 530 px; Settings stays pinned at the bottom. Figma has no per-role variant, so "moderator and superadmin only" is a code rule (see section 5). The nav-row ids per variant start at `6954:41189` (None) and step by 9.

### Web (create-profile screen for a revoked user)

Built as new auto-layout frames in the create-profile family (heading, subtitle, a "Username review" card, the Username field). Mobile 390 wide at y 196500, x = n x 470; desktop 1440 x 990 at y 198300, x = n x 1640 (desktop reuses the shipped illustration as the local component `Create Profile — Illustration Pane`, `6956:44590`, off to the right at x 16800).

| State | Mobile | Desktop |
|---|---|---|
| 01 Entry ("Ask for a review" button) | `6956:44130` | `6956:44591` |
| 02 Request form (message, counter, Send request / Cancel) | `6956:44155` | `6956:44790` |
| 03 Submitting | `6956:44187` | `6956:44996` |
| 04 Request sent (success) | `6956:44219` | `6956:45202` |
| 05 Pending (status on a later visit) | `6956:44245` | `6956:45402` |
| 06 Reinstated (username back, Continue) | `6956:44271` | `6956:45602` |
| 07 Declined (final) | `6956:44298` | `6956:45803` |
| 08 Window passed (no entry) | `6956:44324` | `6956:46003` |
| 09 Error: could not send | `6956:44347` | `6956:46200` |
| 10 Error: already asked | `6956:44382` | `6956:46409` |

### Notifications

`Notification Centre — Username Review Outcomes` desktop `6956:46618` (x 0, y 200500) and mobile `6956:47034` (x 1640, y 200500): clones of the shipped feed frames `5640:7815` / `5643:8003` cut down to two unread rows ("approved" and "decided"), each with a green-tint disc and the new icon, in the existing row style.

Notes frame `6956:47360` (x 0, y 202000) holds the SCOPE OPEN notes and the copy-pending note as F2 Note instances.

## 3. Wording tagged `[COPY PENDING LEGAL REVIEW]`

Every sentence about the review on the web frames and in the notification rows carries the literal tag inside the text. Short labels carry it in the LAYER NAME (so a screenshot is not cluttered, as in earlier passes):

- Buttons: Ask for a review, Send request, Sending…, Cancel.
- Pills: Pending, Reinstated, Declined.
- Card titles and labels: Your username was removed, Ask for a review, Your review request, Your username is back, Review decided, Request sent, Message (optional).

The sentences (all in the web frames): the entry line ("Your username @adab was removed by Soccernity." and "...ask for a review of the removal. You can ask once, within 30 days of the removal."), the form line ("A different member of our team reviews your request. Their decision is final."), the sent line ("We'll show the result here and send you a notification when it's decided."), the pending lines, the reinstated line, the declined lines, the window-passed line, both error lines, and the two notification titles. Admin wording is plain and untagged (not legal).

The "Continue" button on the reinstated state is not tagged (a navigation label). Figures in the copy (30 days) are the decided ones.

## 4. Decisions I made (defaults, veto-able)

1. Web states are built on a compact create-profile page (heading, card, Username field) rather than cloning the legacy absolute-layout desktop frame `1498:2303`; desktop reuses its illustration as a component. The other profile fields are not repeated.
2. "Pending" and "Reinstated" and "Declined" pills: outline, green-tint and neutral; Declined is not drawn in the alert colour (a decline is not an error).
3. The admin detail shows "Reason recorded at removal" and "New username chosen" to the decider (needed to decide; flagged below).
4. One decide dialog with a Reinstate / Decline choice (radio), an internal reason (counter, 10 minimum, 500 maximum as in the other admin reasons), and a confirm button whose label follows the choice. Error states are shown inside the dialog as the F2 Callout.
5. Sample names (Ada Bello, Mira Okon, Jide Aluko) are illustrative.
6. The Admin Shell was edited, not copied (see section 2): the alternative, a standalone nav row only on these frames, would have left the nav inconsistent with the rest of the console.

## 5. SCOPE OPEN, recorded not decided

- A request that waits because the revoker is the only eligible admin has no frame (no admin can see it).
- Whether the decider should see the removal reason (default: yes).
- The decline reason is internal and never shown to the person.
- Role gating of the nav row is code only.
- A minor's guardian notice is not an on-screen element and is not drawn.
- "Continue" after a reinstatement and the notification row link (the create-profile screen) have no prototype links.
- The cloned notification frames still show the "Unread 15" badge of the original; not edited.
- The admin search bar on these frames is the shell's existing one; the search does not list username reviews.

## 6. Standing check (Decision Log #404, item 14)

- Top-level nodes on page `0:1`: 1,257 before the first write (read at the start, before the nav edit), 1,296 after (39 new top-level nodes: 15 admin, 20 web, 2 notification, 1 component, 1 notes). **No before-hash of the original ids was taken** (the pass did not hash at the start); only the count was recorded.
- Existing frames were not edited except the Admin Shell component set (11 variants gained a nav row; one variant added; set resized).
- Authored paints: 1,022 solid paints counted on the new frames (excluding instance internals and the illustration art), 20 were unbound (the cloned top-bar wordmark text) and were bound to `color/text/primary` in the same pass: 0 unbound now on authored nodes. Inherited and not counted: the Admin Shell instances' internal `Rectangle 223` and the illustration vectors (known component debt, Decision Log #199 and the shipped illustration).
- Overlaps: 0 against every other top-level node.
- Nothing deleted except 21 stray empty frames named `gap` that my own loading-skeleton code created at the top level (removed in the same session).
- No `brand/green-tint-28`, no new colour, light mode only.

## 7. Disclosures

- The first `create_session` call failed on a wrong argument name (no effect); one read-only `use_figma` call failed on an invalid property name (no effect); one setProperties call asked for a Disabled variant that does not exist for the Neutral button and was rolled back, then re-run with the Cancel button dimmed instead; screenshot URLs from `get_screenshot` could not be viewed, so inline `node.screenshot()` was used.
- No prototype links were added anywhere.

## 8. Follow-ups (not done)

- Build register / Decision Log status lines for this Figma leg (a docs PR).
- Backend leg, then `apps/web` and `apps/admin` (note `apps/admin` needs the `Username reviews` route and role gating).
- Draw the waiting-request and guardian-notice states if the founder wants them.
