# Figma pass U: suspension on a report, staff-recorded appeal, hidden message context, user-page Suspend, suspension and reinstatement emails (build-register B-295, Decision Log #485 and #486)

Figma and docs only. No application code, schema, legal text, DPIA, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. No suite run. Date: 2026-11-11. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, 1440 px admin frames, 680 px email frames.

Written for: the `figma-to-code` agent that builds B-295 next, and the founder who reviews the frames.

Sources: Decision Log #485 (suspension on a report; the person is emailed with a fixed plain-words reason; staff record an appeal on someone's behalf) and #486 (message context visible only to child-safety-vetted admins when a minor is involved), read from `docs/build-register.md` Section 84 and the register rows B-291 to B-296. I read no API route or field.

## 1. Node map

All new nodes sit in a clear band below the existing canvas (existing content ended at y 315,384). Rows at y 317,000 to 325,000 (admin frames, pitch 1,640 on x), y 327,000 (emails, pitch 800). Each admin row has a label above it; band title `7041:60950` (y 316,840); notes frame `7046:63455` at x -1,200, y 317,000.

Row numbers below are this report's own (U1 to U7), not the brief's item numbers; the brief's item is in brackets.

### U1. Report detail, Record action panel: Suspend offered (brief item 1)

Clones of the pass-for-B-289 report frames A1 to A4 (`7036:59847`, `7036:60017`, `7036:60187`, `7036:60357`), with one helper line added under the buttons. The originals are untouched.

| Id | Frame |
|---|---|
| `7041:60951` | Report Detail, Post target, Suspend offered |
| `7041:61123` | Comment target, Suspend offered |
| `7041:61295` | Message target, Suspend offered |
| `7041:61467` | User target, Suspend offered |

### U2. Suspend shown as NOT offered (brief item 1)

Clones of the Banter room, team, fixture and enquiry report frames. The Suspend User button is removed and the helper line says Suspend is not offered for this kind of report.

| Id | Frame |
|---|---|
| `7041:61631` | Banter room target, Suspend not offered |
| `7041:61798` | Team target, Suspend not offered |
| `7041:61965` | Fixture target, Suspend not offered |
| `7041:62132` | Enquiry target, Suspend not offered |

### U3. Confirmation dialog and result (brief item 1)

| Id | Frame |
|---|---|
| `7042:61845` | Post target, Suspend confirm dialog (consequence list below) |
| `7042:61926` | Message target, Suspend, child-safety vetting required (the existing restricted dialog) |
| `7042:61998` | Post target, after Suspend: Pill "Account suspended", callout "Account suspended. @christine001 can no longer sign in and has been emailed." |

The confirm dialog states plainly:

* They can't sign in, and every session they have ends now.
* Engagement points they earned from views, likes and comments are removed.
* If they are under 18, their guardian is told once.
* They are emailed straight away with a short reason based on the report's category (the generic line "breaching our community rules" for Child safety concern, Other or no category), and told how to appeal through the Contact Us page.
* The email names no reporter and no duration.
* If an appeal against this report is overturned, the account is reinstated automatically.

### U4. Record an appeal on someone's behalf (brief item 2)

| Id | Frame |
|---|---|
| `7044:62187` | Record an appeal dialog, default |
| `7044:62269` | Reason required (field error "Enter a reason for the appeal.") |
| `7044:62352` | Window closed (the API message "The time allowed for appealing this report has passed.") |
| `7044:62425` | Child-safety vetting required (existing restricted dialog) |
| `7044:62498` | After recording: Pill "Pending — recorded by staff" and callout "Appeal recorded for @christine001. It is waiting for review, and closure of this report is paused." |

The dialog says the person can't sign in so staff record it for them, that it is only possible inside the appeal window counted from the decision, and that recording it pauses closure of the report until the appeal is decided. Required reason field (10 to 500 characters is the existing convention; the number is not printed) and the existing audit-record help line.

