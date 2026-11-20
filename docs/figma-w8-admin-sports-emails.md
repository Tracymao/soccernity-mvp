# Figma W8: Admin Dashboard, Remove account, kickoff alert, email frames (B-056, B-058, B-070, B-069)

Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Date: 2026-11-06. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, desktop 1440 px and mobile 390 px. Founder statement: Decision Log #472 (items on the Dashboard, Delete Role, kickoff alerts and the unwired emails). Anything marked "default" is an adopted default and veto-able.

Written for: the `figma-to-code` and `backend-api` agents that build B-056, B-058, B-069 and B-070 next, and the founder who reviews the frames.

## 1. What was built

Everything new sits in one clear band at y 249,900 to about 259,000 (x 0 to about 3,400). A concurrent session was drawing at y 224,000 to 236,000 when this pass started (Settings: email change), so the band was moved to y 250,000 to stay clear of it. 34 new top-level nodes (16 frames and labels, 1 component set with its label, 4 notes). Each frame has a text label above it. Nothing was deleted from the existing file. Existing frames changed: `110:5` (renamed), `1380:2318` and `1380:2297` (edited in place, section 5).

### Row A: Admin Dashboard (1440 x 1184, y 250,000). Base: clone of `110:5`

| Id | Frame | State |
|---|---|---|
| A1 `6990:56075` | Admin — Dashboard — Default | five real-data rows in Latest posts |
| A2 `6990:56299` | Admin — Dashboard — Latest posts loading | skeleton rows |
| A3 `6990:56357` | Admin — Dashboard — Latest posts empty | "No posts yet" |
| A4 `6990:56415` | Admin — Dashboard — Latest posts load error | F2 Banner (Error) with "Try again" |

Changes against `110:5`: the "New users by league" tile is removed; the fourth stat tile (the second "Total Visits", a duplicate) is now "New This Month"; the visitor-statistics card and the Latest posts card use the full content width (912 px), because the left column is gone. The Latest posts table is rebuilt on auto-layout with columns Date, Media (Photo or Video tag, or a dash), Post (two lines), Author (public name), Likes, Comments, and a "Newest first" caption. `110:5` is kept and renamed "Dashboard (superseded by W8 frames …)".

### Row B: Remove account (Delete Role as a soft remove, 1440 x 1184, y 252,200). Base: clone of `5403:7205`

| Id | Frame | State |
|---|---|---|
| B1 `6991:56553` | Admin — Remove account — Confirm | "Remove this account?" (Cancel, Remove account) |
| B2 `6991:56752` | Admin — Remove account — Removing | both buttons dimmed, "Removing…" |
| B3 `6991:56951` | Admin — Remove account — Could not remove | "Couldn't remove the account", Try again |
| B4 `6991:57150` | Admin — Remove account — Blocked: your own account | single OK button |
| B5 `6991:57349` | Admin — Remove account — Blocked: last active super admin | single OK button |
| B6 `6991:57548` | Admin — Remove account — Done | Info banner "Account removed", "Removed" pill, dimmed row icons |

The confirm dialog says: "Amaka Eze's account and history are kept, but they can no longer sign in." Dialogs are instances of the F2 `Dialog` component (set `6671:27569`).

### Row C: kickoff-alert control (y 254,600 and 255,000)

New component set `Kickoff Alert Button` (`6991:57977`): State Off, On, Loading, Error, Started; Style Icon (36 px, match card) or Labelled (40 px, match details). Labels: "Alert me at kickoff", "Alert on", "Saving…", "Try again", "Match started".

| Id | Frame |
|---|---|
| C1 `6992:58498` | Sports Hub — Match card — Kickoff alert states (Desktop), five states |
| C2 `6992:59734` | Sports Hub — Match card — Kickoff alert states (Mobile), five states |
| C3 `6992:59845` | Sports Hub — Match details header — Kickoff alert states (Desktop), five states |
| C4 `6992:61086` | Sports Hub — Match details header — Kickoff alert states (Mobile), five states |

The cards and headers are clones of the real Sports Hub card (`1009:706`), the mobile row (`5647:8229`, `5647:8256`) and the match-details header (`667:830`, `5820:9001`), edited to a scheduled match (kickoff "20:00", "vs") and, for the Started state, a match in play ("‘12", "0 - 0"). Error states carry a line "Couldn't update the alert. Try again." with an alert-coloured bar.

### Row D: notes

`6994:54688` (Dashboard), `6994:54696` (Remove account), `6994:54704` (kickoff alert), `6994:54714` (emails). They hold the undecided points of section 4.

## 2. Wording and tags

