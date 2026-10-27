# Soccernity — DPIA Addendum: user-uploaded pictures and videos (posts and Contest entries), including minors' files

## DRAFT FOR COUNSEL — NOT APPROVED, NOT LEGAL ADVICE, NOT A COMPLETED DPIA

**Status: draft for counsel review. [COPY PENDING LEGAL REVIEW]**

This is a **new, standalone addendum**. It deliberately does **not** edit
`docs/sprint-1-dpia-outline-draft.md` (v0.3), which is the DPIA it would attach to, and it does not edit
`docs/legal-copy-draft-tos-privacy-policy.md` (v0.8) or `docs/dpia-addendum-contest-view-data-draft.md`. If counsel
accepts it, folding it into the main DPIA (as proposed risks R23 to R31, a new §1.3 row group and new §5 items) is a
separate step for whoever maintains that file.

It was produced by Claude Code acting in the `safeguarding-drafter` role (CLAUDE.md non-negotiable #2: output is
**never** approved; it is a draft for human legal counsel). Nothing here is a statement that Soccernity is compliant
with UK GDPR, EU GDPR, US COPPA, the Nigeria Data Protection Act 2023, the Online Safety Act 2023, the EU Digital
Services Act, any child-protection or obscenity law, or any other regime. **A DPIA is only a DPIA once a competent
person has completed, challenged and signed it.** The sign-off block in Section 13 is empty on purpose.

**Tag convention.** Every heading and every block of proposed wording below carries `[COPY PENDING LEGAL REVIEW]`; the
tag is repeated deliberately so it survives being copied into another document. **[PROPOSAL]** = a suggestion for
counsel to confirm, revise or reject. **[OPEN]** = a decision that belongs to the founder and counsel, which this draft
does not make. **[ASSUMPTION n]** = something this draft took as true; all are listed in Section 11.

- **Document:** DPIA addendum for post and Contest-entry media (images and videos)
- **Draft date:** 2026-10-27
- **Version:** 0.1 (draft, NOT APPROVED)
- **Reviewed by counsel:** NOT YET (Section 13)
- **Companion file:** `docs/legal-copy-part-c-post-media-draft.md` (the proposed Part C row, policy-text candidates and the
  user-facing notice options; it holds the wording, this file holds the risk analysis and the options)

---

## 0. Read this first: three things counsel should know before reading further **[COPY PENDING LEGAL REVIEW]**

1. **The records disagree about who looks at an upload.** Decision Log #419 item 4 and build-register rows B-239 and
   B-241 say *every* upload stays hidden until a human moderator approves it. The pipeline that was actually built
   (`backend/w14-post-media-pipeline`, merged 2026-10-27) works differently when the automatic check is switched on: a
   file the check passes is **approved with no human involved**, a file the check rejects at high confidence is **rejected
   with no human involved**, and only the uncertain middle band (and any file the check could not process) waits for a
   moderator. The existing legal draft (v0.8, PP §2, §5 and §7) already says "flagged images go to a Soccernity moderator" and
   "reviewed by a person if flagged", which matches the built behaviour, not #419 item 4. **Both models are described in
   Section 1.4 and this draft does not choose.** Which model is true at launch changes almost every risk below. [OPEN]
2. **The automatic check is a general-purpose moderation-category detector. It is not a tool for finding known illegal
   material, and nothing in the product hash-matches.** Amazon's own published FAQ says so in terms (Section 5). Nothing
   has been built for the statutory reporting path for illegal content; that path is counsel's to define (Section 7) and
   **nothing in this draft is claimed as solved.**