### U5. Message report for an admin who is not child-safety vetted when a child is involved (brief item 3)

| Id | Frame |
|---|---|
| `7045:62777` | Report Detail, Message target, context hidden. Reported message and the "Edited: Yes, at 08:09" row stay; the original text does not appear; where the context messages would be, one callout reads "Context hidden: this involves a child [COPY PENDING LEGAL REVIEW]". |

Clone of `7027:59180` (message with context) with the messages list replaced.

### U6. User page Suspend dialog (brief item 4)

No existing user-page frame carried a Suspend action, so the row and the dialog are new, built on the guardian-notice User detail frame (`6920:34766`) and the set dialog (`6921:35031` / `6921:35032`).

| Id | Frame |
|---|---|
| `7045:63053` | User detail (minor), Support actions card with a new "Suspend account" row |
| `7045:63231` | Suspend dialog, default (nine report categories as a radio list, same consequence list as U3) |
| `7045:63341` | Category required (alert border on the list, "Choose a reason category.") |
| `7045:63452` | Category chosen |

Help line in the dialog: "The email gives a short reason based on this choice. For Child safety concern and Other it says "breaching our community rules". [COPY PENDING LEGAL REVIEW]". One bullet adds: a moderator reviews appeals sent through Contact Us and can reinstate the account from this page.

### U7. Emails to the suspended person (brief item 5)

680 px frames, clones of the W8 "password changed" email (`7008:57034`) so the Roboto type, bindings and logo are inherited; same structure as the other email frames (title, centred body, logo).

| Id | Frame |
|---|---|
| `7046:63413` | Email, suspension, generic reason ("because of breaching our community rules") |
| `7046:63427` | Email, suspension, named category example ("because of harassment or bullying") |
| `7046:63441` | Email, reinstatement ("Your Soccernity account has been reinstated. You can sign in again.") |

Both suspension emails say: you can no longer sign in, all signed-in sessions have been ended, and the person can appeal through the Contact Us page (`[link to Contact Us page]`). Neither names a reporter or a duration. Each ends with the tag line.

### Other

* Band title `7041:60950`.
* Notes frame `7046:63455` (SCOPE OPEN, section 6 below).
* Labels above every row's frames (text nodes named `Label — …`, created beside each frame).

### Archived

Three frames from the content-removal report (`docs/figma-content-removal-report.md`) still drew a "Suspend User" button on Banter room, team and fixture reports, which contradicts #485. Renamed `ARCHIVED — … (superseded by pass U frame <id>)` and hidden; nothing deleted:

| Archived | Replaced by |
|---|---|
| `7036:60527` (Banter room target) | `7041:61631` |
| `7036:60697` (Team target) | `7041:61798` |
| `7036:60867` (Fixture target) | `7041:61965` |

A page-wide scan (1,735 nodes carrying reactions) found 0 prototype links and 0 flow starting points pointing at any of the three. The A1 to A4 and A8 to A10 frames of that report still show the old five-button row where it applies; they are left as they are (A1 to A3, A4 are re-drawn as "Suspend offered" clones above).

## 2. What was reused

* The Admin Shell instance, the Admin Search Bar instance and the card style of the existing report-detail frames (clones of A1 to A4, `7027:59180`, `6920:34766`).
* F2 components as instances: `Button` (Primary, Neutral), `Pill` (Tone variants), `Callout`.
* The existing dialog frames: scrim and dialog of the set dialog `6921:35031` / `6921:35032`, the bad-faith dialog `6672:27330` / `6672:27331`, the restricted dialog `6921:36598` / `6921:36599`; the existing audit-record help line.
* Variables (all Light mode): `brand/navy`, `brand/green-tint`, `brand/off-white`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/icon/inactive`, `color/overlay/scrim`, `elevation/overlay` style, and `semantic/alert` only as an accent bar or field border (Decision Log #408 item 4).
* No new colour, no `brand/green-tint-28`, no new component, variable or style. Destructive actions stay navy buttons (no destructive token exists, non-negotiable #3).

## 3. Contrast (computed from token values, not by eye)

Relative luminance from the resolved Light-mode values: navy `#282E65` L = 0.033; white L = 1.0; `brand/green-tint` (12% `#7BB929` over white, about `#EFF6E5`) L = 0.90; `color/text/secondary` (navy at 70% over white, about `#686D93`) L = 0.16; `semantic/alert` `#FA0606` L = 0.205.

