# Figma pass Q: upload states, author post card, report on media, final-entry upload, admin media review queue

Date: 2026-10-27. Branch `figma/pass-q-upload-states-review-queue`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`.
Figma and docs only. No application code, schema, legal copy, DPIA or Decision Log docx changed. Nothing existing was edited, archived or deleted.

Source decision: Decision Log #419 (build post and contest-entry media upload; docs PR #471). Everything here is DESIGN for a decided, not-yet-built feature.

## 1. Result in numbers

| | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 951 | 1,008 (57 new) |
| Hash of the original 951 ids (djb2, in order) | 3534229312 | 3534229312 (the first 951 children are unchanged and in the same order) |
| New frames by group | | desktop composer 11, mobile composer 11, author post card 4, report on media 8, final-entry desktop 5, final-entry mobile 5, admin 8, notes 5 |
| Authored solid paints not bound to a variable | | 0 |
| Unbound solid paints inside instances | | 8, all `Rectangle 223` (the Admin Shell sidebar wash, a literal paint by design, Decision Log #199), one per admin frame |
| `brand/green-tint-28` | | 0 |
| Overlaps of new frames with each other and with every existing top-level node | | 0 |

New frames sit in a clear band below the canvas (y 106,000 to 115,200); notes sit at x -1,200. Measurement: whole-page `get_metadata` was not used (page too large, Decision Log #404 item 14); top-level count plus id hash plus a per-frame paint scan were used instead. The first overlap/paint pass also matched the existing frame `6660:28736` by name prefix (it is not new; its one unbound paint is pre-existing); the figures above exclude it.

Screenshots: every new frame was rendered and inspected inline during the build (not saved to the repository). There are no "before" screenshots because no existing frame changed.

## 2. Existing frames that cover each item, and the new ids

### (1) Create Post composer, attach controls enabled

Existing frames: desktop `2009:5168`, `2009:2913`, `6171:14797`, `6171:16994`, `2496:4462`, `2565:3951`; mobile `5818:8962`, `5818:8997`, `5701:8328`, `5982:10905`, `5982:10932`. None draws an upload state. The composer is shared, so each state is drawn once on the base composer (desktop modal `6673:27357`, mobile `5818:8962`). The picture and video icons in the desktop toolbar and the picture row on mobile are drawn enabled (the poll icon is unchanged).

| State | Desktop | Mobile |
|---|---|---|
| 01 Choose a file | `6847:29675` | `6848:29675` |
| 02 Uploading with progress and Cancel | `6847:29730` | `6848:29723` |
| 03 Checking, pictures (thumbnail, Remove) | `6847:29794` | `6848:29780` |
| 04 Checking, video poster | `6847:29860` | `6848:29839` |
| 05 Approved | `6847:29922` | `6848:29894` |
| 06 Rejected, generic reason, Remove | `6847:29989` | `6848:29954` |
| 07 Upload error, Try again | `6847:30053` | `6848:30011` |
| 08 File too large | `6847:30117` | `6848:30068` |
| 09 Wrong file type | `6847:30176` | `6848:30120` |
| 10 Video too long | `6847:30235` | `6848:30172` |
| 11 "Uploads aren't available right now" (attach icons disabled) | `6847:30294` | `6848:30224` |

### (2) Post card as its author sees it

Existing: the Community feed post cards (`6673:27565`, `6673:27630`) show only the normal state. New:

| Frame | Id |
|---|---|
| Media under review, desktop / mobile | `6849:29675` / `6849:29769` |
| Media rejected, desktop / mobile | `6849:29719` / `6849:29813` |

The same post for other viewers is ABSENT; this is a note only (notes frame `6853:30592`).

### (3) Contest week 4 final-entry upload (replaces the pasted video link)

Existing: `6660:28736` (desktop upload open), `6660:35662` (mobile). New frames are those stacks with the upload area added:

| State | Desktop | Mobile |
|---|---|---|
| 01 Choose a video | `6850:29675` | `6850:29921` |
| 02 Uploading | `6850:29719` | `6850:29971` |
| 03 Being checked | `6850:29769` | `6850:30027` |
| 04 Approved, waiting for the reveal | `6850:29820` | `6850:30084` |
| 05 Rejected | `6850:29871` | `6850:30141` |

### (4) Report control on a picture or video, and the confirmation

No Figma frame existed. The code pattern in `apps/web` (`ReportAction.tsx`: menu, then "Why are you reporting this?", then "Reported — thanks, our team will review it.") was reused. New frames:

| Frame | Desktop | Mobile |
|---|---|---|
| Menu on a picture | `6849:29863` | `6849:30022` |
| Menu on a video | `6849:29912` | `6849:30071` |
| Report form | `6849:30010` | `6849:30169` |
| Confirmation | `6849:29966` | `6849:30125` |

### (5) Admin review queue (Admin Shell, Active = Moderation; desktop only; each frame 1440 x 1184)

Built from the pass K reference frame `6737:27844` with the F2 Pill, Button, Banner, Callout and Field components. Only uncertain and reported items appear.

| Frame | Id |
|---|---|
| Queue list: pending count pill, columns source / uploader public name / type / age, Review button, **statistics card** (auto-approved, auto-rejected, sent to review, reported; last 7 days) | `6851:29675` |
| Empty queue (statistics card kept) | `6851:30038` |
| Load error with Try again | `6851:30333` |
| Item view, picture, source = automatic check, with category labels | `6852:30003` |
| Item view, video with inline player, source = user report (Callout with the report reason) | `6852:30323` |
| Already decided (Banner, Approve and Reject disabled) | `6852:30658` |
| Reject dialog, reason required (error state) | `6852:30985` |
| Reject dialog, reason entered | `6852:31327` |

Reject is a navy button, not red (palette rule).

### Notes frames (Note component instances: Scope open and Copy pending legal review)

`6853:30578` composer states, `6853:30592` author post card, `6853:30603` report on media, `6853:30611` contest final entry, `6853:30622` admin queue.

## 3. Strings

### Tagged `[COPY PENDING LEGAL REVIEW]` (Decision Log #412 item 5: they say who can see an upload or what is checked)

The text layer is named with the tag prefix, and the strings are listed in the notes frames.

1. "Everything you upload is checked before other people can see it." (composer 01)
2. "Checking… only you can see this until it has been checked." (composer 03, 04; contest 03)
3. "Your pictures can be seen with your post." (composer 05)
4. "Only you can see this post until its pictures have been checked." (author post card)
5. "Your post stays hidden from other people until every picture has been approved. Remove this picture or choose another." (author post card, rejected)
6. "Everything you upload is checked before it can be shown, and your video stays hidden from everyone but you until the reveal." (contest 01)
7. "Your video is hidden from everyone but you until the reveal at 00:00 on day 25." (contest 04)
8. "Say why this picture is being rejected. The uploader sees this reason." (admin reject dialog)

### Untagged (functional wording)

Composer: "Choose a picture or video"; "Pictures: JPG, PNG or WebP, up to 10 MB each, up to 10 per post. One video: MP4, WebM or MOV, up to 100 MB and 120 seconds."; "Choose a file"; "Uploading… 62%"; "Keep this window open until it finishes." (mobile: "screen"); "Cancel"; "Cancel upload"; "Remove"; chips "Checking", "Approved", "Not approved", "Upload failed", "Under review"; "Videos can take a little longer to check."; "Approved"; "This picture wasn't approved"; "It didn't meet our community guidelines. Remove it to continue, or choose a different picture."; "Upload failed"; "Check your connection and try again."; "Try again"; "That file is too large"; "Pictures can be up to 10 MB each and a video up to 100 MB."; "That file type isn't supported"; "Use JPG, PNG or WebP for pictures, or MP4, WebM or MOV for a video."; "That video is too long"; "A video can be up to 120 seconds. Trim it and try again."; "Choose another file"; "Uploads aren't available right now"; "You can still post text. Try adding pictures or video again later."; sample file names.

Author post card: "Under review"; "This picture wasn't approved"; "Picture not approved"; "Remove picture".

Report: "Report this picture"; "Report this video"; "Report post"; "Cancel"; "Tell us what's wrong. Our team will review it."; "Why are you reporting this?"; "0 / 500"; "Submit report"; "Reported — thanks, our team will review it."

Contest: "Choose your final video"; "MP4, WebM or MOV, up to 100 MB and 120 seconds. Upload on days 22–24; the deadline is 23:59:59 on day 24."; "Choose a video"; "You can replace it until the upload window closes."; "Approved — waiting for the reveal"; "This video wasn't approved"; "It didn't meet our community guidelines. Remove it and upload another before the window closes at 23:59:59 on day 24."; "Remove".

Admin: "Media review"; "27 pending"; "0 pending"; "Only pictures and videos the automatic check was unsure about, and items people have reported, appear here. Everything else was approved or rejected automatically."; "Last 7 days"; "Auto-approved"; "Auto-rejected"; "Sent to review"; "Reported"; the statistics helper line; table headers SOURCE, UPLOADER, TYPE, AGE, ACTION; "Automatic check"; "User report"; "Review"; "Showing 5 of 27"; "Load more"; "Nothing to review" and its body; "Couldn't load the review queue"; "Check your connection and try again. Nothing has been approved or rejected."; "Try again"; "Review picture"; "Review video"; "Back to queue"; "Details"; "Uploader"; "Source"; "Type"; "Age"; "Used in"; "Automatic check"; "Labels come from the automatic check. They are a guide — the decision is yours."; "Approve"; "Reject"; "Reported by 2 people. Reason given: “This is not related to football.”"; "Already decided"; "Another moderator approved this picture 3 minutes ago. There is nothing more to do here."; "Reject this picture?"; "Reason (required)"; "Up to 300 characters."; "Enter a reason to continue."; "Reject picture".

## 4. Open points (also on the canvas as SCOPE OPEN notes)

1. #419 does not say whether a post may mix pictures and a video; the frames show them separately.
2. Whether Post stays enabled while media is checked or after a rejection (drawn enabled).
3. Whether a post with a rejected picture can be edited in place or must be deleted.
4. The report API has target types for post, comment and user only; a media report would target the post today. Media as its own target type, and how a media report reaches the queue, are undecided.
5. Contest: the upload deadline (23:59:59 on day 24) and the reveal (00:00 on day 25) leave no time to review a late upload (open in #419). What a finalist sees when a video is not approved by the reveal is not drawn.
6. Admin: category label names and percentages are samples; they depend on the automatic image check (B-036) and the vendor. Not drawn: child-safety vetting for reviewers of minors' media (open in #419), the CSAM path (B-206), bulk actions. Age ordering (oldest first) is assumed.
7. The admin shell search bar is unchanged (non-functional, Decision Log #403 item 5).
8. "Uploads aren't available right now" assumes the service answers 503 when no object store is configured.

## 5. Not done

- No application code, no copy decisions beyond the strings above.
- No change to the build register or the Decision Log docx (the brief excluded the docx). Candidate rows for the register: the Figma legs of B-237 (K13), B-239 (W15) and B-240 (FC10) are now drawn.
- Screenshots are not stored in the repository.
