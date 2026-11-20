# Figma W8: Settings states for email change, Change Password, Push, Filters, Muted accounts, Privacy and Download my data (B-059, B-060, B-062)

Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Date: 2026-11-06. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode, desktop 1440 x 2517 (the Settings family size) and mobile 390. Founder statement: Decision Log #472 (the features behind email change, Push and Filters are built, not hidden; Download my data is in launch scope). The build detail in register Section 80 (defaults (c), (e), (f), (g)) is an adopted default, veto-able.

Written for: the `figma-to-code` and `backend-api` agents that build B-059, B-060 and B-062 next, and the founder who reviews the frames.

## 1. What was built

58 new top-level frames, 3 notes frames and 6 row labels, in a clear band at y 222000 to about 236300 (x 0 to 16,400). Nothing was deleted. Ten superseded frames were archived (section 4). Every new frame is a clone of an existing Settings frame (same Settings Shell instance, same Top Bar and Back Bar on mobile) with a freshly built, auto-layout content panel. Desktop columns are 1640 px apart, mobile columns 590 px apart.

Built with local frames in the Settings family style (Montserrat, tokens only), not with the Pass F2 admin components, because these are user-facing screens (Decision Log #403 item 14). The existing `Settings Toggle` component (`5694:8219`) is used for every toggle.

### Row A: Account Information and email change (desktop y 224000, mobile y 233000)

| Frame | Desktop | Mobile |
|---|---|---|
| Account Information (Phone, Email with Change email, Date of birth read-only, Save) | `6989:49962` | `6989:50344` |
| Email change: Confirm password | `6989:50158` | `6989:50394` |
| Email change: Wrong password | `6990:50244` | `6990:51740` |
| Email change: Two-factor code | `6990:50433` | `6990:51783` |
| Email change: New email | `6990:50619` | `6990:51823` |
| Email change: Email not accepted (one generic message) | `6990:50805` | `6990:51863` |
| Email change: Check your inbox | `6990:50994` | `6990:51906` |
| Email change: Check your inbox (under 18, guardian line) | `6990:51182` | `6990:51948` |
| Email change: Verified | `6990:51373` | `6990:51993` |
| Email change: Link expired | `6990:51556` | `6990:52030` |

### Row B: Change Password states, Push, Filters, Muted accounts (desktop y 227000, mobile y 234200)

| Frame | Desktop | Mobile |
|---|---|---|
| Change Password: Wrong current password | `6990:53716` | `6990:55679` |
| Change Password: New password problems (too short, no match) | `6990:53912` | `6990:55729` |
| Change Password: Password changed | `6990:54110` | `6990:55781` |
| Push: On | `6990:54293` | `6990:55818` |
| Push: Off | `6990:54466` | `6990:55850` |
| Push: Blocked by browser | `6990:54639` | `6990:55882` |
| Push: Not supported on this device | `6990:54814` | `6990:55915` |
| Filters: Quality filter off | `6990:54979` | `6990:55939` |
| Filters: Quality filter on | `6990:55149` | `6990:55968` |
| Muted accounts: three rows, all off | `6990:55319` | `6990:55997` |
| Muted accounts: three rows, two on | `6990:55499` | `6990:56036` |

### Row C: Privacy and Download my data (desktop y 230000, mobile y 235400)

| Frame | Desktop | Mobile |
|---|---|---|
| Privacy: Adult (Public profile toggle, marketing preference toggle, no Guardian row) | `6991:53454` | `6991:55384` |
| Privacy: Under 18 (no Public profile row, Guardian approval row) | `6991:53687` | `6991:55475` |
| Download my data: Confirm password | `6991:53920` | `6991:55566` |
| Download my data: Wrong password | `6991:54165` | `6991:55665` |
| Download my data: Preparing | `6991:54412` | `6991:55766` |
| Download my data: Ready to download | `6991:54653` | `6991:55861` |
| Download my data: Too many requests | `6991:54900` | `6991:55962` |
| Download my data: Could not prepare | `6991:55141` | `6991:56057` |

Notes frames (SCOPE OPEN, decisions, archive comparison): `6992:54614` (Account), `6992:54626` (Notification Preferences), `6992:54637` (Privacy and Download my data), placed at y about 223400. Row labels: `6992:54646` to `6992:54651`.

## 2. What the frames say, against the brief

1. **Email change.** Confirm password, new email, "Check your inbox", Verified, Wrong password, Email not accepted, Link expired, and a two-factor step. The inbox frame says the current address is also told (the OLD-address notice of default (f)); an under-18 variant adds the guardian line. The link's lifetime and any resend wait are deliberately not printed.
2. **Change Password.** The existing form frames `2924:6870` / `5695:8234` are kept as the form (not duplicated). Three states were added: wrong current password, new password problems, success. The success frame says the other sessions were logged out, which matches what the form already says.
3. **Push.** On, Off, Blocked by browser, Not supported on this device. Wording says it applies to this browser only.
4. **Filters.** The Quality filter with the rule in plain words: "Hides likes, comments and follows from accounts you don't follow and haven't interacted with in the last 30 days." Off and on. A line says messages, fixtures, results and Contest notifications are not affected (that follows from the default, which names only like, comment and follow).
5. **Muted accounts.** "Muted accounts with the three rows live" was read as the three existing rows (people you don't follow, who don't follow you, with a new account) drawn as live toggles, in two states. No per-account mute list is drawn because none is specified.
6. **Privacy.** Public profile row for adults only (absent for under 18); Guardian approval row for under 18 only. The marketing row is a toggle with the line "This saves your preference only. We don't send marketing emails yet." The "Coming soon" pill is removed.
7. **Download my data.** Confirm password, wrong password, preparing, ready to download (a JSON file), too many requests (no number), could not prepare.

## 3. Wording tagged [COPY PENDING LEGAL REVIEW]

Only statements that promise something about safety, data or who is told (Decision Log #412 item 5). Every other string is plain and functional.

| String | Frames |
|---|---|
| "Set when you signed up and cannot be changed here." (existing wording, kept) | Account Information |
| "We've also told your current address about this change." | Check your inbox (both variants) |
| "Your guardian will be told about this change." | Check your inbox (under 18) |
| "Push notifications only say 'You have a new notification'. Open Soccernity to see what it is." | Push On, Push Off |
| "This saves your preference only. We don't send marketing emails yet." | Privacy (both variants) |
| "The file contains your personal data. Keep it somewhere safe and don't share it." | Download my data: Ready |

Judgment calls on tagging, for the founder to veto: the push line is tagged because it is a promise about what a lock screen shows; the marketing line is tagged because it states what is and is not sent. The notes frames repeat the list.

## 4. Archived frames (hidden, `ARCHIVED —` prefix, moved to the Settings archive strip at y -13200, x 98600 onward)

Archived only after the replacement was compared item by item and every link to the old frame was re-pointed (74 reactions changed; a page-wide scan afterwards found 0 links to any of the ten).

| Archived | Replacement | Compared |
|---|---|---|
| `2924:7112` / `5649:8176` Account Information (Edit) | `6989:49962` / `6989:50344` | Username (moved to Edit Profile), Phone, Email (now with Change email), Date of birth (read-only), Save: all accounted for; Country dropped |
| `2927:9954` / `5696:8364` Push Notifications | `6990:54466` / `6990:55850` (Off, the default) | heading, toggle row, description |
| `2926:9230` / `5696:8281` Filters | `6990:54979` / `6990:55939` | heading, Quality filter row; description rewritten to the decided rule |
| `2926:9482` / `5696:8307` Muted accounts | `6990:55319` / `6990:55997` | the three rows |
| `6178:14437` / `6185:14547` Privacy | `6991:53454` / `6991:55384` (Adult) | Public profile, Your Post, Direct Message, Blocked users, Download my data, Account status, Guardian approval, Marketing emails |

Re-pointed links include the "Privacy" row in the rail of every Settings screen (about 60 instances), the notification hub rows, the back arrows of the Direct Messages and Sensitive Media frames drawn by the messaging W8 pass, and the two Guardian Consent "Review privacy settings" buttons, which now open the **under 18** variant (`6991:53687` / `6991:55475`).

Kept, not archived: the password gate `2922:6396` / `5695:8213` (see 5.1) and the existing Change Password form `2924:6870` / `5695:8234` (its Save now opens "Password changed").

## 5. SCOPE OPEN (recorded on canvas, not decided)

1. **The password gate overlaps the password step.** Account Information is still reached through the gate frames (decision #9 of the Settings audit), and "Change email" asks for the password again. Whether the gate stays is for the founder.
2. Whether a restricted-pending minor may change email; how the new address is checked against the guardian's email (the #365 rule). The "Email not accepted" frame uses one generic message for every reason (in use, not valid, same as now, the guardian's address) so it does not reveal which.
3. What happens to a link already sent when a new request is made; the link's lifetime and resend wait.
4. Where two-factor sits in the email-change flow (drawn after the password step; shown only if two-factor is on).
5. Push: the browser's own permission prompt is not drawn; how a revoked subscription is cleaned up; browser support was not checked.
6. Filters: what counts as an "interaction"; whether filtered notifications are deleted or only hidden.
7. Muted accounts: how new is "a new account"; whether muting hides notifications already received.
8. Download my data: direct download (drawn) or an emailed link; the download's lifetime; whether names of other users in the follows list appear. If it is emailed, the Privacy row text and the Ready frame change. The legal draft's Part C row 12 (who exercises a minor's data-subject rights) stays open and is not touched.
9. Marketing preference: whether the row is shown to under-18 accounts (drawn as shown, an open point).
10. The Email Notifications leaf (`2927:10205`) is not mentioned by the founder and was not touched.

## 6. Prototype links

285 nodes with links in the new frames (every button, the Download my data rows, the rail rows inherited from the shell). Wired by hand: Change email, Continue and Cancel through the email-change steps, Send link, Use a different address, Start again, the two Save buttons of Change Password (including the existing form), the Download my data row on both Privacy variants, Prepare my file, Cancel, Try again and Back to Privacy. Error frames (Wrong password, Email not accepted, Link expired, Wrong current password) are reached from the matching step conceptually; a button carries one link, so Continue goes to the next step.

## 7. Standing check

- Top-level nodes on page `0:1`: 1,434 before my first write, 1,523 after. 67 of the 89 added are mine (58 frames, 3 notes, 6 labels); the other 22 were added by another session working in the same file during this pass (Admin Dashboard and Remove account frames and a Kickoff Alert Button component set, y 250000 and below, ids 6990:56075 onward). **No before-hash of the original ids was taken** (count only); the hash of the non-new, non-archived ids after the pass is 2425094500.
- Paints on authored nodes: 904 solid fills and strokes checked, 900 bound, 4 unbound. The 4 are `Account Actions` frames inside the cloned Privacy frames (inherited from the original Privacy frames, not authored here). Instance internals (Settings Shell, Top Bar, Back Bar, Settings Toggle) are not audited (component debt, as in earlier passes).
- Overlaps: 0 for the 67 new top-level nodes against every visible node on the page; 0 for the 10 archived frames at their new positions.
- No new colour; no `brand/green-tint-28`; no new variable. Errors use a 3 px `semantic/alert` accent bar and a `semantic/alert` field border with navy text (Decision Log #408 item 4, the Contact Us pattern).
- Fonts: Montserrat Regular, Medium, Bold only.

## 8. For the next passes

- `figma-to-code`: B-059, B-060 and B-062 each need a backend first (email-change requests, data-export requests, notification preferences and mutes, push subscription records; register Section 80c). Nothing here is built.
- Register status lines for B-059, B-060 and B-062 and a pointer on Decision Log #472 are not added here (this PR is Figma and docs only); the next docs PR should record the frame ids above.
- Not drawn: the Email Notifications leaf; the browser permission prompt; a phone-number verification step; an "undo" for an email change.