3. **Nothing described here is live.** There are no real users, no production deployment and no real Rekognition,
   Cloudflare R2 or ffmpeg configuration (Decision Log #409). Several facts below are therefore "as built and tested",
   never "as operated".

---

## 1. Scope: what this addendum covers **[COPY PENDING LEGAL REVIEW]**

A signed-in, non-restricted account (adult or consent-confirmed minor) can upload pictures and one video per post, and a
Contest finalist uploads one video as their Final-week entry. Weekly Contest entries are ordinary posts and use the same
pipeline. Decision Log #419 reversed the earlier "links only" launch (#418 item 7). Avatars and cover photos have their own,
separate pipeline (build-register B-035, B-196) and are **out of scope here**, except where Section 4 notes the shared
Rekognition processor.

### 1.1 The path of one upload **[COPY PENDING LEGAL REVIEW]**

Reproduced from `docs/backend-w14-media-report.md` and `services/api/src/modules/post-media/README.md`, and checked against
the code on `origin/main` at `5857ea8` (2026-10-27).

| Step | What happens | Where the file is |
|---|---|---|
| 1. Link | `POST /media/uploads` (signed-in, guardian consent confirmed). The server returns a one-time link; type and exact length are part of the signature | nowhere yet |
| 2. Upload | The user's browser sends the file **straight to the object store** (Cloudflare R2), into a `quarantine/` prefix. The original is unmodified here and **may carry location and device metadata** | R2, `quarantine/` |
| 3. Confirm | `POST /media/uploads/:id/confirm`. The server downloads the file to a **temporary directory on the application host**, checks size and real file type (magic bytes), then **removes metadata**: images are re-encoded (EXIF/GPS/XMP/IPTC dropped, orientation applied); videos are remuxed with no transcoding (global, stream and chapter metadata dropped; only the first video and first audio stream kept). A video fails closed (nothing stored) if the stripping tool is missing on the host | application host (temp), then R2 |
| 4. Store | The processed file is written to the **public** prefix `post-media/<uploaderId>/<uploadId>.<ext>`; the quarantined original is deleted (at the latest by an hourly purge after 24 h). The row is `pending` | R2, public prefix |
| 5. Check | A background job (every minute) downloads the processed file again to a temp directory on the host and runs the automatic check (Section 4). Outcome: `approved`, `rejected`, or left `pending` for a moderator | host (temp); AWS for the duration of each call |
| 6. Attach | The file is attached to a post by id (`mediaIds`). A free web address for a user's media is no longer accepted on any route | — |
| 7. Show | A post with **any** attached file that is not `approved` is visible to its **author only**; everyone else gets the same "not found" as a post that does not exist | — |

### 1.2 What is stored per upload **[COPY PENDING LEGAL REVIEW]**

One `PostMedia` row per file (migration `20261029100000_add_post_media`). Sensitive-seeming fields are marked.

| Field | Content | Personal data? |
|---|---|---|
| `id`, `sequence`, `createdAt`, `confirmedAt` | identifiers and timestamps | with the uploader link, yes |
| `uploaderId` | the uploading account (including a minor) | Yes: links the file to an account |
| `kind`, `declaredContentType`, `declaredSize`, `contentType`, `byteSize`, `durationSeconds` | what the client declared; what the processed file is | low |
| `quarantineKey` | key of the unprocessed original while it exists | server only |
| `publicKey`, `publicUrl` | where the processed file is stored | the file itself is the personal data |
| `status`, `decisionSource`, `decidedAt`, `decidedBy` | pending / approved / rejected; `auto` or `moderator`; when; which admin id (plain string) | `decidedBy` identifies a staff member |
| `rejectionReason` | "This file didn't meet our rules" for an automatic rejection, or a moderator's written reason | free text by a moderator about a child's file |
| **`checkLabels`** | **moderation category NAMES only** (for example a category such as "Explicit") at or above the pass threshold; no confidence value, no image | **Derived data about a (possibly child) uploader's content. A label on a minor's file could itself be sensitive** (R30) |
| `checkState`, `checkAttempts`, `checkNextAt`, `checkLeaseUntil`, `checkedAt`, `checkError` | bookkeeping; `checkError` is an error NAME, never content | server only |
| `postId` | the post it is attached to | yes |

The processed **file itself** is the main item: a photograph or video that may show the uploader, other people, **children
who are not users**, and places (Sections 1.3 and R29).

### 1.3 Who the processing covers **[COPY PENDING LEGAL REVIEW]**

1. **Uploaders**: any active, non-restricted account, **including minors whose guardian has confirmed consent**
   ("same rules for minors", Decision Log #419 item 8). An account whose email is unverified or whose profile is incomplete
   can upload a file but cannot publish a post (those gates sit on posting, not on the upload routes). Restricted-pending minors cannot upload. Under-16s are not excluded
   from posting (the under-16 tier restricts messaging, Bants and group creation, Decision Log #346). **[ASSUMPTION 1]**
2. **People depicted who are not users**, frequently children (grassroots football photography; v0.3 DPIA R8). The check
   does nothing to identify or protect them (R29).
3. **Contest finalists**, whose single Final-week video is also held until the reveal (00:00 on day 25, Europe/London).
4. **Moderators/admins**, who will view files (R28). No review endpoint or screen exists yet.
5. **Guardians**, who are consent-holders for the minors above; the consent screen does not mention uploads or the check
   (R31).

### 1.4 Two review models, as built **[COPY PENDING LEGAL REVIEW]**

The pipeline behaves in one of two ways depending on whether Amazon Rekognition credentials are configured. Which one
Soccernity launches with is not decided.

| | **Mode A — check not configured** | **Mode B — check configured** |
|---|---|---|
| Who decides a file | A human moderator, for **every** upload | The check decides the clear cases; a human decides the uncertain band, files the check gave up on, and anything **reported** |
| Matches | Decision Log #419 item 4 and register B-239 / B-241 as written | The brief for this addendum and the v0.8 legal draft ("reviewed by a person if flagged") |
| Human sees | every file, including every minor's | the uncertain band and reported items only |
| Fails to | nothing goes live; today **no moderator endpoint exists**, so in Mode A nothing is ever approved | a clear-looking file that is actually unlawful or harmful is **published automatically** (R26) |
| Third-party processor | none for the check | Amazon Web Services (Rekognition) |

Facts common to both: a failed check is retried with doubling back-off and then, after `MEDIA_CHECK_MAX_ATTEMPTS` (default 5),
left `pending` for a moderator; **nothing is ever approved by default**; a moderator's decision is never overwritten by the
check. **A report does not currently reach a moderator as a media report**: the report targets are `post`, `user`, `comment`,
`banter_room`, `grassroots_team` and `fixture` (`moderation.constants.ts`); there is no media target (the Figma design
pass Q left that as an open scope point), and recording the moderation action `content_removed` has not, according to the
moderation README, hidden content (the README says that in terms; the claim was not re-verified in code in this pass).

---

## 2. Purposes and necessity (facts for counsel; no conclusion drawn) **[COPY PENDING LEGAL REVIEW]**

| Element | Stated purpose | Could it be done with less? (observations, for counsel to test) |
|---|---|---|
| Accepting uploads at all | Let members post pictures and videos; let Contest finalists enter a video | Decision Log #419 reversed the earlier "links only" launch. A links-only model avoided Soccernity hosting the files but let a post carry an unreviewed externally hosted file; that gap is closed for users now |
| Metadata stripping | Remove GPS/device data that could locate a child | Necessary for a minors' platform; the open point is the **original** that exists unmodified in quarantine for seconds to 24 hours (R24) |
| The automatic check | Keep clearly unsuitable content from reaching other users, and reduce what moderators must look at | Mode A needs no third-party processor but needs a human to open every minor's file. Mode B sends children's images to AWS to reduce that human exposure. Which is less intrusive is a judgement (R27, R28) |
| Human review | Protect children; decide what the check cannot | Needs staff to view minors' images and possibly unlawful material (R28) |
| Labels and decision fields stored | Audit trail, moderator context, retry logic | The label names are not needed to retry. Whether they are needed after a decision is open (Option 10.3) |

**[OPEN]** Whether accepting video from children at all is proportionate given the coverage limits in Section 6 is a
product-and-counsel question this draft raises (Q3) and does not answer.

---

## 3. Lawful basis **[COPY PENDING LEGAL REVIEW]**

**[PROPOSAL, NOT DETERMINED]** As in the v0.3 DPIA §2.1, this draft does **not** select a lawful basis. For counsel:

- The service "as described in the Terms" (contract) covers storing and showing a user's own post. Whether it also covers
  **sending a child's image to a third-party processor for a safety check**, or **a human reviewing every minor's file**,
  or **retaining labels about it**, may need legitimate interests (with the stronger weighting for a child) or another
  basis, assessed separately for each processing step.
- Images that show a person's face or body are personal data of every person depicted, **including non-users and children
  who never agreed to anything**. Whether the processing of images of **non-user children** needs its own analysis
  (R29) is for counsel.
- **Special-category data.** A photograph can reveal health, ethnicity or religion; the moderation labels name categories
  such as nudity or violence. Counsel to say whether any step engages Article 9 (UK/EU GDPR) and, for children, any rule on
  sexual content involving minors that overrides ordinary data-protection analysis (Section 7).
- **Automated decision-making.** In Mode B the check **rejects a file with no human involved**. Whether an automatic
  rejection of a child's picture or Contest entry is a decision "solely automated" with a "legal or similarly significant
  effect" (UK/EU GDPR Article 22), and whether a route to human review of an automatic rejection is required, is for
  counsel (R23; Q2). No such route is built: a rejected file can only be removed and resubmitted.
- COPPA (US under-13s): the v0.3 DPIA §2.6 treats card verification as the stated control. Whether uploads by a
  verified-consent under-13, and the sending of their images to AWS, are within what that consent covers is for counsel.

---

## 4. What is sent to Amazon Rekognition, and where it goes **[COPY PENDING LEGAL REVIEW]**

Mode B only. Facts from `media-moderation-client.ts` and the W14 report, checked in code.

### 4.1 What IS sent **[COPY PENDING LEGAL REVIEW]**

- **A still image as bytes in the request body.** For a picture: the processed (metadata-stripped) file itself. For a
  video: **one sampled frame per call**, extracted on the application host, **many calls per video** (up to 30 at default
  settings; Section 6). Each image is at most 5 MB; a larger image is downscaled **for the call only** and the stored file is
  untouched.
- **A minimum-confidence number** (the lower of the pass and reject thresholds for that uploader).
- **API credentials and the request metadata any API call carries** (source IP address of the API host, timestamp). The
  source IP is the **host's**, not the user's.

### 4.2 What is NOT sent **[COPY PENDING LEGAL REVIEW]**

No user id, no display name, no username, no account data, no filename, no storage URL, no post text, no caption, no
location, no guardian data, no age or `isMinor` flag. **The uploader's age affects only which thresholds the Soccernity
server applies to the returned labels**; the minor/adult distinction is never sent to AWS. Nothing links a call to a person
on AWS's side except what the image itself shows. No audio is sent (Section 6). The code calls only `DetectModerationLabels`:
**it does not call face detection, face comparison, face search, celebrity recognition, text detection, or any Rekognition
collection feature**, and no face data is created or stored. [ASSUMPTION 2: this describes the code on `origin/main` today.]

### 4.3 What comes back and what is kept **[COPY PENDING LEGAL REVIEW]**

Moderation labels: category name, parent category name, confidence. Soccernity stores **only the category names at or above
the pass threshold** (`checkLabels`), no confidences and no image.

### 4.4 The EU-region question: what is known, what is not **[COPY PENDING LEGAL REVIEW]**

**What the records say.** Decision Log #391 records "EU hosting for everything: Render Frankfurt, Neon/Upstash EU". It does
not name a Rekognition region. The W14 build chose **`eu-west-1` (Ireland)** as the default for `REKOGNITION_REGION` and cited
#391 as the reason. That is an **engineering default**, not a founder choice of Ireland; the founder chose "EU". Cloudflare R2
has no region or jurisdiction setting recorded anywhere in the repo (build-register B-207 is the human launch-gate step). The
application host is Render Frankfurt (`render.yaml`).

**What AWS's own documentation says (retrieved by the drafter on 2026-10-27; see "Sourcing limitations" at the end of
this file).** AWS's Rekognition endpoints page lists, for non-streaming API operations, Europe (Frankfurt)
`eu-central-1`, Europe (Ireland) `eu-west-1`, Europe (London) `eu-west-2` and Europe (Spain) `eu-south-2`. The page's
region-exceptions section names only the streaming API, Custom Labels, Canada (Central) and Israel (Tel Aviv) as having
restricted feature sets; **none of the four European regions above is listed as restricted, and `DetectModerationLabels` is
not named as unavailable in any of them.** The same page does not contain an operation-by-region matrix for the European
regions, so "supported in Ireland" is an inference from the absence of an exception, **not** a stated fact. **[OPEN: confirm
with AWS or in the AWS console that `DetectModerationLabels` is enabled for the account in the chosen region.]**

**What is NOT established.** The FAQ page as retrieved says "Please ensure that the Amazon S3 bucket you want to use is in the
same region as your Amazon Rekognition API endpoint" and contains **no statement about where submitted content is processed or
stored, or whether it moves outside the region**. So whether an image sent to `eu-west-1` is processed **only** in Ireland is
**not answered by the documents retrieved**. Counsel/AWS to confirm in the AWS data-processing terms (Q9).

**Where the data goes in practice (Mode B).** Browser (anywhere) → Cloudflare R2 (location not set) → Render Frankfurt host
(temp copy) → AWS Ireland (default) for each call → back. The data is therefore in, or passes through, at least: the user's
device, Cloudflare's network, Germany, Ireland. Whether each hop is a "restricted transfer" under UK GDPR (assuming it
applies; the legal entity is not yet registered) and what safeguard applies (adequacy regulations for the EEA, the Cloudflare and AWS terms) is for counsel (Q9).

### 4.5 AWS terms on use of submitted content **[COPY PENDING LEGAL REVIEW]**

The AWS FAQ as retrieved says Rekognition "may store and use image and video inputs processed by the service solely to
provide and maintain the service", and that a customer "may opt out of having your image and video inputs used to improve or
develop the quality of Amazon Rekognition" using an **AWS Organizations opt-out policy**. **Whether Soccernity opts out is not
decided and not configured**: the W14 report records it as open (its default 17). Using children's images to improve a
vendor's AI product is the kind of secondary use a DPIA must address. **[OPEN: founder and counsel; decide before real keys
are used. An AWS Organizations opt-out policy requires an AWS Organizations setup, which does not exist today.]**