No string is tagged `[COPY PENDING LEGAL REVIEW]`. All new wording is admin-facing or plain interface wording and makes no legal or safety promise (Decision Log #412 item 5). One line deserves the founder's eye: the Remove account dialog says the account and its history are kept. That describes behaviour the founder stated in #472; if counsel later wants it worded differently it is one text node. The `[COPY PENDING LEGAL REVIEW]` line was removed from `1380:2297` at the founder's instruction (the founder reviews that email himself).

## 3. Frame-to-API notes for the build agents

* Dashboard: `GET /admin/dashboard/stats` already returns the four real stats and `visitsByMonth`. The Latest posts read does not exist yet (B-056 says so); the columns above are the draft field list. The page needs author public name (username or "Soccernity member"), never the real name or email.
* Remove account: `PATCH /admin/staff/:id/status` (`deactivated`) already ends the target's sessions and refuses the last active super admin with a 409. Whether "remove" is that route or a new state is not decided (section 4).
* Kickoff alert: `PUT` and `DELETE /sports/matches/:id/subscription` return `{ subscribed: true }` and `{ subscribed: false }`. There is no read of the current state (section 4).

## 4. Open points, recorded and not decided

1. Dashboard: how many latest posts (five drawn). Which fields (draft). Whether a restricted-pending minor's posts, or a deactivated author's posts, show to every admin. A row action (the old three-dots menu) is not drawn because no admin post screen exists.
2. Remove account: whether it is the existing deactivate action under a new label or a distinct "removed" state. The button says "Remove account"; the register row still calls the screen "Delete Role". Whether the Done frame's "Removed" pill implies a status column on the list is not decided.
3. Remove account: both blocked cases are drawn as asked. Only a super admin can call the route, and a caller is always an active super admin, so "last active super admin" can only ever mean the caller's own account. The two frames overlap in practice. The status route today lets a super admin deactivate themselves when another super admin exists; blocking self-removal outright would be a new rule.
4. Kickoff alert: no endpoint returns whether the signed-in person already has an alert on a match, so "On" cannot be shown correctly on first load or after a refresh (the same gap as Decision Log #153 and #154). A per-caller flag on the match payloads is needed before the frontend can show the true state.
5. Kickoff alert: a logged-out visitor is not drawn (hide the control, or open the login screen). Where the notification will appear is not said on the frames. A match that has started shows the control disabled, because a subscription made after kickoff fires on the next tick, even for a finished match.
6. The F2 `Dialog` size has no disabled button variant, so the Removing state dims both buttons.

## 5. Email frames

Edited in place (nothing deleted):

* `1380:2318` "Success email - password changed": the 40 px title wrapped onto two lines and overlapped the greeting. Body moved to y 229, logo, divider and footer moved down 56 px, frame 625 to 681 px. Wording unchanged. A first resize scaled the text boxes; they were restored to their original sizes and positions, and the result was checked in a screenshot.
* `1380:2297` "Security alert email - suspicious password change": the `[COPY PENDING LEGAL REVIEW]` line is removed. Button, logo, divider and footer moved up 56 px, frame 762 to 706 px. The rest of the wording is as drawn.

### Item 6: the other email frames against shipped behaviour (listed, not changed)

`services/api` ships these email templates: verify email, guardian consent and withdrawal notices, two-factor recovery notices, login lockout, username revoked, report and appeal outcomes, public-report acknowledgement, contact notification. It ships **no** template for any of the six frames (B-069 is unbuilt).

| Frame | Finding |
|---|---|
| `1380:2274` Welcome ("account created") | The footer text overlaps the divider and the logo. It says "Unsubscribe at any time", but no unsubscribe mechanism exists for these emails. "Your account is ready" and "follow the players, clubs and communities" do not hold for a minor whose guardian approval is pending (restricted-pending: browse and read only; follow is blocked, #370, #407 item 4). |
| `1661:2741` Moderator account created | The title overlaps the greeting ("Hi [First name]" is hidden under it). The role list ("Review and publish blog and news articles") is the editor's job; a moderator handles reports, users, media and contact enquiries. The email carries a temporary password; `POST /admin/staff` returns the generated password once in its response and sends no email, so emailing it is new behaviour and a security decision. No mention of the two-factor enrolment an admin must complete at first sign-in (#446). |
| `1661:2724` Admin account created | Same title overlap. Same temporary-password point. The shipped roles are editor, moderator and super admin; two frames cover moderator and "admin" only, so there is no editor frame and "admin" does not match a role name. |
| `1380:2318` Password changed | Fixed. The wording matches shipped behaviour: changing the password ends the other sessions; support@soccernity.com is the address of #37. |
| `1380:2297` Unusual password change | As drawn. Its "looked unusual" sentence may not fit every reset through the emailed link (#472 (a)); the founder owns the wording. The Reset button maps to the existing forgot-password page. |
| `5439:7074` Account deletion requested | Contradicts shipped behaviour in three places: (1) "Sign back in any time in the next 30 days to cancel" and "sign in now, change your password": a `pending_deletion` account cannot sign in (login answers the generic 401) and no cancel route exists; (2) "scheduled for permanent deletion in 30 days" and "profile, posts and activity are permanently removed": after 30 days the sweep anonymises the account in place and the posts stay as "[deleted user]" (#341); (3) the CTA "Sign in to Soccernity" has no working purpose. Not edited: it is wording about deletion and retention, which touches counsel's open items. |

Not checked: whether a "view in your browser" page exists for any email (the first line of every frame offers one).

## 6. Standing checks (Decision Log #404 item 14)

* Top-level nodes on page `0:1`: 1,434 at the start of this pass (hash `1651399754`), 1,535 at the end. 34 of the 101 added nodes are mine; the rest were added by the concurrent session. A per-id hash of the starting nodes was not stored, only the count and the hash above, so "no original node missing" is shown by the count arithmetic and by the fact that this pass deleted no existing node, not by an id-by-id comparison.
* Authored paints: the four Latest posts content frames, the component set and the four notes hold 175 solid paints in total, 0 unbound. The cloned dashboard shell, tiles, chart and the cloned Sports Hub cards keep their original legacy fills (inherited, not authored here).
* Overlaps: 0 against every other top-level node (checked before and after the label fix). My labels were wrapped to their frame width after one overlap between two labels was found.
* A first Dashboard build treated two cards as frames when they are groups, and drew the table in the wrong place; those test frames were deleted (they were mine) and rebuilt. A failed run rolled back cleanly each time.
