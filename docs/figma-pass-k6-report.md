# Figma pass K6 — Restricted Pending cleanup, own-profile handles, logged-out links, profile image and rephrase states

Date 2026-10-24. Branch `figma/pass-k6-restricted-pending-profile-states`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`; `docs/build-register.md` not edited (status lines are in section 8). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Read first: `docs/figma-pass-k5-report.md`, Decision Log #371, #394, #398, #404, #411, build register B-035, B-036, B-037, B-081, B-194, B-198, B-199, B-201, B-202.

Nothing was deleted. Everything replaced is hidden and renamed with the `ARCHIVED — ` prefix. New frames sit below the existing canvas (y 90654 to 95000), nothing over an existing frame.

## 1. Restricted Pending frames `5108:6630` (desktop) and `5531:7461` (mobile)

Four nodes were hidden and renamed after a page-wide scan of every node that has prototype reactions (894 nodes) found **0 inbound references** to any of them:

| Node (desktop / mobile) | Was | Now |
|---|---|---|
| `5114:6704` / `5531:7533` | Resend Note: "Last sent 2 hours ago. Didn't arrive? Check their spam folder, or send it again." | hidden, `ARCHIVED — Resend Note (K6, #411 item 6: code renders no persistent resend note)` |
| `5114:6677` / `5531:7506` | Note — OPEN DECISION: "SCOPE OPEN — does restricted-pending also limit Grassroots record-keeping and Sports Hub? See Design Notes frame." | hidden, `ARCHIVED — Note — SCOPE OPEN (K6, #411 item 6: answered, Grassroots limited, Sports Hub works)` |

The registration status line (`6627:22218` / `6627:22219`) and its tag were not touched; both are still visible. Frame heights are unchanged (1218 and 1625; both frames have a fixed height, the auto-layout columns inside reflowed). `findAll` counts are unchanged (73 and 73) because hidden nodes are still counted.

**Exact final visible wording** (desktop and mobile identical):

- Pill: `WAITING FOR GUARDIAN APPROVAL`
- Heading: `Your account is waiting for approval`
- Subheading: `We emailed sarah.bello@example.com. Until they approve, the things below are switched off to keep you safe.`
- Card `Switched off until your guardian approves`: `Your profile is hidden` / `Nobody can find you in search or open your profile page.` (OFF); `Direct messages are off` / `Accounts you have not verified cannot message you.` (OFF); `Banter Rooms & Community Groups are read-only` / `You can read posts and conversations, but you cannot post in either.` (OFF)
- Card `What you can still do`: `Browse and read` / `Look around the Sports Hub, the Blog and Banter Rooms. Following and posting switch on once your guardian approves. [COPY PENDING LEGAL REVIEW]`; `Check scores and fixtures` / `The Sports Hub works normally.`; then `Registration cannot be completed until your guardian approves, including card verification where required. [COPY PENDING LEGAL REVIEW]`
- Buttons: `Resend approval request`, `Change guardian email`

Screenshot of the desktop frame read back after the change. Mobile was edited with the same operation and the same ids pattern; not re-screenshotted separately.

Not drawn (B-198 says nothing is drawn unless asked): a line saying Grassroots record-keeping is limited. The frame therefore no longer mentions Grassroots at all.

## 2. Own-profile desktop post author handles (B-201)

The founder's instruction was to align the post author **handle** to `@nelson_iheagwam` on `6747:29094`, `6747:29291` and `6747:29445`, and to leave `@mekusa` on the other-user frame `6747:28894` (untouched).

**Judgment call, flagged.** On all three frames the visible post cards read **"Emeka John" or "Eleanor Pena"** next to `@mekusa` (inherited from the legacy frames). Changing only the handle would have put another person's name beside the profile owner's handle. So both the author **name and the handle** were set to the owner: `Adeniyi Christiana` / `@nelson_iheagwam`, the same pairing the header card and the K5 mobile frames already use. 12 nodes (name and handle per card) changed; old values are recorded below so this can be reverted in one pass.

| Frame | Cards changed | Old name / handle |
|---|---|---|
| `6747:29094` Own — Posts | 4 (`6781:29599`/`29601`, `29715`/`29717`, `29752`/`29754`, `29787`/`29789`) | Emeka John, Eleanor Pena, Emeka John, Emeka John / `@mekusa` |
| `6747:29291` Own — Media | 4 (`6782:30301`/`30303`, `30373`/`30375`, `30619`/`30621`, `30656`/`30658`) | Eleanor Pena, Emeka John, Eleanor Pena, Emeka John / `@mekusa` |
| `6747:29445` Own — Saved | 4 (`6766:29350`/`29352`, `29467`/`29469`, `29503`/`29505`, `29544`/`29546`) | Emeka John, Eleanor Pena, Emeka John, Emeka John / `@mekusa` |

Left as they were, on purpose: `@mekusa` in the **Suggested** list (a list of other people), the hidden K2 columns that still carry `@christine001` (archived), and every handle on the other-user frame `6747:28894`.

Consequence on the **Saved** frame: a saved-posts tab now shows only the owner's own name. That matches the K5 mobile Saved frame (`5778:8567`), which already did the same, but it is sample data; a real Saved tab shows other people's posts. OPEN: the post avatars on these cards are still the photos of the original (other) people; they are images, not text, and were not changed.

## 3. Logged-out frame prototype links (B-202)

Every link is an `ON_CLICK` → `NAVIGATE` reaction set as a **per-instance override** (NAVIGATE cannot be set on a component's own descendants, Decision Log #249). Each was read back from a fresh node handle. The component masters (`6793:29290`, `6793:29304`, `6793:29309`) were read back too and carry no reaction.

| Source (frame) | Node | Destination | Destination id |
|---|---|---|---|
| closed header `6784:29476` | Login button `I6794:29280;6793:29290` | Login mobile | `1625:2303` |
| drawer-open frame `6785:29485`, header instance | Login button `I6794:29297;6793:29290` | Login mobile | `1625:2303` |
| drawer instance `6794:29313` | Button — Login `…;6793:29304` | Login mobile | `1625:2303` |
| drawer instance | Button — Sign up `…;6793:29306` | Guardian Consent — 1 Age Gate — Mobile (the first sign-up screen, #367) | `5539:7264` |
| drawer instance | Nav — Sports Hub `…;6793:29309` | Sports / Livescores — Logged Out — Mobile | `5647:8023` |
| drawer instance | Nav — Blog `…;6793:29312` | Blog Page Mobile — Logged Out | `5956:11331` |
| drawer instance | Nav — Scouting `…;6793:29315` | Coming Soon — Mobile — Logged Out | `6477:20764` |
| drawer instance | Nav — Academy `…;6793:29318` | Coming Soon — Mobile — Logged Out | `6477:20764` |

Already wired and still in place: the closed header's menu button → the open-drawer frame (K5), and the drawer Scrim close (inherited from the component).

Targets are the **mobile** frames because the source frames are 390 px wide. OPEN:

1. Scouting and Academy both go to the one generic Coming Soon frame (Decision Log #285 made it a single template with one variable `Feature Name`); that frame's sample name reads "Scouting", so the Academy link lands on a screen that says Scouting. There is no separate Academy frame.
2. The menu button inside the open-drawer frame's header instance (`I6794:29297;6793:29293`) has no reaction; closing the drawer from the header was not asked for.
3. Sign up lands on the Age Gate, not on Register; that is the first step of the flow in Decision Log #367.

## 4. Task 4 inventory (what existed before drawing anything)

| Asked for | Found | Action |
|---|---|---|
| Avatar: choose | Drawn on Create Profile desktop `1498:2303` and mobile `1629:2449` (empty circle, "Add a Profile Picture (Optional)", the image-check hint); trigger on Edit Profile `1466:15934` / `5702:8317` | none |
| Avatar: uploading, under review, rejected with reason, error, remove | Not drawn anywhere | **built** (section 5) |
| Cover: all states | Only the trigger (icon on the navy banner on `1466:15934`, "+" button on `5702:8317`); Create Profile has no cover (#394 A1 lists none) | **built** for Edit Profile (section 5) |
| Bio and preferred club with inline "please rephrase" | Create Profile: `6672:29251` (desktop) and `6672:29235` (mobile) draw the state. Edit Profile: not drawn | **built** for Edit Profile (section 5) |
| Profile country as "Country" | Create Profile draws "Country (Optional)", blank and editable; Edit Profile draws "Country" with the safeguarding hint | none |
| Blocked users list with Unblock | Drawn: desktop `6705:26172` (list), `6705:26427` (empty), `6705:26659` (unblock confirmation); mobile `6706:26580`, `6706:26650`, `6706:26697`; each row has "Button — Unblock" | none |

Observed, not changed:

- Edit Profile (`1466:15934`, `5702:8317`) draws Preferred Club as a **select with a chevron**; Decision Log #393 item 8 says free text and Create Profile draws free text. The new rephrase frames use free text.
- Edit Profile has **no Username field** in either frame, although the code has one (Decision Log #364).
- The existing flagged Create Profile frames show placeholder text in the flagged inputs, not the typed value (B-194 says the page keeps the typed text).

## 5. New frames (26 frames and 6 notes)

All are auto-layout, Light mode, local frames (no new component), cloned from bound donors where possible (button `6705:26409`, error row `6672:29256`, image-add icon `1629:2482`). One control per asset, used on both screens; Edit Profile places it in its header block.

**Profile picture states** (avatar circle 120 px; label "Add a Profile Picture (Optional)"; hint "Pictures are checked automatically…"):

| State | Desktop (440 wide, y 90820) | Mobile (390 wide, y 91700) |
|---|---|---|
| Uploading (file name, progress bar 40%, Cancel) | `6799:29324` | `6799:29340` |
| Under review (pill, Replace / Remove) | `6799:29356` | `6799:29371` |
| Rejected, reason shown (error bar, reason line, Choose another picture) | `6799:29386` | `6799:29402` |
| Upload error (JPEG, PNG or WebP under 5 MB, Try again) | `6799:29418` | `6799:29433` |
| Approved (green pill, Replace / Remove) | `6799:29448` | `6799:29463` |
| Remove, confirm (Remove picture / Keep picture) | `6799:29478` | `6799:29492` |

**Cover photo states** (banner 400 x 120 desktop, 350 x 110 mobile; solid navy stands for a chosen picture, green-tint for none):

| State | Desktop (y 92700) | Mobile (y 93600) |
|---|---|---|
| Uploading | `6800:29312` | `6800:29327` |
| Under review | `6800:29342` | `6800:29355` |
| Rejected, reason shown | `6800:29368` | `6800:29383` |
| Upload error | `6800:29398` | `6800:29412` |
| Approved | `6800:29426` | `6800:29439` |
| Remove, confirm | `6800:29452` | `6800:29464` |

**Edit Profile, flagged Bio and Preferred Club** (y 94700): desktop `6800:29476` (560 wide), mobile `6800:29492` (390 wide). Both inputs carry the `semantic/alert` outline and the "Please rephrase" error row (same bar-and-text treatment as the Create Profile flagged frames). No override control, no "share anyway", no Report. The typed text is a neutral sample.

**Notes** (frames named `NOTE — Pass K6 · …`): `6801:29312` (avatar desktop), `6801:29314` (avatar mobile), `6801:29316` (cover desktop), `6801:29318` (cover mobile), `6801:29320` (rephrase), `6801:29322` (inventory, right of the rephrase row). The first four carry the SCOPE OPEN points below.

Wording built from the decisions: the pending-and-invisible rule is Decision Log #411 item 1 (an upload is invisible to everyone but its owner until B-036 and B-037 exist), the reason shown to the uploader is #398 D2, the file rules (JPEG, PNG or WebP, 5 MB) are W5 (`docs/backend-w5-report.md`) and the cover shares them (#411 item 4), no override is #411 item 2.

## 6. New tagged strings, and untagged strings for a reviewer to confirm

Tagged `[COPY PENDING LEGAL REVIEW]` (new wording about images, review and visibility):

1. `Only you can see this picture until it has been checked. [COPY PENDING LEGAL REVIEW]`
2. `This picture wasn’t approved. [COPY PENDING LEGAL REVIEW]`
3. `Reason: {reason from the reviewer} [COPY PENDING LEGAL REVIEW]`
4. `This picture is visible on your profile. [COPY PENDING LEGAL REVIEW]`
5. `Cover photos are checked automatically before they appear on your profile. [COPY PENDING LEGAL REVIEW]`
6. `Only you can see this cover photo until it has been checked. [COPY PENDING LEGAL REVIEW]`
7. `This cover photo wasn’t approved. [COPY PENDING LEGAL REVIEW]`
8. `Reason: {reason from the reviewer} [COPY PENDING LEGAL REVIEW]`
9. `This cover photo is visible on your profile. [COPY PENDING LEGAL REVIEW]`

Reused, already tagged: `Pictures are checked automatically before they appear on your profile. [COPY PENDING LEGAL REVIEW]` (the Create Profile hint, repeated in each avatar frame), the Restricted Pending strings in section 1.

Not tagged, for you to decide whether they need it (functional labels, or statements about how the profile looks, not about a check): `Uploading… 40%`, `Cancel`, `Under review`, `Approved`, `Replace picture`, `Remove picture`, `Keep picture`, `Choose another picture`, `Try again`, `Remove this picture?`, `Your profile will show a placeholder instead.`, `We couldn’t upload that picture. Use a JPEG, PNG or WebP file under 5 MB and try again.`, `Please rephrase`, and the cover equivalents (`Replace cover photo`, `Remove cover photo`, `Remove this cover photo?`, `Your profile will show the default cover instead.`, `Add a Cover Photo (Optional)`).

## 7. OPEN (SCOPE OPEN, none decided here)

1. **Delivery of the reject reason.** The reason is shown to the uploader (#398 D2) but nothing says whether in the page, a notification or an email. Drawn as the in-page state only.
2. **Remove confirm.** Remove is immediate in the backend (`DELETE /users/:id/avatar`); the confirm step is a design choice.
3. **Cover dimensions and crop** are not decided (#411), so no size guidance is drawn. Create Profile does not offer a cover.
4. **Preferred club** is not drawn on any other-user frame (#411 item 3, B-195); nothing here changes that.
5. **Preferred club control on Edit Profile** is a select in the existing frames and free text in the decision (section 4).
6. **Username on Edit Profile** has no frame.
7. The post avatars on the own-profile desktop cards are still other people's photos (section 2).
8. Scouting and Academy share one Coming Soon frame (section 3).
9. Whether the Restricted Pending frame should say Grassroots is limited (B-198 says nothing is drawn unless asked).
10. B-199 (the code adds the Registration status line to the page) is not part of this pass.

## 8. Standing audit (page `0:1`)

| | before | after |
|---|---|---|
| top-level nodes | 886 | 918 (+32: 26 frames, 6 notes) |
| djb2 hash of the 886 original ids in order | 975078240 | 975078240 (unchanged) |
| djb2 hash of all ids | 975078240 | 2211153039 |
| `findAll` `5108:6630` / `5531:7461` | 73 / 73 | 73 / 73 |
| `findAll` `6747:29094` / `6747:29291` / `6747:29445` / `6747:28894` | 766 / 646 / 766 / 773 | 766 / 646 / 766 / 773 |
| `findAll` `6784:29476` / `6785:29485` | 20 / 71 | 20 / 71 (reactions only) |
| `findAll` `1498:2303` / `1629:2449` / `1466:15934` / `5702:8317` / `6672:29251` / `6672:29235` | not recorded before | 244 / 64 / 2377 / 40 / 15 / 15 (not edited; counts taken after only) |
| ARCHIVED nodes | 427 = 62 top-level + 365 nested | **431 = 62 top-level + 369 nested** (+4 nested, section 1; index section 2j) |

Paints on the 32 new top-level nodes (390 nodes in total): 366 solid fills and strokes, **0 unbound, 0 black, 0 image fills**. **0 overlaps** of any new frame with any visible top-level node (strict bounding-box test against all 918). Screenshots read back for the Restricted Pending desktop frame, the own-profile desktop Posts frame, the avatar desktop uploading and rejected frames, the avatar mobile rejected frame, the cover desktop approved frame and both rephrase frames; one defect (mobile Bio text running past the input) was found and fixed in the same session by setting the text to wrap, and the mobile rephrase frame was re-screenshotted after the fix and reads correctly. Not compared in a real browser (none available).

Two `use_figma` findings worth knowing: a cloned text node needs its font loaded (`getStyledTextSegments(['fontName'])`) before `textAutoResize` is set, and reading a property that does not exist on a node throws instead of returning `undefined`. A failed run left no partial writes (checked: the top-level count stayed at 886 after the first failed attempt).

## 9. Register status lines (to route; `docs/build-register.md` not edited)

- B-198: `Figma pass K6 2026-10-24 (figma-pass-k6-report.md): the Resend Note and the stale SCOPE OPEN note are hidden and ARCHIVED-prefixed on 5108:6630 / 5531:7461 (4 nodes, 0 inbound references); hidden rather than deleted because nothing is deleted unless the brief names it; the registration status line is kept. No line about Grassroots is drawn.`
- B-201: `Figma pass K6: post author name and handle set to Adeniyi Christiana / @nelson_iheagwam on 6747:29094, 6747:29291, 6747:29445 (12 cards; name changed too because the handle alone would sit beside another person's name); @mekusa kept on 6747:28894. Post avatars are still other people's photos (OPEN).`
- B-202: `Figma pass K6: Login (header and drawer), Sign up, Sports Hub, Blog, Scouting and Academy wired as per-instance NAVIGATE reactions on 6784:29476 and 6785:29485 (targets in report section 3; Scouting and Academy share the generic Coming Soon frame 6477:20764); read back.`
- B-035, B-036, B-037, B-081: `Figma pass K6: avatar upload states drawn (uploading, under review, rejected with the reason shown, error, approved, remove confirm), desktop and mobile (report section 5); choose already existed; new image wording tagged [COPY PENDING LEGAL REVIEW]; delivery of the reject reason is OPEN.`
- B-196: `Figma pass K6: cover photo states drawn for Edit Profile (same six states, desktop and mobile); cover dimensions not decided; Create Profile has no cover.`
- B-194: `Figma pass K6: Edit Profile 'Please rephrase' frames drawn for Bio and Preferred Club (desktop 6800:29476, mobile 6800:29492), no override; Create Profile already had them (6672:29251, 6672:29235). Edit Profile's existing Preferred Club is a select, not free text (OPEN).`
- B-007, B-082 (Blocked users): `Figma pass K6 checked: Blocked users list, empty state and unblock confirmation with the Unblock action are already drawn (report section 4); nothing built.`
