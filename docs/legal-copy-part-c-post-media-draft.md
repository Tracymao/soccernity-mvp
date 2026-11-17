# Legal copy: proposed Part C row, policy-text candidates and notice options for user-uploaded pictures and videos

## DRAFT FOR COUNSEL — NOT APPROVED, NOT LEGAL ADVICE

**Status: draft for counsel review. [COPY PENDING LEGAL REVIEW]**

This is a **new, standalone file**. It does **not** edit `docs/legal-copy-draft-tos-privacy-policy.md` (v0.8), and nothing
here has been applied to the Terms, the Privacy Policy, the guardian consent screen, the composer or any Figma frame. It
supplies material for whoever next revises that draft, after counsel has answered the questions in
`docs/dpia-addendum-post-media-draft.md` (the **DPIA addendum**, which holds the risk analysis, the facts, the options for
moderator access, retention and thresholds, and the questions for counsel).

Produced by Claude Code in the `safeguarding-drafter` role (CLAUDE.md non-negotiable #2: every output is a draft, never
approved). Every block of wording below carries `[COPY PENDING LEGAL REVIEW]` on purpose, and **[PROPOSAL]** / **[OPEN]** follow
the conventions of the existing legal draft.

- **Draft date:** 2026-10-27, **Version:** 0.1 (draft, NOT APPROVED); refreshed 2026-11-17 (**v0.2**, still draft, NOT APPROVED) **[v0.2 CHANGED — #524 to #532]**
- **Facts from:** `docs/backend-w14-media-report.md`, `services/api/src/modules/post-media/README.md` and the code on
  `origin/main` at `5857ea8`, as recorded in the DPIA addendum. **Nothing here is live** and no statute or regulator guidance
  was retrieved.
- **The single biggest dependency:** the wording below cannot be finalised until the founder decides the **review model**
  (DPIA addendum Section 1.4): **Mode A** (a person reviews every upload) or **Mode B** (an automatic check decides clear
  cases and a person reviews the uncertain ones and reported ones). Where wording differs, both variants are given and
  labelled. **[OPEN]**
  **[v0.2 CHANGED — #430 item 1, #524]** **The founder has decided the review model**: automatic check first, then report-and-review (a moderator opens only the uncertain and the reported files). It is **Mode B in this file's terms, plus a route to report a file**. **Mode A applies only until an AWS account exists** (a founder step; none exists today, so no check runs and every file waits for a moderator). Counsel's view is not recorded. *[v0.2 DISPOSITION: B — #430 item 1, #524; counsel's view not recorded. The Mode A wording variants stay in this file for that interim and for counsel's comparison.]*

---

### Changelog — v0.1 → v0.2 (2026-11-17) **[COPY PENDING LEGAL REVIEW]**

**[v0.2 CHANGED — #524 to #532]** v0.2 is a **narrow refresh**. It exists so counsel receives a current file and one clear list of what still needs a lawyer. It does three things only: (1) it adds a marked note beside each statement the built system has since contradicted (the review model, the "no moderator tool", "no reporting path", "public address" and retention statements); (2) it gives **every question and open item a disposition marker**; (3) it adds a changelog. It **chooses no option, applies nothing to the policy, the consent screen or the product, completes nothing, and claims nothing as solved.** No counsel position is recorded, because counsel has not reviewed this file. The earlier text is kept. The facts come from `CLAUDE.md`'s status bullets, `docs/build-register.md` and the module READMEs on `origin/main` (`014afcd`); nothing was run, CI could not be read, the Security session could not be asked.

**Disposition markers:** `[v0.2 DISPOSITION: A — …]` open for counsel (non-blocking, Decision Log #524, #532); `B` decided by the founder (the Decision Log number is named; "counsel's view not recorded" wherever true, because a founder decision is not legal clearance); `C` resolved, counsel signed off (**none**); `D` founder or engineering housekeeping.

**What the founder decided that touches this file:** #430 item 1 (automatic check first, then report-and-review; a moderator opens only the uncertain and the reported files, only vetted staff open a minor's file); #524 (uploads go live at launch, `MEDIA_UPLOADS_ENABLED` is the off switch, no counsel gate, launching before hash-matching exists is the founder's own risk and not counsel's view); #525 and #530 (built: a vetted admin sets a file aside, including a profile picture or cover, and it is kept privately 365 days by default; the filing is recorded by hand outside the platform); #526 (detection after launch, not built; the Cloudflare scanning tool and PhotoDNA dropped); #529 (no registration with NCMEC or the UK body before launch). Still on counsel's list, non-blocking: whether the law requires proactive detection; which duties apply in each country; receiving bodies and deadlines; evidence retention beyond 365 days; platform duties to children.

**Disposition index:** §7 questions: 1 B for the model and A for whether the Policy may describe an automatic approval, 2 B (premise overtaken, launch step not done), 3 A, 4 A, 5 A, 6 A, 7 A, 8 A; section 4 notice options N-1 to N-5: A (none chosen); section 5 option table: the built options (M-2/M-3, P-2 to P-4, F-2 with exception) are B, the rest A or D as marked in the note after that table. The DPIA addendum (`docs/dpia-addendum-post-media-draft.md`, v0.5) holds the full list.

**Not edited, and now stale in places:** the line numbers quoted in section 2 refer to `docs/legal-copy-draft-tos-privacy-policy.md` v0.8; that file is now v0.16 and the numbers have moved. **That file is not touched here.**

---

## 1. Proposed Part C row **[COPY PENDING LEGAL REVIEW]**

**Numbering.** The instruction for this draft called this "row 43". In v0.8, rows 43 and 44 already exist (row 43 is
"avatar, cover photo, bio and country visible to other users including minors"; row 44 is "other new processing") and row 37
already covers Rekognition for avatars and cover photos. The view-data draft
(`docs/legal-copy-part-c-view-data-draft.md`) proposes **row 45**. So this is proposed as **row 46** and **must be renumbered
when applied**. Counsel may prefer to fold it into row 37 instead; the facts below would simply be appended to it.

| # | Item | Where it appears above | Owner |
|---|---|---|---|
| 46 | **New — pictures and videos uploaded to posts and Contest entries, including by minors: storage on Cloudflare R2, metadata stripping, the automatic check by Amazon Rekognition (if used), human review, retention, and the absence of any illegal-content detection or reporting path. Built in `services/api` (W14) but not live; not built into the policy text.** The v0.8 draft describes the image check for **avatars and cover photos only** (PP §2, §5, §7; row 37) and says nothing about post or Contest-entry media. Facts as built: (a) a file is uploaded from the browser to storage, **metadata including location is removed**, and the file is shown only to its author until approved; (b) when the automatic check is on, **one image or many sampled still frames per video** are sent to Amazon Rekognition (default region Ireland), **nothing identifying the user is sent**, only moderation category names are kept; the check **approves and rejects clear cases without a person** and leaves the uncertain band for a moderator; thresholds are stricter when the uploader is a minor; (c) with the check off, every file waits for a moderator (no moderator tool exists yet); (d) the check is **not** a tool for finding known illegal material, **frame sampling (default one frame per five seconds) can miss a short clip, audio is not checked**; (e) there is **no hash-matching and no statutory reporting or evidence path**; (f) a rejected file and the check's labels have **no retention period**, and a not-yet-approved or rejected file sits on a **public storage address** until deleted; (g) the guardian consent screen and the policy say nothing about uploads. Policy-versus-product conflict: Decision Log #419 item 4 and the register say "a moderator approves every upload", the build lets the check decide clear cases. Counsel status: **pending** (counsel has not seen this processing). **Counsel to answer:** DPIA addendum Section 12 (review model and Article 22; lawful basis for sending children's images to AWS; AWS terms and region; hash-matching and the reporting path under each regime; moderator vetting and logging; retention of rejected files and labels; the public-address exposure; notice to uploader and guardian; non-user children depicted; whether upload may go live before the statutory path exists) | PP §1, §2, §5, §7, §9, §13; ToS §6; guardian consent screen (a wording change bumps `CONSENT_SCREEN_VERSION`) | Founder + counsel |

**[v0.2 CHANGED — #430, #462 (g), #518, #521, #524, #525, #530, B-037, B-257, B-258, B-259, B-265, B-283, B-206, B-321]** **Statements (a) to (g) of row 46 are partly out of date and are kept as written.** (c) "no moderator tool exists yet" is **no longer true**: a review queue and its admin screens exist (PRs #476, #477), and a minor's file needs a child-safety-vetted admin (B-258). (e) "no hash-matching and no statutory reporting or evidence path" is **partly out of date**: there is still **no hash-matching and no automatic call to any authority**, but a **suspected-illegal set-aside path is built** (a vetted admin sets a file aside, it is kept privately 365 days by default past account deletion, and a person records the filing; every receiving body is "pending counsel"; PRs #800, #803, #806, #807). (f) "no retention period" and "a public storage address" are **no longer accurate**: pending and rejected files are private and copied to the public prefix only on approval (B-257), private files are meant to live in a separate bucket with no public address (B-265; the bucket setup and the cross-bucket copy are a founder launch step, not done, unproven against real R2), a rejected file's object is deleted on every path unless a hold, an open report or a set-aside protects it (B-283), and a confirmed upload never attached to a post is purged after 7 days (B-259); **the check labels, the rejection reason and the moderator id still have no retention period.** The "Policy-versus-product conflict" is **decided**: automatic check first, then report-and-review (#430 item 1 supersedes #419 item 4's "a moderator approves every upload"). A **route to report a file** now exists for signed-in users (`POST /media/:id/report`; three reporters hide it; 20 per account per day); there is no public route for a non-user. *[v0.2 DISPOSITION: B — founder decisions #430, #462 (g), #518 to #521, #524, #525; counsel's view not recorded. The row's closing "Counsel to answer" list is **A, non-blocking**; the full list with its own dispositions is in the DPIA addendum Section 12.]*

---

## 2. Existing v0.8 statements that this processing would make inaccurate or incomplete **[COPY PENDING LEGAL REVIEW]**

Listed so whoever applies a counsel-approved version knows what to change. **None has been edited.**

| Where in v0.8 | What it says now | Why it needs a look |
|---|---|---|
| PP §2 "How we use your data" (about line 662) | "check uploaded images for safety **[PROPOSAL, not yet built]**" | Covers images and, in the product, also videos and Contest entries; "for safety" does not say a machine, a third party, or frame sampling is involved |
| PP §5 "Who we share your data with", Amazon Rekognition entry (about line 805) | automated check on "uploaded images (avatars and cover photos)", "Flagged images go to a Soccernity moderator and are not shown until reviewed", plus the open hash-matching and cross-border points | Scope is avatars and covers only. In Mode B a clear image is shown **without** any person looking; in Mode A **every** image is reviewed. "Flagged" is not defined. Videos are sent frame by frame, which the text does not say |
| PP §5, Cloudflare R2 entry (about line 801) | "used to store photos and videos you upload" | Does not mention the quarantine copy, the public address of unapproved files or the 24-hour purge |
| PP §7 "Public and semi-public visibility" (about line 880) | "Uploaded images are checked automatically and reviewed by a person if flagged" | Matches Mode B only; false in Mode A. Applies to avatars/covers; says nothing about post media or videos |
| PP §9 retention table | no row for post media, rejected files, check labels or rejected-file evidence | Section 3.5 below |
| PP §13 "Third parties depicted in content you didn't create" | report via tools or email `support@soccernity.com` | There is no media-specific report target; the email is the only route that names a picture of a person |
| ToS §6.2 | "Soccernity is not obliged to monitor User Content before it is posted" | Media is now held and may be checked before it is shown; the sentence stays true as a statement of obligation but the practice should be described somewhere |
| Part C row 37 | Rekognition for avatars/covers only; hash-matching coverage on R2 unconfirmed | Scope widens to every post and Contest-entry image and video (build-register B-206) |
| v0.3 DPIA R8, R9, R11 | refer to the earlier free-link path, to staff vetting for reports, and to media storage as unselected | See DPIA addendum Section 11, assumption 13 |

**[v0.2 CHANGED — #524 to #532]** **Section 2 is a list of statements to change, not changes.** Since it was written: the Rekognition entry's "Flagged images go to a Soccernity moderator and are not shown until reviewed" has a built queue behind it for post media (not yet for avatars and covers, where only the check and, for a vetted admin, a set-aside route exist, #530); the Cloudflare R2 entry's "does not mention the public address of unapproved files" is overtaken by B-257 and B-265 (private first, two buckets); the "no media-specific report target" row of PP §13 is partly overtaken by `POST /media/:id/report` (signed-in users only); the legal draft itself is now **v0.16** and its line numbers differ. **None of the statements was edited.** *[v0.2 DISPOSITION: D — housekeeping for whoever next revises the legal draft; its own PRs are separate. The questions the changes raise stay A.]*

---

## 3. Policy-text insertion candidates (NOT applied) **[COPY PENDING LEGAL REVIEW]**

Candidate sentences, written so counsel can accept, reword or reject them. They describe the product **as built**, and
several depend on a decision that has not been made (marked [OPEN]). Plain language is used because the Policy is also read
by children and guardians.

### 3.1 Candidate for PP §1 ("What we collect") — pictures and videos you upload **[COPY PENDING LEGAL REVIEW]**

> **[PROPOSAL]** When you add a picture or a video to a post, or enter a video in a Contest, we store the file. Before anyone
> else can see it, we remove the hidden information that phones put into files, such as where a picture was taken and what
> device took it. The original file is kept for a short time while we do this, and is deleted within 24 hours. A picture or
> video may show you and other people, and those people may be children who do not use Soccernity. Please do not post
> pictures or videos of children unless you are entitled to.

*Notes for counsel.* The last two sentences are a candidate rule, not a legal position; see Section 3.6. The "within 24
hours" figure is the built purge interval (a bucket lifecycle rule is recommended in `docs/deployment.md` as a backstop,
and is a human step not yet done). **[OPEN]**

*[v0.2 CHANGED — #430 item 2, B-257, B-259]* The built sequence is now: signed link to a **private** location, a confirm step that strips metadata and then **replaces** the original, and a purge of confirmed uploads never attached to a post after **7 days** (an original left in the quarantine location is still deleted within 24 hours). The "within 24 hours" statement above is therefore true of the quarantine copy only. *[v0.2 DISPOSITION: D — wording follows the build; counsel's view of the sentences themselves not recorded (A, non-blocking).]*

### 3.2 Candidate for PP §2 ("How we use your data") — checking uploads **[COPY PENDING LEGAL REVIEW]**

**Variant for Mode B (check on):**

> **[PROPOSAL, depends on the review model]** We check pictures and videos you upload to help keep Soccernity safe. A computer
> tool looks at the picture, or at pictures taken from a video, and flags content that may be unsuitable. If the tool is
> sure a file is unsuitable, we do not show it. If the tool is not sure, a member of our team looks at it before it is
> shown. If the tool finds nothing wrong, the file can be shown without a person looking at it. The tool cannot find every
> kind of harmful content, it does not listen to sound in a video, and it can make mistakes. You can report anything you see.

**Variant for Mode A (every file reviewed by a person):**

> **[PROPOSAL, depends on the review model]** Before a picture or video you upload is shown to anyone else, a member of our
> team looks at it. Until then, only you can see it. A person can make mistakes, and we cannot promise that nothing unsuitable
> will ever be shown. You can report anything you see.

*Notes for counsel.* Only one variant can be true at launch. Both avoid saying the tool finds illegal material, because it
does not (DPIA addendum Section 5). Whether "does not listen to sound" must be disclosed is a question (Q18).

*[v0.2 CHANGED — #430 item 1, #524]* **The founder's decision matches the Mode B variant**, with a route to report a file. The Mode B text above says "a member of our team looks at it" for an uncertain file; it does not mention that a file can also be **reported**, which is built. Only vetted staff open a minor's file (B-258). **No new customer wording is added here.** *[v0.2 DISPOSITION: B for the model (#430 item 1; counsel's view not recorded); A for whether the Policy may describe an automatic approval and whether it must disclose that audio is not checked (see section 7, questions 1 and 4).]*

### 3.3 Candidate for PP §5 ("Who we share your data with") — replacing the Rekognition entry **[COPY PENDING LEGAL REVIEW]**

Mode B only. In Mode A the entry is not needed for post media.

> **[PROPOSAL, not yet built; use only if the automatic check is on]** **Amazon Web Services (Amazon Rekognition)** — an
> automated safety check on pictures and videos you upload. For a picture we send the picture; for a video we send a number
> of still pictures taken from it. We do not send your name, username, account details, caption or the file name. We use the
> service in a European region (**[OPEN: confirm region and where it is processed]**). **[OPEN: counsel — whether Amazon may
> use these pictures to improve its own services, whether we opt out, and the cross-border position.]**

> **[PROPOSAL, not yet built]** **Cloudflare (R2 object storage)** — stores the files you upload, including a short-lived
> copy before hidden information is removed. **[OPEN: the storage location of the bucket is not set; counsel to confirm the
> wording and transfer position.]**

*[v0.2 CHANGED — #430 item 1, #518, #521, B-193]* No AWS account, IAM user or Rekognition key exists yet (a founder step), so **nothing is sent to AWS today**. The founder will set the AWS opt-out of AI-services data use before any real key is configured (#430 item 1). Storage is now two R2 buckets; the location is still unset. *[v0.2 DISPOSITION: A — the processor wording, region and transfer position are for counsel; B for the opt-out step (founder, not yet done).]*

### 3.4 Candidate for PP §7 ("Public and semi-public visibility") — when an upload is seen **[COPY PENDING LEGAL REVIEW]**

> **[PROPOSAL]** A post with a picture or video is shown only to you until every picture and video in it has been approved.
> You will be told if a file is not approved and why, and you can remove it and try again. If a file is not approved,
> **[OPEN: it is deleted / it is kept privately for N days / it is kept until you delete it — depends on DPIA addendum
> Option 10.2]**.

*Note.* The built behaviour is that a not-yet-approved or rejected file is hidden by the application but is reachable by
anyone who has its address (DPIA addendum R24). Describing it as "shown only to you" is true of the application and
untrue of the storage address unless Option 10.6 (P-2 to P-4) is chosen. **Counsel should not approve this sentence while
that gap stands.** **[OPEN]**

**[v0.2 CHANGED — #430 item 2, #518, #521, B-257, B-265]** **The gap this note describes is closed in code, not yet in operation.** Since B-257 a not-yet-approved or rejected file is stored **privately** and copied to a public address **only on approval** (it fails closed); since B-265 private files are meant to sit in a **separate bucket with no public address**. What remains is a **founder launch step** (create the buckets, set the access rules, set `media.soccernity.com`) that is **not done**, and R2's cross-bucket copy has **never run against real R2** (unproven). Counsel is **not** asked to approve the "shown only to you" sentence while the launch step is undone; it is a founder housekeeping matter. *[v0.2 DISPOSITION: D — founder launch step (B-265); B for the design (#430 item 2, #518 to #521; counsel's view not recorded). The retention clause in brackets (deleted / kept N days / kept until you delete it) is **A**, because it depends on counsel's answer on evidence retention.]*

### 3.5 Candidates for the PP §9 retention table **[COPY PENDING LEGAL REVIEW]**

| Data type | Retention period | What triggers change |
|---|---|---|
| Original of an upload before hidden information is removed | Seconds, and no more than 24 hours **[PROPOSAL, built]** | Automatic |
| An upload that was started but never completed | No more than 24 hours **[PROPOSAL, built]** | Automatic |
| Pictures and videos in your posts | While the post exists; deleted when you delete the post, remove the file, or your account is anonymised **[PROPOSAL, built]** | Deletion; anonymisation (a surviving post then has no pictures or videos) |
| A file that was not approved | **[OPEN — built: kept until you remove it, the post is deleted or the account is anonymised; counsel to set. See Options F-1 to F-5.]** | To be set |
| A file uploaded but never added to a post | **[OPEN — built: kept indefinitely; no period set. Counsel to set.]** | To be set |
| The safety check's category labels, the reason for a rejection, who decided and when | **[OPEN — built: kept as long as the file's record. See Options L-1 to L-5.]** | To be set |
| A short note of what the automatic check found (category names only, no picture) | included in the row above | |

**[v0.2 CHANGED — #462 (g), #464, #430 item 4, #525, B-259, B-283]** **Rows 4 and 5 of this table are partly out of date; the text is kept.** A file that was not approved: **built** — deleted on every path (post or upload deleted, anonymisation, purge, stray-object sweep) **unless** an active admin hold, an unclosed report or a **set-aside record** protects it; a **set-aside** file is kept privately **365 days by default** (`preserveUntil`), past account deletion (#525; #530 for profile images). A file uploaded but never added to a post: **built** — purged after **7 days** (B-259). **The check's labels, the rejection reason and the moderator id: still no period** (candidate Options L-1 to L-5). *[v0.2 DISPOSITION: B — the object deletions and the 7-day purge are founder decisions, built (#462 (g), #464, #430 item 4); counsel's view not recorded. **A — the retention of the labels, reason and moderator id; whether 365 days and the release of evidence afterwards are right (DPIA addendum Section 12 questions 4a, 14a); non-blocking (#524, #532).**]*

### 3.6 Candidate for ToS §6 — a rule about other people in your pictures **[COPY PENDING LEGAL REVIEW]**

> **[PROPOSAL, counsel to confirm that a rule of this kind is wanted and lawful]** Do not upload a picture or video of
> another person, and in particular of a child, unless you are entitled to do so. If you believe a picture or video of you or
> your child has been posted without a proper basis, you can report it using the report tool or email support@soccernity.com
> and we will review it.

*Note.* This repeats the logic of PP §13. A media-specific report target does not exist (DPIA addendum R29), so the report
tool today reports the post or the user, not the file.

*[v0.2 CHANGED — #430 item 3, B-258]* A route to report a **file** now exists for signed-in users (`POST /media/:id/report`); there is **still no media target in `POST /reports`** and **no public route for a non-user** to report a file. The legal draft's Part C row 8 records that non-user reporting was removed from the public text on counsel's advice and "whether a route is built is a product matter". *[v0.2 DISPOSITION: A — whether the rule itself is appropriate and lawful (section 7, question 5); D — whether a public media-report route for non-users is wanted (founder, on the founder list).]*

### 3.7 Candidate wording for the message a person sees about a file **[COPY PENDING LEGAL REVIEW]**

Built today (automatic rejection): "This file didn't meet our rules". Candidates:

- **Pending:** "Your file is being checked. Only you can see it until it has been approved."
- **Rejected (automatic):** "This file wasn't approved. You can remove it and add a different one." *Option N-5 would add
  which kinds of content are not allowed, in general terms.*
- **Rejected (by a person):** the moderator's written reason, shown to the uploader. [OPEN: wording guidance for
  moderators, because the reason is free text about a child's file (DPIA addendum R28).]
- **Held longer than expected (Contest):** "Your Contest video is still being checked. Videos that have not been approved by
  the reveal will not be shown." [OPEN: the review window is shorter than the upload window allows; DPIA addendum Section 2
  and register B-239 point 1.]

*[v0.2 CHANGED — #430, B-237, B-239]* The "Rejected (by a person)" bullet now has a built form: a moderator's **required** reason (1 to 300 characters) is shown to the uploader and by an in-app notification (W15, FC10). The Contest review window is still **shorter than the upload window allows** (the week-4 upload deadline is 23:59:59 on day 24; the reveal is 00:00 on day 25); a late entry that is not approved by the reveal is not shown. *[v0.2 DISPOSITION: D — the review-window timing is a founder and engineering question; the wording guidance for moderators is A only to the extent counsel wants input (DPIA addendum question 13).]*

---

## 4. A "what is checked" notice for the uploader and the guardian: options, not decisions **[COPY PENDING LEGAL REVIEW]**

Context: the uploader is told only that a file did not meet the rules; the guardian consent screen is silent about uploads.
Each option below is wording plus what it would require. **None is chosen.** None has a Figma frame.

| Option | Where | Candidate wording | Requires a guardian-consent change? |
|---|---|---|---|
| **N-1** Policy text only | Privacy Policy (sections 3.1 to 3.5 above) | as above | No |
| **N-2** N-1 plus a line where the file is chosen | The composer | "Pictures and videos are checked automatically and may be looked at by a person before they are shown." (Mode B) / "Pictures and videos are looked at by a person before they are shown." (Mode A) **[COPY PENDING LEGAL REVIEW]** | No |
| **N-3** N-2 plus a once-only plain-language notice for under-18s at the first upload | The composer | "Before your picture or video is shown to others, it is checked. A computer tool may look at it, and a member of our team may too. We remove hidden information such as where a picture was taken. If something isn't approved we'll tell you. You can read more in our Privacy Policy." **[COPY PENDING LEGAL REVIEW]** | No |
| **N-4** N-3 plus a guardian-facing line | The guardian consent screen | "Your child can add pictures and videos to their posts. These are checked before they are shown, which may include an automated check by a trusted service provider and a review by a member of our team." **[COPY PENDING LEGAL REVIEW; wording and the "trusted service provider" phrase are counsel's]** | **Yes** — bumps `CONSENT_SCREEN_VERSION` (currently a manually bumped constant guarded by a Jest tripwire); every already-confirmed guardian would not have seen it; Decision Log #363 shows the precedent of asking counsel whether existing guardians must be re-notified |
| **N-5** N-2 plus a more specific rejection message | The rejection message | "This file wasn't approved because it may contain content that isn't allowed on Soccernity, such as nudity, violence or hateful symbols." **[COPY PENDING LEGAL REVIEW]** | No; but a specific message tells users what the check looks for and can help someone avoid it (the categories are configuration) |

**[v0.2 CHANGED — #524, #532]** **No notice option has been chosen**, and v0.2 does not choose one. Whether a notice duty exists, and at what level for a child and for a guardian, is for counsel (DPIA addendum Section 12 question 18). Any change to the guardian consent screen bumps `CONSENT_SCREEN_VERSION`. *[v0.2 DISPOSITION: A — N-1 to N-5; non-blocking. D — the `CONSENT_SCREEN_VERSION` bump is engineering housekeeping once an option is chosen.]*

---

## 5. How the DPIA addendum's options would change the disclosure wording **[COPY PENDING LEGAL REVIEW]**

The options themselves are in the DPIA addendum Section 10. This table shows only what each would require the policy to say,
so counsel can see the disclosure consequence of each choice. **No option is chosen.**

| DPIA option | What the policy would have to say |
|---|---|
| **M-2 / M-3** reviewers of children's files must be child-safety vetted | That "specially checked members of our team" review children's files; whether to say how they are checked is counsel's call |
| **M-4** every file open is logged | That access to uploaded files by staff is recorded |
| **F-2** delete on rejection | That a file that is not approved is deleted |
| **F-3 / F-4** private copy kept for N days or for reported/high-confidence files | That a copy of some files that are not approved is kept privately for a stated period for safety and legal reasons |
| **F-5** keep only a one-way hash | That we keep a fingerprint, not the file, to recognise it being uploaded again |
| **L-2 to L-5** labels cleared or kept for a period | A row in the retention table for the check's results |
| **T-3** every minor's file goes to a person | That all pictures and videos from under-18s are looked at by a person before they are shown (Mode A for minors only) |
| **P-2 to P-4** unapproved files are private | That a file is not available at any public address until it is approved (this makes the Section 3.4 sentence true) |

**[v0.2 CHANGED — #430 item 3, #518, #521, B-257, B-258, B-265, B-283, #525]** **Built since:** M-2 and M-3 (a minor's file needs a vetted admin, B-258); P-2 to P-4 in code (private first, two buckets; B-257, B-265; launch step not done); F-2 with an exception (delete on every path unless protected, B-283) and, for set-aside files only, F-4 in effect (#525). **Not built and not decided:** M-4 (logging every file open), T-3, F-5, L-2 to L-5. *[v0.2 DISPOSITION: B — the built ones (counsel's view not recorded); A — the disclosure consequence of each option, for counsel; D — M-4, F-5, T-3 and L-2 to L-5 are founder questions (listed in the report).]*

---

## 6. Assumptions this draft made **[COPY PENDING LEGAL REVIEW]**

1. **Facts are as built, not as operated.** Everything in Section 1 comes from the DPIA addendum; nothing runs on real
   users or real AWS/Cloudflare accounts.
2. **The review model is undecided.** Section 3 gives variants rather than choosing one.
3. **The existing line references in Section 2 (about line 662, 801, 805, 880)** are to `docs/legal-copy-draft-tos-privacy-policy.md`
   at `origin/main` `5857ea8` and will move if that file is edited.
4. **Plain-language wording is a drafting aid.** The reading level appropriate for under-13s, 13 to 15s and 16 to 17s has not
   been determined.
5. **The numbers quoted (24 hours; one frame per five seconds) are product defaults**, not legal figures.
6. **Part C row number 46** is provisional (Section 1).
7. **[v0.2 CHANGED — #524 to #532]** **Assumptions 2 and 3 are stale**: the review model is decided (automatic check first, then report-and-review, #430 item 1) and the legal draft is **v0.16**, not v0.8, so the line numbers in section 2 have moved. **v0.2 reads `CLAUDE.md`'s status bullets and the register as of `origin/main` `014afcd` (2026-11-17)**; no test or build was run, CI could not be read, and the Security session could not be asked. *[v0.2 DISPOSITION: D — housekeeping.]*

---

## 7. Questions for counsel specific to the wording **[COPY PENDING LEGAL REVIEW]**

The full list is the DPIA addendum Section 12. Those that decide *what the wording may say*:

1. Which review model (Mode A or B) may the Policy describe, and may it describe an automatic approval at all?
   *[v0.2 DISPOSITION: B — the review model is decided: automatic check first, then report-and-review (#430 item 1; #524); counsel's view not recorded. A — whether the Policy may describe an automatic approval at all is for counsel; non-blocking.]*
2. May the Policy say a file is "shown only to you" while its storage address is public (Section 3.4)?
   *[v0.2 DISPOSITION: B — the question's premise is overtaken: pending and rejected files are private, copied to public only on approval (B-257; #430 item 2); the two-bucket setup is a founder launch step, not done (B-265, #520, #521). Counsel's view not recorded.]*
3. Must the Policy name Amazon Web Services and Cloudflare, and the region of each, and disclose any opt-out position on
   AI-service improvement?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. The AWS opt-out step is B (founder, #430 item 1; not yet done).]*
4. Must the Policy disclose that audio is not checked and that sampling may miss short content? Or would that be unwise?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*
5. Is a rule against uploading images of children (Section 3.6) appropriate, enforceable and consistent with the platform's
   purpose (grassroots football, where children appear in photographs)?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*
6. Must the guardian consent screen change (N-4), and must existing guardians be re-notified?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. A consent-screen change bumps `CONSENT_SCREEN_VERSION` (D, engineering).]*
7. What may the Policy say about the absence of hash-matching and a statutory reporting path, if anything, before counsel
   has answered the DPIA addendum Section 7 questions?
   *[v0.2 DISPOSITION: A — what the Policy may say about detection and reporting is for counsel; non-blocking (#524, #532). Facts for counsel: the founder has decided detection comes after launch (#526, not built) and will not register with NCMEC or the UK body before launch (#529); a set-aside and evidence-keeping path is built (#525). Counsel's view not recorded.]*
8. Retention rows: which of the options in Section 5 may be described?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. Some options are built (see the note after section 5), none is approved.]*

---

**[v0.2 CHANGED — #524 to #532]** *v0.2 note: a narrow refresh (changelog, disposition markers, notes beside stale statements). It chooses no option, applies nothing, claims nothing as solved and records no counsel position, because counsel has not reviewed this file.*

## Closing statement **[COPY PENDING LEGAL REVIEW]**

This file supplies counsel with a proposed Part C row, a list of existing v0.8 statements that this processing would make
inaccurate, candidate policy sentences in two variants (because the review model is undecided), and five notice options. It
makes **no** claim that any wording is lawful or sufficient, it does **not** choose among the options, and it applies
**nothing** to the policy, the consent screen or the product.