| Pair | Ratio | Result |
|---|---|---|
| `color/text/primary` (navy) on white (titles, labels, dialog text, email title) | 12.6 : 1 | passes AA and AAA |
| Navy on `brand/green-tint` (callouts, selected rows) | 11.4 : 1 | passes AA and AAA |
| `color/text/on-navy` (white) on navy (buttons) | 12.6 : 1 | passes AA and AAA |
| `color/text/secondary` on white (email body, helper lines, tag line, 10 px) | about 5.0 : 1 | passes AA (4.5 : 1) |
| `color/text/secondary` on `brand/green-tint` (helper line inside the callout) | about 4.5 : 1 | at the AA limit, not above it; same pairing as the existing frames |
| `semantic/alert` accent bar / field border on white | about 4.1 : 1 | non-text element, needs 3 : 1, passes; never used for text or a button fill |

The tag text is 10 px in the secondary colour (5.0 : 1 on white). The tag is a working marker for counsel and is removed when the string is cleared.

## 4. Tagged strings

Everything that says who is told, what is sent to a person under 18's guardian, what the platform does to an account, or what a person can do about it carries `[COPY PENDING LEGAL REVIEW]` on the frame:

* Suspend confirm dialog (U3, U6): the whole consequence list, one tag at the end of the list.
* Record an appeal dialog (U4): the paragraph about the appeal window and the pause on closure.
* Appeal recorded callout and "Pending — recorded by staff" pill context line (U4.5).
* Message context hidden line (U5): "Context hidden: this involves a child [COPY PENDING LEGAL REVIEW]".
* User-page dialog help line about the email reason (U6).
* The three emails (U7): the whole body, one tag line at the bottom of each.

Plain functional wording, not tagged (labels, buttons, field errors): "Suspend User", "Suspend account", "Cancel", "Record an appeal", "Reason category (required)", "Choose a reason category.", "Enter a reason for the appeal.", "Account suspended", "Pending — recorded by staff", the helper line saying Suspend is not offered for a given report type. The API message in U4.3 ("The time allowed for appealing this report has passed.") is the API's own text, shown as drawn.

## 5. Gaps and conflicts found, stated plainly