### 4.6 Sourcing limitations specific to this section **[COPY PENDING LEGAL REVIEW]**

The two AWS pages were fetched with a tool that **summarises the page with a smaller model**; quotation marks above reproduce
the tool's returned text, not a verified copy of the page. Counsel should read the two pages themselves
(`https://docs.aws.amazon.com/general/latest/gr/rekognition.html`, the endpoints page, and `https://aws.amazon.com/rekognition/faqs/`). They may
have changed since 2026-10-27. No AWS data-processing agreement or regional-data-handling document was retrieved.

---

## 5. What the automatic check is, and what it is not **[COPY PENDING LEGAL REVIEW]**

1. **It detects configured moderation categories in a single image.** Soccernity calls `DetectModerationLabels`. The reject
   categories are configuration (`MEDIA_CHECK_REJECT_CATEGORIES`, default "Explicit", "Violence", "Visually Disturbing",
   "Hate Symbols"). Whether these names match Rekognition's current label taxonomy is not re-verified in this pass.
2. **It is not a hash-matching tool for known illegal material, and it does not look for known material at all.** There is no
   comparison of a file against any list of known images (no PhotoDNA, no CSAI Match, no Internet Watch Foundation or NCMEC
   hash list, no Cloudflare scanning-tool integration) anywhere in the code. The product has **no** hash-matching.
