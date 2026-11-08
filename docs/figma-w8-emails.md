# Figma W8 emails: transactional email frames aligned to the shipped templates (B-069, Decision Log #472)

Figma and docs only. No application code, schema, legal copy, DPIA, Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md` or Decision Log changed. Date: 2026-11-08. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`, light mode. Follows `docs/figma-w8-admin-sports-emails.md` section 5, which listed the email frames that disagree with the code.

Written for: the founder who reviews the frames, and the `figma-to-code` / `backend-api` agents that read them next.

The code is the source of truth for the wording. Every sentence in the nine new frames is copied from `renderHtmlBody` in `services/api/src/modules/auth/registration/email/registration-email.service.ts` (the HTML body is what a person sees; the plain-text twin differs only in how the link is shown). Role sentences are copied from `ADMIN_ROLE_EMAIL_DETAILS` in `admin-staff-roles.constants.ts`. Nothing was invented, softened or extended, and no legal copy was written.

## 1. Node map

New band below all existing content: y 268,100 (frames) and y 268,044 (labels), x 0 to 7,080. One row, 800 px pitch, each frame 680 px wide, a text label 56 px above it. The previous lowest content ended at y 266,310.

| # | New frame | Id | Label id | Shipped template | Replaces (archived) |
|---|---|---|---|---|---|
| 1 | Email — welcome | `7008:56942` | `7008:56964` | `welcome` | `1380:2274` |
| 2 | Email — staff account created — Editor | `7008:56965` | `7008:56987` | `staff-account-created` | `1661:2741` / `1661:2724` (new role) |
| 3 | Email — staff account created — Moderator | `7008:56988` | `7008:57010` | `staff-account-created` | `1661:2741` |
| 4 | Email — staff account created — Super admin | `7008:57011` | `7008:57033` | `staff-account-created` | `1661:2724` |
| 5 | Email — password changed | `7008:57034` | `7008:57055` | `password-changed` | `1380:2318` |
| 6 | Email — password reset completed | `7008:57056` | `7008:57078` | `password-reset-completed` | `1380:2297` |
| 7 | Email — account deletion requested | `7008:57079` | `7008:57100` | `account-deletion-requested` | `5439:7074` |
| 8 | Email — email change — verify (new address) | `7008:57101` | `7008:57123` | `email-change-verify` | none (new) |
| 9 | Email — email change — notice (old address) | `7008:57124` | `7008:57145` | `email-change-notice` | none (new) |

Notes frame: `7009:56939` (SCOPE OPEN, y 269,300, x 0), a clone of the existing note `6994:54714`.

Archived (renamed `ARCHIVED — … (superseded by W8 email frame <id>)` and hidden; nothing deleted, nothing moved): `1380:2274`, `1661:2741`, `1661:2724`, `1380:2318`, `1380:2297`, `5439:7074`. A page-wide scan of all reactions (195,846 nodes, 1,498 carrying reactions) found no prototype link and no flow starting point pointing at any of the six, so nothing needed re-pointing.

How the frames were built: each is a clone of `1380:2297` (so the Roboto type, the navy and secondary-text variable bindings, the `CTA 1 button` instance and the logo are inherited), re-laid out top to bottom. The button label is changed on the instance; the button keeps its 245 px size (the longest label, "Sign in to the admin console", measures 186 px).

## 2. What changed against which shipped string

Frame titles: a shipped email has no heading inside the body, so each title is the shipped subject line (`Welcome to Soccernity`, `Your Soccernity editor account`, and so on).

| Frame | Old frame said | Now says (shipped) |
|---|---|---|
| Welcome | "Your email is verified and your account is ready — welcome aboard." / "follow the players, clubs and communities you care about, and keep up with the game as it really happens." / footer "…Unsubscribe at any time." | "Your email is verified and your account is ready. Welcome aboard." / "follow the clubs and communities you care about, and keep up with the game as it happens." / footer without the unsubscribe words. Footer overlap fixed by the new layout. |
| Staff (3 roles) | Moderator: four bullets (publish articles, respond to community questions…), "Dashboard: [link]", "Temporary password: [password]". Admin: "An administrator account…". | One template: "A {role} account has been created for you on Soccernity." plus the role's one sentence; "Your sign-in email: [email address]"; button "Sign in to the admin console"; "This email does not contain a password. The person who created your account will give you your password separately. Sign in and change it straight away."; the two-factor paragraph; "Welcome to the team,". The three roles are editor, moderator, super admin. |
| Password changed | "…was changed successfully. For your security, you've been signed out on all other devices." | "…was changed. For your security, all your signed-in sessions have been ended, so you will need to sign in again." Rest as shipped. |
| Password reset completed | "We noticed a password change… that looked unusual." / "you're all set — there's nothing you need to do." / "your account may be at risk. Reset your password now…" | "The password… was just changed using a password reset link sent to this email address." / "If this was you, there is nothing more to do." / "If it was not you, someone may have had access to your email. Reset your password again now:" then the button, then "If the button does not work, copy this into your browser: [link]" and "Then contact us at support@soccernity.com…". The button opens the forgot-password page. |
| Account deletion requested | "…scheduled for permanent deletion in 30 days." / "Sign back in any time… to cancel" / "profile, posts and activity are permanently removed" / button "Sign in to Soccernity" | The shipped wording (section 4). No button. |
| Email change verify | no frame | "Someone asked to use this address…", button "Confirm my new email", link fallback line, "The link works once and expires in 48 hours…". |
| Email change notice | no frame | The two shipped sentences. |

