# Figma pass G1 - user-facing fixes after Decision Log #403

Date: 2026-10-16. Agent: figma-design-system. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx` was changed. Everything is user-facing; no admin frame was touched.

Source of the decisions: Decision Log #403 (items 1, 2, 3, 7, 9, 10, 11, 17) as recorded in `docs/build-register.md` Section 12. Register row: B-113 (umbrella), with status lines on B-002, B-079, B-083, B-092, B-096, B-098, B-099.

## 1. What changed, per item

### Item 1 - Non-finalist Create Post frames restored (#403 item 1, amends #400 E8)

| Frame | Before | After |
|---|---|---|
| `6660:31044` desktop | named `ARCHIVED - ...`, at y 59,400 | renamed "Create Post - Desktop - Final Week - Closed (not a finalist)", back at x 1640, y 48500 (same row as the other final-week states) |
| `6660:35699` mobile | named `ARCHIVED - ...`, **hidden**, at x 4920, y 59400 | renamed "Community - Create Post - Contest Mode - Final Week - Closed (not a finalist) - Mobile", visible, back at x 490, y 50900 |

- Original coordinates were derived from the row pitch of the sibling states (desktop 1640 apart at y 48500; mobile 490 apart at y 50900) and checked free: 0 overlaps.
- Mobile content now matches desktop: the closing line (`6660:35731`) read "Only the finalists can upload to the Contest tab during the Week 4 upload window." and now reads "This portal is open to finalists only." as on desktop. The caption field and Upload row were already hidden in the mobile frame. The Contest tab stays visible and active, the count badge stays hidden.
- Closed-copy check (B-113 asked for it): the banner says only that finalists can upload during days 22-24. It does not say whether anyone has uploaded, so it reveals nothing about uploads before the reveal.
- Notes replaced: `6671:28750` (desktop) and `6671:28753` (mobile) no longer say the "No Active Contest" frames are what a non-finalist sees. They now say that state means "no contest is accepting entries" and that a non-finalist sees `6660:31044` / `6660:35699` (supersedes the hidden tab). The two Pass E notes that F1 had marked archived (`6664:27236`, `6664:27259`) were restored beside their frames and rewritten as RESTORED notes. Neither `6171:16994` nor `5982:10932` makes any in-frame claim to be the non-finalist state (a text search of the whole page found the claim only in those notes).

### Item 2 - Decline page: unchanged

`5491:8241`, `5501:8453` and node `6627:22230` were not touched.

### Item 3 - Guardian Approved reworded (#403 item 3)

Frames `5488:7164` (desktop) and `5501:8225` (mobile). Old: "Thank you - Ade's account is approved" / "Ade can now use Soccernity..." / "Ade's account is now active - They can sign in...". New:

| Element | New text |
|---|---|
| Title | "Thank you - Ade can continue" |
| Subtitle | "Recorded on 15 August 2026. Ade can now continue registration, with under-18 protections in place. [COPY PENDING LEGAL REVIEW]" |
| First "What happens next" row | "Ade continues registration" / "Ade now sets up a profile and picks a club. [COPY PENDING LEGAL REVIEW]" |

The flow wording follows #367 (approval, then Create Profile, then Club Picker). The "account is active / can sign in" claims are gone. "You stay in control" and "Nothing else is needed from you" are unchanged. Text boxes were kept to their original line counts (screenshots checked on both frames, no overflow). The title is deliberately short so it stays on one line on desktop; it is covered by the frame-level tag in the on-canvas note `6698:26172` / `6698:26175`.

### Item 4 - Voting pages adopt the Already Voted design (#403 item 7)

- **Desktop Voting `2094:994`** was legacy absolute layout. Its 11 children were moved (not deleted) into one hidden child "ARCHIVED - legacy absolute layer ..." (`6695:27342`). The frame is now a vertical auto-layout (1440 wide, 1396 tall, above the 1184 floor) holding a clone of the Already Voted navbar and body: entries column, last-week board column, fan cards. The vote toggle in it is `State=Vote`. The "Vote status" banner inside the entry card is hidden (the intro already says one vote per week and how to remove it). The "Back" link keeps the old arrow's destination (`2072:5584`).
- **Mobile Voting `5802:8726`** already had the Already Voted mobile layout (the two mobile frames differ only by a banner), so only the toggle was rewired.
- **Vote toggle works in place.** CHANGE_TO reactions were set on the two variants of component set `6670:28355` (`State=Vote` to `State=Voted` and back), so every instance flips on click. The old instance-level NAVIGATE reactions to the Already Voted frames were removed. Both Voting toggles are fresh instances so they inherit the component-level reaction (an instance given an explicit empty list could have blocked inheritance).
- **Archived**: desktop Already Voted `6671:27155` and mobile `5815:8916` (hidden, renamed `ARCHIVED - ...`, moved to the archive strip at y 59,400, x 8120 and 9760). The older `5802:8978` was already archived by F1. A page-wide scan finds **0 reactions** pointing at any of the three.
- The brief lists `5815:8916` among the voting frames; it is the mobile *Already Voted* frame (design source), so it was archived, not adapted. Recorded as an ambiguity in section 4.

### Item 5 - Forfeit pop-up (#403 item 9)

- Chip trigger removed on the leaderboard Contest tab frames: the OVERLAY reactions on `6659:26046` (desktop) and `6659:27039` (mobile) are cleared. The "Week 2 - Forfeited" chip stays as a plain status chip like the Week 1 / Week 3 chips.
- Those frames already show "Forfeited" in place of the three names (three rows reading "Forfeited / No placement points awarded"); they were left as they are.
- The pop-ups `6671:28756` (desktop) and `6671:28764` (mobile) now open by themselves when a Contest page loads: an AFTER_TIMEOUT trigger on the frame with an OVERLAY action to the pop-up (Figma stores 0.8 s as the minimum delay, which is what was read back). OK keeps its CLOSE action. Wired on Contest details `2155:1062` / `5801:8635` and Voting `2094:994` / `5802:8726`.
- Pop-up reason text changed from "...submitted this week..." to "Fewer than 3 entries were submitted for Week 2, so no winners were chosen and no placement points were awarded." because the pop-up now shows in a later week.
- "Contest page" is ambiguous; interpretation and a SCOPE OPEN note are in section 4 and on canvas (`6698:26182`).

### Item 6 - Community feed Final week module (#403 item 11)

- Dead link "View on the Contest page >" hidden and renamed `ARCHIVED - ...` in both components.
- The finalist tiles became a carousel **at the current module size** (796x340 desktop, 358x438 mobile; sizes unchanged): arrows in the header (where the link was), dots in the footer next to the count, three pages of three finalists. Built as component sets `6697:26234` (desktop) and `6697:27448` (mobile) with variants `Page=1/2/3`; the original components `6661:26780` / `6661:26865` are the `Page=1` variants, so the existing instances in the feed frames (`6661:29097`, `6661:29294`) keep their component. Arrows flip pages with CHANGE_TO (previous on page 1 goes to page 3).
- Footer text now "Showing 1-3 / 4-6 / 7-9 of 9 finalists". Pages 2 and 3 use sample names (leaderboard sample names plus two invented ones).
- The module appears only in the final contest week. The "no final week" variant is shown by omission: the same feed frame without the module (donors `2565:3951` / `5956:12797`); a note says so (`6698:26187`). Layout outside the module was not touched.
- The transparency sentence is unchanged and still tagged [COPY PENDING LEGAL REVIEW].

### Item 7 - Edit Profile country, and the final task text check (#403 items 10, 17)

> Updated 2026-10-17 by pass I (section 8 below): the Edit Profile country decision is restated and the Create Profile and profile frames follow it. The frame content described here is unchanged.

- `1466:15934` (desktop) and `5702:8317` (mobile): "Location" is now "Country", an editable select (chevron, sample value "Nigeria"), with the helper "Shown on your profile only if you fill it in. It does not change the country used for safeguarding. [COPY PENDING LEGAL REVIEW]". On desktop the fields below were moved down 28 px inside the modal (it had room: lowest field ends at 1151 of 1195). The mobile frame grew 663 to 699 on its own auto-layout.
- **Final task text** exists only on the live-ranking frames `5524:7512` / `5541:7527` and the uploading frames `6659:26310` / `6659:27163` (plus the admin form fields, out of scope). It is not on Crowned (`5524:7836` / `5541:7750`) or No winner (`6659:26636` / `6659:27348`). Nothing needed removing.

## 2. Whole-canvas before / after

`get_metadata` on the whole page is too large (F2 reached the same conclusion), so counts were taken with `findAll` per top-level node, before and after.

| | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 773 | 779 |
| Total nodes | 158,448 | 158,634 (+186) |

Top-level changes: +2 component sets (`6697:26234`, `6697:27448`), +6 notes (`6698:26172`, `6698:26175`, `6698:26178`, `6698:26182`, `6698:26187`, `6698:26193`), and 2 top-level components (`6661:26780`, `6661:26865`) that now sit **inside** those sets with their IDs unchanged. So no node is missing; the two "missing" top-level IDs were moved, not deleted. Per-frame deltas: `2094:994` +86 (rebuilt on auto-layout), `6661:26929` +11 and `6661:29200` +11 (module instances now carry arrows and dots), `1466:15934` +2, `5702:8317` +2, `5802:8726` +1. `6671:27155` (204 to 96) and `5815:8916` (63 to 40) show a lower count because their hidden navbar instances no longer enumerate sub-layers (counts are the same hidden or shown); their children (navbar instance and body / content frame) are intact. A scan of the touched frames finds no new overlaps (the two reported ones are large pre-existing section label and banner boxes that cover whole rows by design).

Deletion: nothing from the original file was deleted. One node I created earlier in the same session (a scratch toggle clone, `6695:27467`) was removed after replacing it with a fresh instance. Archived or retired items were hidden and renamed instead.

## 3. Tokens and paint

Every new node binds to the Soccernity Theme (Light) variables: `brand/green-tint`, `brand/navy`, `color/icon/inactive` (arrows, dots), `color/text/secondary` (hints). Light mode only, 390 px canonical mobile, no black, no new colour, no `brand/green-tint-28`. The rebuilt voting frame and the notes are clones of already-bound nodes. The navbar avatar image fill inside the cloned navbar is the known shared-component debt.

## 4. "[COPY PENDING LEGAL REVIEW]" and SCOPE OPEN

Tagged: Guardian Approved subtitle and first row text (both frames; the title is covered by the frame note), the Edit Profile country helper (both frames), and the carousel module keeps its existing tagged transparency sentence. Every note says what is undefined:

- `6698:26178` (Voting): Figma cannot change the "68 Votes" count or show a banner when the toggle flips; the 5815:8916 ambiguity.
- `6698:26182` (forfeit): "Contest page" reading; multiple forfeited weeks.
- `6698:26187` (module): carousel impressions (open since #403); sample inconsistency.
- `6698:26193` (Edit Profile): DOB still editable-looking; country list.

## 5. Decision Log candidates

1. **"Contest page" for the forfeit pop-up.** Read as Contest details and Voting (not the leaderboard tab, not Entries & Ranking). Confirm; the pop-up also reopens when the user moves between those pages (every load, nothing remembered).
2. **More than one forfeited week.** One pop-up per forfeited week would open one after another; only Week 2 is drawn.
3. **Vote count and banner on toggle.** No variable-driven state exists; whether "68 Votes" changes and whether any "already voted" text shows is a code decision. Prototype delay minimum is 0.8 s.
4. **`5815:8916` named as a voting frame.** Treated as the mobile Already Voted frame (archived); mobile Voting `5802:8726` already had the layout.
5. **Carousel views as impressions (#388).** Still open from #403; the design does not decide it.
6. **Date of Birth on Edit Profile.** Both frames still show DOB as an editable-looking field; #367 makes it read-only after the Age Gate. Not changed here (out of the listed scope).
7. **Sample data.** The module says 9 finalists while the leaderboard sample forfeits Week 2 (6 weekly finalists).
8. **Guardian Approved title.** "Thank you - Ade can continue" is short on purpose; counsel may want a different title.
9. **Autoplay of the pop-up in prototype.** The timed trigger is a prototype stand-in for "on page load"; the real behaviour is a code matter.

## 6. Not done

- No frames outside the user-facing scope were touched (admin frames, Terms/Privacy B-010, decline page).
- Item 6 of #403 (deleting the ten hidden legacy Create Post layers) is not part of this brief and was not done.
- The Contest-page showcase frames archived by F1 were not touched.

## 8. Pass I (2026-10-17) - profile country made optional everywhere (restates #403 item 17)

Agent: figma-design-system. Same file and page (`weZWWqggy9j13eX8bhFgs6`, `0:1`). Figma and docs only: no application code, schema, legal copy, DPIA or `.docx` was changed, and no node was deleted. User-facing frames only. Register rows with a status line: B-006, B-007, B-081, B-082, B-113.

The brief replaces the earlier Edit Profile decision (Country is an optional, editable profile field, separate from the safeguarding country) and applies it to Create Profile and the profile frames.

### 8.1 What changed

| Frame | Before | After |
|---|---|---|
| Create Profile desktop `1498:2303` | "Country" label, value "United Kingdom" (prefilled), no chevron | Label "Country (Optional)" ("(Optional)" in the secondary tone, as Preferred Club does on desktop); empty select showing the placeholder "Select country"; chevron added (`6712:28806`, 14x7, stroke bound to `color/text/secondary`); group renamed "Form Group - Country (optional, editable)" |
| Create Profile mobile `1629:2449` | Same prefilled "United Kingdom" | Label "Country (Optional)" in one colour (as "Preferred Club (Optional)" on mobile); placeholder "Select country"; chevron added (`6712:28807`, a visible clone of the archived chevron, absolute-positioned at x 324, y 23); group renamed; frame height unchanged (1450) |
| Flagged-state frames `6672:29251`, `6672:29235` | Bio and Preferred Club "Please rephrase" rows only | **Unchanged.** They contain no Country field (checked by text search and screenshot), so there was nothing to make blank. A note says so |
| Edit Profile `1466:15934`, `5702:8317` | Editable Country select, sample "Nigeria", helper about the safeguarding country (G1) | **Unchanged.** Already editable, with the helper. The G1 note `6698:26193` was extended with three bullets: the replaced decision, a SCOPE OPEN on the label, and the final-task re-check |
| Profile frames `1455:4362`, `1455:6626`, `5702:8250`, `5778:8490`, `6669:27188` | Sample "Nigeria" country line | **Unchanged.** One note per frame (below) says the country line appears only when filled and no blank line is drawn |

- "United Kingdom" no longer appears on any of the four Create Profile frames (text search, 0 hits). The Country field has no read-only hint (the DOB hint stays on DOB). The Age Gate country no longer pre-fills it.
- Stale text corrected in place: the pass B notes `6637:21602` (desktop) and `6637:21603` (mobile) said "Country, prefilled from the Age Gate value" and had a SCOPE OPEN asking whether the user may edit it. They now say blank, optional, editable and mark the question RESOLVED by pass I. The text was edited by range, so the rest of each note is untouched.
- New notes, built as clones of the G1 note frame (so every fill is already bound): above the two desktop profile frames, `6712:28811` (other user) and `6712:28821` (own), beside the existing B-007 notes; below the three mobile frames, `6712:28832` (own), `6712:28843` (own, Media) and `6712:28854` (other user); below the pass B Create Profile notes, `6712:28864`. Each profile note says: the country line shows only when filled; no placeholder or empty row; the profile country is independent of the safeguarding country (declared at the Age Gate, confirmed from the IP, never shown, never editable). Own-profile notes add that a blank country is simply not shown and is added in Edit Profile. Mobile notes record that the Identity block is vertical auto-layout, so the lines below close up. The desktop notes record that those frames are absolute layout, so the absent state is described, not drawn (SCOPE OPEN).

### 8.2 Final task text

Re-checked by text search of the whole page (case-insensitive "final task"), not carried over from G1. It appears only on the live-ranking frames `5524:7512` / `5541:7527` and the uploading frames `6659:26310` / `6659:27163` (plus the admin Create / Edit Contest form fields, out of scope). Crowned `5524:7836` / `5541:7750` and No winner `6659:26636` / `6659:27348` have 0 matches. Nothing needed removing.

### 8.3 Whole-canvas before / after

I did **not** run a whole-canvas `get_metadata` at depth 4 or more: the page holds about 139,000 nodes, and G1 and F2 recorded the same limit. Counts were taken with `findAll` per top-level node instead.

| | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 804 | 838 |
| Total nodes | 138,219 | 139,240 |

**Another session (pass H: Blocked users, 2FA recovery and pinned final entry frames) was writing to the same file during this pass**, so the raw delta (+34 top-level, +1,021 nodes) is mostly not mine. My own additions are +6 top-level notes (29 descendants, 35 nodes), +2 chevron vectors inside the two Country inputs, and +3 text nodes in the G1 note: **+40 nodes**. No node of mine was removed and no existing node was deleted; text edits replaced characters only. The six new notes were placed clear of every non-banner top-level node (the two desktop profile notes were first placed by a free-space search about 1,100 px below their frames, then moved beside the existing B-007 notes above them).

### 8.4 Tokens and paint

All new or edited paint is bound to Soccernity Theme (Light): the label and placeholder text use `color/text/primary` (`VariableID:5096:8`) and `color/text/secondary` (`5096:9`), the chevrons' strokes are bound to `color/text/secondary`, and the notes are clones of an already-bound note frame. Audit of the 13 touched or new nodes: 97 solid paints, 0 unbound. Light mode only, 390px mobile, no black, no new colour, no `brand/green-tint-28`.

### 8.5 "[COPY PENDING LEGAL REVIEW]" and SCOPE OPEN

- No new guardian-, minor- or data-processing wording was added to any UI frame. The label "Country (Optional)" is the founder's wording. The placeholder "Select country" is taken from `GuardianDetailsStep.tsx` (the Age Gate country select). The Edit Profile helper keeps its existing tag.
- SCOPE OPEN on canvas: country list is the full list (default, veto-able); what a blank profile country affects elsewhere; the desktop profile frames are absolute layout (absent state described, not drawn); the Edit Profile label has no "(Optional)".

### 8.6 Decision Log candidates

1. **Edit Profile label.** Create Profile says "Country (Optional)" but Edit Profile says "Country" (like its Preferred Club and Bio, which carry no "(Optional)" there). Make it consistent either way.
2. **Account Information (Edit) `2924:7112` / `5649:8176`.** These still show a "Country" field, and the pass A notes `6628:23286` / `6628:23287` say the IP-derived value is authoritative and the user's right to change it is undecided. #403 item 17 makes that two fields: this screen should show either the editable profile country or nothing. Not touched (not in the brief).
3. **Pass H frames carry a sample "Nigeria" line**: `6706:26750`, `6707:26595`, `6707:26727`, `6707:26938`, `6709:26922`, `6709:27056`. They are another session's work and were not annotated. After that pass is merged, the country-only-when-filled rule applies to them too.
4. **Placeholder wording** "Select country" is code wording (Age Gate). Confirm it for the profile select, or use "Select your country".
5. **Own profile with a blank country.** The note says it is not shown; whether an own-profile hint ("Add your country") should appear is not specified.
6. **Out-of-bounds copy.** `1455:6626` contains a nested node `Desktop - 9` (`1620:8975`) positioned at about x 2514, outside the frame bounds, whose text includes its own "Nigeria" and "Manchester United" lines. Not touched; it should be cleaned up in a separate housekeeping pass.

### 8.7 Not done

- No admin frame, legal frame, decline page or contest frame was touched.
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` was not edited, as instructed. No Decision Log row was written.