1. **Brief says "dark and light as the existing admin frames are".** The existing admin frames are light only (the Admin Shell has no dark variant), so only light mode is drawn. No dark frames exist anywhere in the admin to match.
2. **Conflict with the content-removal frames.** A5 to A7 of `docs/figma-content-removal-report.md` showed Suspend User on Banter room, team and fixture reports. #485 offers it only on user, post, comment and message reports. Archived and replaced (section 1). No other earlier frame was found drawing it.
3. **The Contact Us page has no frame for an "appeal" category.** The emails link to the page; the six Contact Us categories are unchanged by this pass. How a person tells staff the enquiry is an appeal is not drawn (the frames only say "use the Contact Us page and tell us which account you mean and why you are appealing").
4. **Per-category plain-words lines.** Only two examples are drawn (the generic line and "harassment or bullying"). The wording for each of the nine categories, and what the phrase reads like in the email, is the founder's and counsel's call. The generic line is used for Child safety concern, Other, no category.
5. **Appeal window length** is configuration and is not printed in the dialog or the emails.
6. **Whether the staff member who records an appeal may also decide it** is not decided (note 3 on the canvas). #138 (a second reviewer decides) is unchanged.
7. **Reinstatement email says nothing about points.** Points are not restored (#485). Whether the email should say so is not decided.
8. **A restricted state for the vetted-only message context** exists as U5 only; how a vetted admin sees the context is the existing frame `7027:59180`. Nothing new drawn for a vetted admin.
9. **The user-page row and dialog (U6) had no existing frame to extend.** The "Suspend account" row sits in a new "Support actions" style card on the minor's User detail frame; whether this card is the final home for it on the built page (`UserDetailPage.tsx`) is for the build to confirm. The page has other state (hold-active rows etc.) not drawn here.
10. **Email frames carry a placeholder `[First name]` and `[link to Contact Us page]`**, as the other email frames do.
11. **The email body has a plain functional structure**: no button and no in-body heading beyond the title (the title is the subject line, as in `docs/figma-w8-emails.md`).

## 6. SCOPE OPEN (also on the canvas, notes frame `7046:63455`)

1. Suspend offered on user/post/comment/message, not offered on Banter room/team/fixture/enquiry; old frames archived.
2. The email gives a short reason from the report's category; the category is not shown in the moderator dialog (it is the report's own); only two example emails drawn.
3. Record an appeal: window length not printed; the same person recording and deciding is not decided.
4. Reinstatement email: whether to mention points.
5. Hidden context: the original text of an edited message and the context are withheld from an admin who is not child-safety vetted when a person under 18 is involved.
6. User-page Suspend: category required, nine categories; only the row and dialog are drawn.

## 7. Standing check (Decision Log #404 item 14)

* Top-level nodes on page `0:1`: 1,807 before, 1,857 after (+50: 21 admin frames, 3 email frames, 24 label text nodes, 1 band title, 1 notes frame). The 1,807 original top-level ids are all present and in the same order; nothing was deleted.
* **Hash:** the pre-pass baseline `180288968` was taken with a hash formula I could not reproduce after the session was compacted (djb2 over the ids concatenated, with `,`, `|`, space, newline and `;` separators and three variants of the update step were tried; none gave `180288968`). The post-pass hash with the plain djb2 loop over the concatenated 1,807 original ids is `91305652`. So the before/after hash comparison is **not** proven; what is proven is the id count (1,807 before and after, excluding the pass's own additions) and that the three archived frames kept their ids.
* Paints on the new frames: 3,022 solid fills and strokes on visible nodes; 21 unbound, all `Rectangle 223` inside the Admin Shell instance of the 21 admin frames (the known literal sidebar wash, Decision Log #199). Everything authored (texts, tint fills, pills, dialogs, email frames, notes) is bound.
* Overlaps among the 49 visible new top-level nodes: 0. None with existing content (existing content ended at y 315,384; the new band starts at y 316,840).
* Reactions: prototype NAVIGATE links were set on the U1, U3, U4 and U6 frames and read back after being set (the per-link list was not kept after the session was compacted, so it is not itemised here). U5 has none.
* Screenshots viewed by eye: U1.1, U2.4, U3.1, U3.2, U3.3, U4.2, U4.5, U5.1, U6.3, U7.1 and the notes frame. The remaining frames (U1.2 to U1.4, U2.1 to U2.3, U4.1, U4.3, U4.4, U6.1, U6.2, U6.4, U7.2, U7.3) are produced by the same builder code and were exported but not studied one by one.
* One real defect was caught and fixed during the build: on U3.3 the Pill label kept the old text "Content removed" (my exact-text lookup did not reach the Pill instance's inner text); fixed by setting the inner text node, verified.

Screenshots: `docs/figma-pass-u-screens/` (25 PNGs, each named with its node id).

## 8. Disclosure

* This session was compacted once mid-pass. The build state at that point (frames, ids, wording) was carried over in a summary, and the standing-check baseline hash could not be re-derived afterward (section 7).
* No code was written. Figma only.