3. **AWS says the same about its own product.** The retrieved FAQ text is: "this API does not detect whether an image includes
   illegal content (such as child sexual abuse material)", and that it is not "an exhaustive filter of inappropriate and
   offensive content", and recommends the customer "measure the accuracy on your own data sets". It also says that with a
   higher minimum confidence "some content may not be tagged". (Source and limitation: Section 4.6.)
4. **It is probabilistic.** It can pass a harmful image (a false negative) and reject a harmless one, for example a harmless
   photograph of an injury or a hard tackle (a false positive). Soccernity has **not measured the check's accuracy on football photography or on
   children's images**; the thresholds are placeholders chosen by the engineer (adult pass 40 / reject 90; minor pass 20 /
   reject 80). **[OPEN]** Counsel/founder to say whether any accuracy testing is required before launch (Q5).
5. **It is not an age or identity check.** It does not tell whether a person shown is a child, and Soccernity does not ask it
   to. The "stricter for minors" setting depends only on **who uploaded**, not on **who is shown** (Option 10.5).
6. **It checks the picture, not the surrounding text.** A post caption, a Contest caption or a filename is not sent. The
   pre-publication sensitive-content screen (Decision Log #366) is scoped to Grassroots records and does not apply here
   (assumption 7).

---

## 6. Coverage limits of the check **[COPY PENDING LEGAL REVIEW]**

Facts from `sampleFrameTimes` in `media-moderation-decision.util.ts` and the check service.

**Frame sampling can miss a short clip.**

- A video is not analysed continuously. The server extracts **still frames** at fixed points. With the defaults
  (`MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS` = 5, `MEDIA_CHECK_VIDEO_MAX_FRAMES` = 30), a video of duration D seconds gets
  `n = min(30, ceil(D / 5))` frames, placed at the **middle of each of `n` equal segments**. A 120-second video (the maximum)
  gets 24 frames, at about 2.5 s, 7.5 s, 12.5 s and so on; a 4-second video gets **one** frame at 2 s.
- **Anything visible only between two sampled frames is never seen.** On the defaults that is any content shown for less than
  about five seconds if it falls between sample points (the longest unseen gap is roughly five seconds). A single inserted
  second of unlawful footage in a longer clip, or in the first or last seconds of a clip, can pass.
- The only protection against this in the product is the (adjustable) interval, which trades check cost for coverage. Lowering
  the interval raises the number of AWS calls per video (cost, and more images of a child sent to AWS) and the per-minute
  batch size is 10 files per instance.
- **A video that the check passes is approved automatically in Mode B**, so this gap has a direct route to public view.

**Audio is not checked.** The processor keeps the first audio stream when it remuxes, so the audio is stored and shown, but
**nothing examines it**: no speech, no abuse, no grooming language, no personal data spoken aloud, no unlawful sound. No
transcription exists. Audio is never sent to AWS.

**Other limits.** (a) Overlaid or in-image text is not read (no text detection is called). (b) Faces are not analysed, so
nothing detects that a child appears. (c) A picture over 5 MB is downscaled before the call, so fine detail may be lost to
the check while the stored file keeps it. (d) Frames are decoded from the **processed** file, which is the file shown to
users, so the check cannot be evaded by metadata tricks; it can be evaded by content the model does not recognise.
(e) Animated images are flattened to one frame before storage, so what is checked is what is stored. (f) A moderator-held
file can only be examined once a review tool exists; today none does.

---

## 7. The statutory reporting path for illegal content: counsel's questions, nothing solved **[COPY PENDING LEGAL REVIEW]**

**State of the product.** Soccernity has **no** process, route, role, record or code for: detecting known illegal material;
preserving evidence; reporting suspected illegal content or a suspected offence to a public authority or a designated
hotline; notifying a regulator; or handling a request from law enforcement. Build-register B-206 is "OPEN, NO DECISION;
counsel" and says no code is to be written until counsel answers; Decision Log #419 widened its scope on 2026-10-27 from
avatars to every user-uploaded post and Contest-entry image and video, and to the moderators who review them. The v0.8
legal draft (Part C row 37) lists "whether hash-matching ... is available on the storage provider (Cloudflare R2 coverage
unconfirmed) and what statutory duties attach to hosting images of minors" as pending counsel.

**The drafter's pointers, from general knowledge only — NOT retrieved, NOT verified, NOT a claim about what any of them
requires or whether it applies.** Counsel will know which apply; this list exists so nothing is forgotten:

- **United Kingdom.** The Online Safety Act 2023 (duties on user-to-user services about illegal content, children's safety,
  risk assessment, reporting and removal, and the regulator Ofcom's codes of practice, which may include expectations about
  hash-matching for some services); the duty, where it applies, to report child sexual exploitation and abuse content to
  the National Crime Agency; the Protection of Children Act 1978 and related offences (making, possessing, distributing
  indecent images of children); the role of the Internet Watch Foundation and its hash lists.
- **European Union / EEA users.** The Digital Services Act (notice-and-action, duties to notify suspicions of criminal
  offences involving a threat to life or safety, minors' protection obligations); Regulation (EU) 2021/1232 (interim
  derogation permitting certain voluntary detection of child sexual abuse material) and any successor; the proposed
  child-sexual-abuse regulation.
- **United States.** 18 U.S.C. § 2258A (provider reporting of apparent child sexual abuse material to the NCMEC
  CyberTipline) and COPPA.
- **Nigeria.** The Cybercrimes (Prohibition, Prevention, etc.) Act and the Child's Rights Act provisions on child sexual
  abuse material; the NDPA 2023 for the data-protection side.

**Questions for counsel (none answered here):**