Removed because no shipped template contains them: "Trouble viewing this email? View it in your browser.", the "This is an automated … message about your Soccernity account." footers, and the two dashed rules that framed them. The welcome footer is shipped and stays.

## 3. What was left as it was

* The six original frames, apart from the archive rename and hide.
* The title-head frames above the originals (`1661:2763`, `1661:2765` and the rest): they still sit beside the now-hidden originals.
* The earlier notes on canvas that describe the originals (`6994:54714`, `6628:22218` and others) are now stale; nothing was edited in place. `6994:54714` says the three overlapping frames are "still overlapping, not fixed" and that `1380:2318` / `1380:2297` were edited: that is superseded by this pass.
* The other shipped templates with an existing frame (verify email `5439:7053`, guardian approved `5501:8584`, guardian declined `5501:8607`, password reset link `5372:7272`) were not part of this brief.

## 4. For the founder: sentences about retention, deletion, who is told or safety

Copied from the shipped text, not edited, in case counsel or the founder wants them looked at:

* Account deletion requested: "Your account is now closed: you have been signed out everywhere and can no longer sign in." / "After 30 days your account is anonymised. Your name, email address, phone number and profile details are removed or replaced, and the account can no longer be used." / "Posts, comments and messages you wrote are not deleted; they stay and are shown as "[deleted user]". Your likes, follows, saved posts, notifications and memberships of rooms, groups and clubs are removed." / "In some cases we keep an account's data for longer, for example while a report involving it is still being looked at."
* Password changed and password reset completed: "all your signed-in sessions have been ended" and "someone may have had access to your email".
* Staff account created: "This email does not contain a password…" and the two-factor sentence.
* Email change notice: "Nothing changes until the request is confirmed from the new address…".
* No string is tagged `[COPY PENDING LEGAL REVIEW]` (Decision Log #412 item 5; the founder reviews these emails himself).

## 5. SCOPE OPEN (recorded, not decided)

1. Titles are the subject lines. The notice's title wraps onto three lines. Shorter titles are the founder's call.
2. The "Trouble viewing this email" line and the automated-message footers were removed because they are not shipped. Say if they should come back (they would then need to be added to the templates).
3. The frames follow the HTML body. The plain-text twin shows a link on its own line instead of a button; no frame is drawn for it.
4. Staff emails: the sign-in button appears only when `ADMIN_APP_BASE_URL` is usable, and the two-factor paragraph only when `ADMIN_2FA_ENFORCED` is `"true"`. Both are drawn.
5. "30 days" is `GRACE_PERIOD_DAYS` and "48 hours" is the email verification link lifetime; both are values from code, not fixed copy.
6. An admin gets a password only from whoever created the account (no admin forgot-password route exists). That gap is in the staff email's wording as shipped and was not changed.
7. Placeholders `[First name]`, `[email address]`, `[link]` follow the convention of the existing frames.

## 6. Standing check (Decision Log #404 item 14)

* Top-level nodes on page `0:1`: 1,611 before, 1,630 after (+19: 9 frames, 9 labels, 1 note). Hash of the ids of the 1,611 original nodes before and after: `4267328903`, identical.
* Authored solid paints on the new nodes (frames, texts, label text, note): 108, 0 unbound. Paints inside the `CTA 1 button` instance and the cloned logo group are inherited and were not counted.
* Overlaps: 0 among the new nodes and 0 against existing content.
* Reactions: 0 links into the six archived frames, 0 flow starting points.
* Screenshots viewed: welcome, moderator, password reset completed, account deletion requested, email change verify, email change notice, and the notes frame. Editor, super admin and password changed come from the same builder code and were not viewed one by one.
* The first build run failed (a property of an instance child cannot be set), rolled back completely (node count confirmed at 1,611), and was rerun after the fix.