1. Which of these regimes apply to Soccernity given its jurisdictional scope (Decision Log #4), its UK/Nigeria launch and
   its EU/US users, and does any impose a **hash-matching or proactive-detection duty**?
2. If a hash-matching duty or strong expectation exists, what satisfies it: a Cloudflare R2 scanning tool (coverage of R2
   storage is unconfirmed), an industry hash list obtained by membership, or a third-party service? Is a **vendor that
   receives children's images for this purpose** a new processor?
3. What is the **reporting path** when a moderator, a user report or an automatic label suggests a file may be unlawful: who
   is the recipient (NCA, IWF, NCMEC, Nigerian authorities, a regulator), within what time, by whom at Soccernity, and what
   record must be kept?
4. **Evidence handling.** Must or may Soccernity **preserve** a suspected-unlawful file (and who may view or copy it), or must
   it delete it at once? Today a rejected file is **kept** in the object store (Option 10.2) and the uploader can delete it
   (which removes the evidence) — neither is a position counsel has taken.
5. **Moderator exposure to unlawful material.** What legal protection and what safeguarding for staff who may view such
   material in the course of review; is it lawful for ordinary staff to open a suspected file at all?
6. **Timing.** May post and Contest-entry upload go live **before** the statutory path exists? Register B-239 records this
   as undecided.
7. **Platform duties to children.** Does hosting minors' images engage any additional risk-assessment or children's-safety
   duty beyond data protection (the Age Appropriate Design Code and the OSA children's duties)?
8. Is the **combination** of "no hash-matching + 5-second frame sampling + no audio check + automatic approval" (Mode B) an
   acceptable system for a platform whose users include children, or is Mode A (a human opens everything) the minimum?

---

## 8. Risks (proposed R23 to R31; numbering continues after the view-data addendum's R17 to R22) **[COPY PENDING LEGAL REVIEW]**

Numbering assumes `docs/dpia-addendum-contest-view-data-draft.md` (R17 to R22) is accepted; renumber if it is not. Ratings are
placeholders for counsel, in the same convention as the v0.3 DPIA.

### R23 — The review model is not settled, and in one mode nothing can ever be published **[COPY PENDING LEGAL REVIEW]**

Section 1.4. The decision record says a human approves every upload; the build lets the check approve and reject without
a human; the legal draft says "reviewed by a person if flagged". In Mode A no moderator tool exists, so no upload is ever
approved; in Mode B an unreviewed file can be published and an unreviewed rejection of a child's file can stand. An
automatic rejection has no appeal route and may engage UK/EU GDPR Article 22.

*Draft severity: high. Draft likelihood: certain (it is how the code and records stand). Placeholder ratings.*
**[ACTION FOR REVIEW]** Founder to decide the model; counsel to review the one chosen. The documents describing it (Decision
Log #419, build-register, v0.8 legal draft, and the product itself) must be reconciled before any of this reaches users.

### R24 — Files that are not yet approved, or were rejected, can be fetched by anyone who has the address **[COPY PENDING LEGAL REVIEW]**

W14 deliberately writes the processed file to the **public** prefix before the check or any human has seen it (W14 report
default 2, follows the brief). The service never *returns* the address to anyone but the uploader, and the key contains two
random identifiers, but **anyone who holds the address can fetch it** (it is not a signed, expiring link). A rejected file is
**kept**, not deleted. The uploads share **one bucket** with the quarantine prefix (`S3_BUCKET` is a single variable), and
the optional `S3_PUBLIC_BASE_URL` makes a bucket publicly readable; whether public reading is bucket-wide or prefix-scoped is
an R2 configuration that is not decided (a launch-gate step), so the unmodified **originals with location data** could share
that exposure. The address of a pending file also appears in the uploader's own browser, may be shared by the uploader, and
may appear in logs.

*Draft severity: high. Draft likelihood: moderate (needs the address). Placeholder ratings.* The W14 report recommends, and
this draft passes on to counsel without deciding, keeping pending files in a **private** prefix and copying to the public
prefix on approval (Option 10.6).

### R25 — Illegal material: no detection, no hash-matching, no reporting or evidence path **[COPY PENDING LEGAL REVIEW]**

Sections 5 and 7. A children's platform that accepts images and video from the public and is built to publish a clear-looking
file with no human involved (Mode B) has no mechanism to find known unlawful material or to report it.

*Draft severity: high. Draft likelihood: moderate to high over time, unknown at launch. Placeholder ratings.*
**[ACTION FOR REVIEW]** Counsel: Section 7. Until answered, nothing here claims the risk is mitigated.

### R26 — Coverage gaps let harmful files be approved automatically **[COPY PENDING LEGAL REVIEW]**

Section 6. Frame sampling at five-second spacing misses short content; audio is unexamined; the thresholds are untested on
football photography or on children's images; text is not read; the check does not know who is depicted. In Mode B a file that
passes is published to all eligible users, including other children.

*Draft severity: high. Draft likelihood: moderate. Placeholder ratings.*

### R27 — Children's images go to an additional processor and across borders, with AI-improvement terms undecided **[COPY PENDING LEGAL REVIEW]**

Section 4. Mode B sends the processed image, or many frames per video, of an identified-by-context child's upload to AWS
(Ireland by default), alongside Cloudflare for storage and Render for processing. The region for Rekognition is an
engineering default; whether Rekognition processes only in that region is not established; whether AWS may use the images to
improve its services is not decided; no data-processing agreement or transfer assessment has been done.

*Draft severity: high. Draft likelihood: certain once Mode B is used. Placeholder ratings.* **[ACTION FOR REVIEW]** Counsel:
Q7 to Q10. This extends v0.3 DPIA R11 (sub-processor exposure), whose text predates the choice of Cloudflare R2 and AWS.

### R28 — Moderators and other staff will see children's images and possibly unlawful material, with no access rules yet **[COPY PENDING LEGAL REVIEW]**

No review endpoint or screen exists. The report queue is gated on `AdminUser.childSafetyVetted` for reports marked as
concerning a minor (`concernsMinor`); **nothing says that the same gate applies to the media queue**, and a media file has
no `concernsMinor` flag. Roles are `editor`, `moderator`, `superadmin`; the admin action log exists (it records, for example,
a date-of-birth view) but nothing records who opened which file. Pending files are on a public address (R24), so a
staff member can also view a file without going through any tool. Staff welfare for exposure to harmful material is not
addressed anywhere.

*Draft severity: high. Draft likelihood: certain once review exists. Placeholder ratings.* Extends v0.3 DPIA R9.

### R29 — People depicted who are not users, especially children, are unaffected by any control **[COPY PENDING LEGAL REVIEW]**

Extends v0.3 DPIA R8, whose text refers to the earlier free-link path (`Post.mediaUrls`), which has been replaced. The check
does not detect that a child appears, the uploader attests to nothing, and no consent of a depicted child or their parent is
sought. A route for a non-user to report exists in general (`POST /reports/public`, legal draft row 35) but the report
targets contain **no media target** (Section 1.4). The legal draft's PP §13 offers an email to `support@soccernity.com`.
Weekly Contest entries and Final-week videos are by design competition footage that can show other children.

*Draft severity: high. Draft likelihood: high (grassroots football photography). Placeholder ratings.*

### R30 — Retention: check labels, rejected files, decision fields and unattached uploads have no defined clock **[COPY PENDING LEGAL REVIEW]**

Facts: the original is kept for seconds to at most 24 hours; a never-confirmed upload for at most 24 hours (hourly purge, a
bucket lifecycle rule is recommended but is a human step); the processed file and the row live with the post, and are deleted
on `DELETE /posts/:id`, on `DELETE /media/uploads/:id`, and when the account is anonymised. **No separate retention clock
exists for: a rejected file, the check labels, the rejection reason, the decision fields, or a confirmed upload that is never
attached to a post (kept indefinitely in the public prefix).** Object deletion after a database delete is best effort and
logged, with no reconciliation job; an object-store outage leaves orphaned files. A label such as "Explicit" attached to a
minor's account is a derived record about a child's content. When an account is anonymised the media rows and objects are
deleted but **the surviving post loses its files** (Decision Log #341 keeps the post), which is the conflict
Decision Log #419 itself flagged; a **reported** post, or one under a legal hold (#398), whose author deletes it or is
anonymised, loses its evidence (register B-239 point 3, not decided). Backups at the hosting provider are not analysed.

*Draft severity: moderate. Draft likelihood: certain. Placeholder ratings.* Options 10.2, 10.3.

### R31 — No notice to the uploader or the guardian about the check, the reviewers or the retention **[COPY PENDING LEGAL REVIEW]**

The guardian consent screen does not mention uploads. The uploader is told only that a file did not meet the rules, in a
generic sentence, and sees no explanation that an automated tool from a third party looked at their picture. The v0.8 legal
draft discloses the check for avatars and cover photos only (PP §5). Changing the guardian consent screen's wording bumps
`CONSENT_SCREEN_VERSION` and would raise whether already-confirmed guardians must be re-notified (as in Decision Log #363).

*Draft severity: moderate. Draft likelihood: certain. Placeholder ratings.* Option 10.4 and the companion file.

---

## 9. Mitigations already in the product (as built; not live; none reviewed by counsel) **[COPY PENDING LEGAL REVIEW]**

- No free web address for a user's media is accepted on any route; a request carrying one is a 400.
- Direct-to-storage upload through a one-time link bound to the declared type and exact length; per-user throttle
  (30 links per hour by default).
- Real file type verified by magic bytes; size and video duration limits enforced by the server; image decode under a
  100-megapixel guard; GIF and HEIC refused.
- Metadata (including location) stripped from images by re-encode and from videos by remux before anything can be shown; the
  unmodified original deleted straight after, and in any case within 24 hours.
- A video upload fails closed (nothing stored) if the stripping tool is unavailable.
- **Nothing is approved by default**: a missing key, a failed or unfinished check, or an exhausted retry leaves the file
  pending; a moderator's decision is never overwritten.
- A post with any unapproved file is visible only to its author on every read path, including search, saved posts, the
  carousel and the pinned entry; a Contest entry with an unapproved video is neither shown nor ranked.
- Thresholds are stricter when the uploader is a minor (fresh read of `isMinor` at check time).
- Restricted-pending minors cannot upload (the consent guard is on the upload routes); the email-verified and profile-complete gates apply to posting, not to the upload itself.
- Deleting a post or anonymising an account deletes the files; the quarantine is purged hourly after 24 hours.
- Only the category names above the threshold are stored, never the image or a confidence; nothing identifying the user is
  sent to AWS.
- A rejected file's reason shown to the uploader is generic for an automatic rejection.

---

## 10. Options, not decisions **[COPY PENDING LEGAL REVIEW]**

Each option lists what it would require and what it trades off. **The drafter recommends none.** Options may be combined.

### 10.1 Moderator access controls and logging **[COPY PENDING LEGAL REVIEW]**

| Option | Would require | Trade-off |
|---|---|---|
| M-1 Reuse today's roles only (`moderator`, `superadmin`) | Nothing new | Any such staff member can open any child's file; no record of who opened what |
| M-2 Restrict the media queue to child-safety-vetted staff (`childSafetyVetted`), as for `concernsMinor` reports | A gate on the future review endpoints; vetting is recorded by a superadmin, no verification is done by the system | Smaller reviewer pool; slower review (which matters for the Contest deadline, B-239 point 1). Whether vetting is required is Decision Log #419's undecided point |
| M-3 Vetted-only for **minors' files**, ordinary moderators for adults' | The queue knows the uploader's age tier at read time | Two queues; still exposes a minor's file to the vetted pool |
| M-4 Log every file open (admin, file, time) in the existing admin action log, never the image; as for the date-of-birth view precedent | A log write on each open, failing closed | Log growth; the log is itself a record about children's files |
| M-5 Show files to reviewers through **short-lived signed links** or a proxied view, never the public address; no download control | R2 signed reads or an API proxy | Needed anyway if pending files move to a private prefix (10.6) |
| M-6 Reduced-exposure review: blurred or low-resolution first view, click to reveal | A rendering step | Added tooling; reduces accidental exposure |
| M-7 Two-person review for anything labelled in a reject category, or any minor-uploaded video | A second-reviewer rule like the appeal rule (Decision Log #138) | Slower |
| M-8 Written reviewer guidance, a reporting route for staff who see unlawful material, and welfare support | Process, not code | Needs counsel's input (Section 7 question 5) |

### 10.2 Retention of rejected files **[COPY PENDING LEGAL REVIEW]**

Built today: rejected files stay in the object store until the uploader removes them, the post is deleted, or the account is
anonymised.

| Option | Would require | Trade-off |
|---|---|---|
| F-1 Keep as built | Nothing | Unlawful or harmful content stays on a public address (R24); uploader's deletion destroys evidence |
| F-2 Delete on rejection (object and row) | A delete call on reject | No evidence, no audit of why; conflicts with any preservation duty (Section 7 question 4) |
| F-3 Delete the **public** copy on rejection, keep a quarantined/private copy for N days | A move to a private prefix; N chosen by counsel | Keeps a suspect file; needs access rules (10.1) |
| F-4 Keep a private copy **only** for files that were rejected in a reject category at high confidence or reported, for N days or until counsel says | A flag and a purge job | The retention clock and the legal-hold interaction (#398) need defining |
| F-5 Hash-and-delete: keep only a one-way hash, not the file | A hash step; counsel decides whether a hash alone is enough | Helps detect re-uploads; not evidence of content |

### 10.3 Retention of the check's category labels and decision fields **[COPY PENDING LEGAL REVIEW]**

Built today: `checkLabels`, `rejectionReason`, `decisionSource`, `decidedAt`, `decidedBy` live as long as the row.

| Option | Would require | Trade-off |
|---|---|---|
| L-1 Keep with the row | Nothing | A derived record about a child's content persists as long as the post |
| L-2 Clear `checkLabels` once a decision is final (auto or human) | A write on decision | Loses moderator context on later review of an approved file |
| L-3 Keep labels only for rejected and moderator-decided rows, for N days | A purge job | Needs N from counsel |
| L-4 Keep labels but never expose them, and purge them when the uploader is anonymised or turns 18 | Extend the anonymisation and age-reclassification steps | Meets "no longer needed" only partly |
| L-5 Keep `decidedBy` only as long as needed for a complaint/appeal window, then null it | A purge job | Staff-accountability record is lost afterwards |

### 10.4 A user-facing "what is checked" notice **[COPY PENDING LEGAL REVIEW]**

Context: the uploader is told only "This file didn't meet our rules"; the guardian consent screen is silent. The proposed
wording for each option is in `docs/legal-copy-part-c-post-media-draft.md` Section 3.

| Option | Where | Needs a guardian-consent change? |
|---|---|---|
| N-1 Policy text only | Privacy Policy | No |
| N-2 N-1 + a line in the composer where the file is chosen ("Pictures and videos are checked automatically and may be reviewed by a person before they are shown.") | Composer (a Figma frame and a code change) | No |
| N-3 N-2 + a once-only plain-language notice for under-18s at their first upload | Composer | No |
| N-4 N-3 + a guardian-facing line | Guardian consent screen | **Yes** (bumps `CONSENT_SCREEN_VERSION`; every already-confirmed guardian would not have seen it) |
| N-5 N-2 + a rejected-file explanation naming the categories that would normally be rejected (without revealing thresholds) | Rejection message | No, but a more specific message can help a user avoid the rule and can reveal what the check is looking for |

### 10.5 Thresholds that are stricter for minors' accounts **[COPY PENDING LEGAL REVIEW]**

Built today: same reject categories for everyone, lower numbers for a minor uploader (pass 20 / reject 80 against adult
pass 40 / reject 90); decided by `User.isMinor` at check time.

| Option | Would require | Trade-off |
|---|---|---|
| T-1 Keep as built | Nothing | More minors' files held for review (workload); more false rejections of harmless content; none of this has been tested |
| T-2 Wider reject-category list for minors | Configuration | Same trade-off, more strongly |
| T-3 Send **every** minor's file to a human regardless of score | A branch in the decision rule | Equals Mode A for minors only; maximum protection; most exposure of staff to children's images |
| T-4 Key the threshold to the **people depicted** rather than the uploader | A child-in-image detector, not available in the current check | Would send more analysis of children's faces to AWS; no such tool is in scope |
| T-5 Under-16s stricter than 16 to 17s | A tier lookup | Another tier to maintain; the under-16 tier already exists (#346) |
| T-6 Measure first: run both modes on a test set of football photographs and minors' sample images with consent and set thresholds from results | Test data and process | Needs a lawful, safe source of test images |

### 10.6 Where an unreviewed file lives before it is approved **[COPY PENDING LEGAL REVIEW]**

Added because R24 turns on it. Built today: the public prefix.

| Option | Would require | Trade-off |
|---|---|---|
| P-1 Public prefix as built | Nothing | R24 |
| P-2 Private prefix until approved, then copy to public | A `copy` call on the storage layer; the check reads from private | Extra storage write; removes the unreviewed-file exposure; supports M-5 |
| P-3 Private always; serve through signed expiring reads | A serving layer; CDN rules | Largest change; no public address ever exists for a file |
| P-4 Separate buckets for quarantine, private and public | Provider configuration | Strongest separation; a launch-gate configuration task |

---

## 11. Assumptions this draft made **[COPY PENDING LEGAL REVIEW]**

1. **Under-16s are uploaders.** Nothing in the code limits an under-16 from uploading; the under-16 tier restricts other
   features (Decision Log #346). Assumed intended.
2. **The code on `origin/main` at `5857ea8` is what runs.** Sections 1, 4 to 6 and 9 rest on `docs/backend-w14-media-report.md`,
   `services/api/src/modules/post-media/README.md` and direct reads of `media-moderation-client.ts`,
   `media-moderation-decision.util.ts`, `media-check.service.ts` and `.env.example`. The e2e and unit suites were not re-run
   in this pass.
3. **"Same rules for minors" means identical processing with stricter thresholds**, not a separate reduced-data path
   (Decision Log #419 item 8).
4. **The W14 report's statement of what is never stored is accurate.** Application logs, Sentry error reports, the hosting
   provider's request logs, Cloudflare's logs and AWS's logs were not examined. A log line could contain a storage key or an
   upload id.
5. **A single R2 bucket holds all prefixes** (one `S3_BUCKET` variable); whether public reading is bucket-wide is a
   configuration not decided.
6. **A crashed worker can leave a temporary copy** in the host's temp directory (it is removed in a `finally` block, which a
   hard kill can bypass). Not tested.
7. **The pre-publication sensitive-content screen (Decision Log #366) does not cover post text or captions.** Its scope was
   Grassroots records; assumed unchanged.
8. **No moderator tool exists.** Everything about reviewer behaviour is from the decision record and the design (Figma pass Q),
   not from running software.
9. **The report path for media is the post report.** Assumed that a user who objects to a picture reports the post; no
   media-specific target exists.
10. **The AWS documents quoted in Sections 4 and 5 are accurate as retrieved through a summarising tool**, and unchanged
    since 2026-10-27 (Section 4.6).
11. **The 5-second interval, 30-frame cap and the numeric thresholds are engineering defaults**, not legal figures and not
    tested on football or children's images.
12. **All processing described is test-only.** No live data exists; nothing here has been run on children's images.
13. **The v0.3 DPIA R8, R9 and R11 texts are read as not yet updated for the media pipeline** (R8 still refers to
    `mediaUrls`; R11 records media storage as unselected). This addendum extends them rather than correcting them.

---

## 12. Questions counsel must answer **[COPY PENDING LEGAL REVIEW]**

**Review model and decisions**

1. Which review model is acceptable for a platform whose users include children: **Mode A** (a human sees every file) or
   **Mode B** (the check decides the clear cases)? If Mode B, is automatic **approval** of a child's picture or video
   acceptable given Sections 5 and 6?
2. Is an **automatic rejection** of a child's file a decision to which UK/EU GDPR Article 22 applies, and is a route to human
   review of a rejection required? (R23)
3. Is accepting **video** from children proportionate, given that frame sampling, no audio check and no hash-matching are all
   present at once? Should video be restricted for minors, or for under-16s, until stronger controls exist?

**The check and its limits**

4. What lawful basis supports sending a child's image to AWS for a safety check, and does it differ for an adult uploader's
   image that shows a child?
5. Is any **accuracy testing** required before launch, and on what data? (Section 5 item 4; Option T-6)
6. May the thresholds differ by **uploader age** only, or must they reflect **who is depicted**? (Option 10.5)

**Processors, regions and transfers**

7. Is **Amazon Web Services** an acceptable processor for children's images, and what contract and safeguards are needed?
8. Must Soccernity **opt out** of AWS using inputs to improve Rekognition, and is that opt-out a precondition for real keys?
9. Does the chosen Rekognition region (default Ireland) process **only** in that region, and does the Frankfurt host → Ireland
   → Cloudflare chain constitute restricted transfers under UK GDPR (and under the NDPA for Nigerian users) needing a
   safeguard or assessment? Is the **R2 bucket location** (unset) acceptable?
10. Is a transfer assessment or data-processing agreement required for Cloudflare as well as AWS?

**Illegal content**

11. Section 7 questions 1 to 8 (detection and hash-matching duty, reporting path and recipient, evidence handling, staff
    exposure, whether upload may go live before the path exists, platform duties to children, adequacy of Mode B).

**Staff and access**

12. Must reviewers of minors' media be **child-safety vetted** (equivalent to the DBS-type check v0.3 DPIA R9 raises)?
    Which option in 10.1 is required? Must every file open be logged?
13. What welfare and legal protection must exist for reviewers who may see unlawful material?

**Retention and deletion**

14. What retention is defensible for: a rejected file; a confirmed upload never attached to a post; the check labels; the
    rejection reason; the moderator id; the metadata of an unattached upload? (Options 10.2, 10.3)
15. Is the **public address of an unreviewed or rejected file** acceptable for any period (R24)? Must pending files be
    private?
16. When an **account is anonymised**, is deleting a surviving post's files (rather than the post) the right outcome, and how
    do a **report** or a **legal hold** (#398) preserve the file? (R30)
17. After anonymisation, are the check labels and decision fields linked to an anonymised id still personal data?

**Transparency and consent**

18. Is there a **notice duty** about the automated check and human review, to the uploader, and to the guardian of a minor,
    and at what age-appropriate level? Does the guardian consent screen need to change (and must existing guardians be
    re-notified)? (Option 10.4; R31)
19. Does the processing of **images of non-user children** (R29) require a consent or notice mechanism, or only a
    take-down route? Is a media-specific report target required?

**Documents**

20. Which existing statement in the DPIA or the legal draft is now inaccurate and must change (v0.3 R8, R9, R11; v0.8 PP §5
    "avatars and cover photos"; PP §7; Part C row 37)?

---

## 13. Sign-off **[COPY PENDING LEGAL REVIEW]**

This block is intentionally empty. A completed addendum requires a competent person to challenge and sign it.

| | |
|---|---|
| Reviewed by counsel | NOT YET |
| Name / firm | |
| Date | |
| Outcome (approved / approved with amendments / rejected) | |
| Founder acknowledgement | |
| Decision Log entry created | |

---

## Sourcing limitations (referenced from Section 4.6) **[COPY PENDING LEGAL REVIEW]**

1. **Facts about the product** come from `docs/backend-w14-media-report.md`, `services/api/src/modules/post-media/README.md`,
   Decision Log #419 as summarised in `CLAUDE.md` and `docs/build-register.md` (rows B-036, B-037, B-206, B-238, B-239, B-241),
   and direct reads of the five source files named in assumption 2 on `origin/main` at `5857ea8` (2026-10-27). The Decision
   Log `.docx` itself was not opened. Nothing was run against a live service.
2. **Facts about Amazon Rekognition** were retrieved on 2026-10-27 from two AWS pages
   (`docs.aws.amazon.com/general/latest/gr/rekognition.html` and `aws.amazon.com/rekognition/faqs/`) through a fetch tool that
   summarises the page with a smaller model. Quotation marks reproduce the tool's text, not a verified copy. A third page (the
   Rekognition content-moderation developer guide) was fetched and added nothing beyond the existence of the feature, of the
   label list, and of an optional human-review service. **No AWS data-processing terms were retrieved.**
3. **No statute, regulator guidance, code of practice or case law was retrieved or checked.** Every reference to a regime in
   Sections 3 and 7 is the drafter's general knowledge, written to tell counsel where to look, not to assert what any regime
   requires or whether it applies. This is the same limitation the v0.3 DPIA states at its §0 item 5.
4. **Counsel has not seen this processing.** The founder's decisions (#419) are product decisions, not legal clearance.

---

## Closing statement **[COPY PENDING LEGAL REVIEW]**

This addendum exists to put in front of counsel exactly what happens when a child uploads a picture or a video: the file is
sent from the browser to storage, stripped of metadata, optionally sent frame by frame to a third-party moderation service
that cannot find known illegal material, and then either decided by a machine or held for a person who has no tool yet; and
that Soccernity has **no** hash-matching, **no** audio check, **no** statutory reporting path, **no** retention clock for
rejected files or labels, and **no** notice to the child or the guardian. It makes **no** claim that any of it is lawful,
proportionate or compliant, and it claims **nothing as solved**.
