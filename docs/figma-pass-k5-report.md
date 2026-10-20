# Figma pass K5 — Restricted Pending wording, mobile profile values, logged-out mobile components, K2 notes, guardian footnote

Date 2026-10-20. Branch `figma/pass-k5-restricted-pending-mobile-logged-out`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`; `docs/build-register.md` not edited (status lines are in section 9). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Read first: `docs/figma-pass-k4-report.md` sections 6 and 8, `docs/pending-copy-manifest.md`, `apps/web/src/pages/GuardianConsentPage.tsx`, build register B-183, B-184, B-185, B-190, B-191 and Decision Log #410.

Nothing was deleted. Everything replaced is hidden and renamed with the `ARCHIVED — ` prefix (section 8).

## 1. Restricted Pending frames `5108:6630` (desktop) and `5531:7461` (mobile)

Every text node on both frames was read and compared with `GuardianConsentPage.tsx` (pending branch) and the manifest.

| Node (desktop / mobile) | Was | Is now | Why |
|---|---|---|---|
| Subheading `5114:6649` / `5531:7478` | "We emailed sarah.bello@example.com **on 15 August 2026**. Until they approve, the things below are switched off to keep you safe." | "We emailed sarah.bello@example.com. Until they approve, the things below are switched off to keep you safe." | The code renders `We emailed {guardianEmail}. Until they approve, ...` and has no date (the status response carries `lastDecisionAt` only after a decision). Wording difference, fixed. If you want the date, it is a code change, not a Figma one. |
| Row title `5114:6685` / `5531:7514` | "Browse and follow" | "Browse and read" | Code row title. |
| Row detail `5114:6686` / `5531:7515` | "Follow teams and grassroots leagues." | "Look around the Sports Hub, the Blog and Banter Rooms. Following and posting switch on once your guardian approves. [COPY PENDING LEGAL REVIEW]" | The code string and its manifest row. Tag kept, as the manifest row requires. |
| Row frames `5114:6681` / `5531:7510` | "Row — Browse and follow" | "Row — Browse and read" | Layer name only. |

Checked and equal to the code, so unchanged: the pill "WAITING FOR GUARDIAN APPROVAL"; the heading "Your account is waiting for approval"; the card title "Switched off until your guardian approves"; the three off rows (titles and details) and their OFF pills; the card title "What you can still do"; the second row "Check scores and fixtures / The Sports Hub works normally."; the two buttons "Resend approval request" and "Change guardian email".

The **"Set up your profile / Add your position and photo"** row (`5114:6697`, `5531:7526`) was already hidden and renamed `ARCHIVED — Row — Set up your profile (#377)` by an earlier pass. K4's description of the frames carrying it was out of date. Nothing to do.

Structural differences, listed OPEN and not changed:

1. **Resend Note** ("Last sent 2 hours ago. Didn't arrive? Check their spam folder, or send it again.", `5114:6704` / `5531:7533`). The code has no persistent resend note; it shows "We've sent a new approval email to {email}. The previous link no longer works." only after a resend. Different state and different wording, so whether the code gains a "last sent" line or the frame drops it is a decision.
2. **Registration status line** ("Registration cannot be completed until your guardian approves, including card verification where required. [COPY PENDING LEGAL REVIEW]", `6627:22218` / `6627:22219`, Decision Log #367). The code page does not render it and the manifest has no row for it. Either the code adds it (tag, manifest row) or the frame drops it.
3. **SCOPE OPEN note** ("does restricted-pending also limit Grassroots record-keeping and Sports Hub?", `5114:6677` / `5531:7506`). A design annotation inside the card; the code has no equivalent. It is stale in one respect (the code and the manifest both say the Sports Hub works), but whether grassroots record-keeping is limited is not decided anywhere I could find, so it was left.
4. **Page chrome.** The frame carries a logo bar ("Soccernity"); the code page renders under the shared site Header. Not compared further.
5. The frame shows the sample guardian email `sarah.bello@example.com`; the code shows the real one. Sample data, not a difference.

## 2. Withdrawal-confirm frames `6654:57` (desktop) and `6654:26782` (mobile)

(The brief's `6654:26801` is the body-line text node on the mobile frame; the frame is `6654:26782`.)

Compared against `apps/web` (there is **no withdrawal page in `apps/web`**; only the API client exists, so the only code wording is the email), `registration-email.service.ts` (templates `guardian-consent-withdrawal-request`, `guardian-consent-withdrawn`), legal copy v0.8 (ToS 3.4, Privacy Policy 4.4, 8.3, retention table), Decision Log #337 to #340, #341, #375 and the build register row B-190.

| Sentence on the frame | Verdict |
|---|---|
| "Withdrawing consent closes the account straight away." | **Not wrong.** The refusal path revokes sessions and blocks login at once (#337 to #340); the code email says the account "has been closed"; legal copy ToS 3.4 says the account is "closed to further use". |
| "This cannot be undone from this page." | **Not wrong.** No endpoint undoes it inside the grace (B-190); the code email tells the minor to "speak to your guardian". |
| "The account is closed and the person can no longer sign in." (card) | **Not wrong.** Same basis. |
| "The details they entered are deleted after 30 days." (card) | **Understates.** After the 30 days the row is anonymised in place, not deleted, and a consent audit snapshot is kept for a further 6 months (#341, #375, legal copy 8.3 and the retention table). The code email, though, says "permanently deleted" in N days. So the code and the legal draft disagree with each other, and neither agrees with a rewrite of the frame. |

**Nothing changed.** The rule for this item was to fix only if the code and a Decision Log row agree on different wording. They do not: the code email says "permanently deleted", the Decision Log and legal draft say "anonymised". Listed OPEN: the one sentence that understates is the "deleted after 30 days" line (`6654:85` / `6654:26810`); the fix belongs with B-190's counsel check and with the email template wording. The frames already carry the tag (`6654:71`, `6654:26796`).

## 3. Mobile profile sample values (B-184, Decision Log #410 item 5)

Desktop family values read from the visible nodes of `6747:29445` and the other three desktop frames: name "Adeniyi Christiana", handle `@nelson_iheagwam`, bio "Fine Girl, Hard Arsenal Stan!", country "Nigeria", "5,500 Followers", "5,500 Following", no posts count.

Text edits on `6747:29642` (own Posts), `6747:29709` (own Media) and `5778:8567` (mobile Saved):

| Node | Was | Is now |
|---|---|---|
| `6747:29656`, `6747:29723`, `5778:8581` (handle) | @christine001 | @nelson_iheagwam |
| `6747:29664`, `6747:29731`, `5778:8589` (Following) | 250 | 5,500 |
| `6747:29666`, `6747:29733`, `5778:8591` (Stat — Posts, "124 Posts") | visible | hidden, renamed `ARCHIVED — Stat — Posts (no posts count, Decision Log #410 item 5)`; the stats row is auto-layout, so it closes up (checked on `6747:29642`, no gap) |
| `6747:29685`, `5778:8610`, `5778:8640` (post author line) | @christine001 · 2m | @nelson_iheagwam · 2m |

Judgment call, flagged: the post author lines were not named in the decision. They show the same person (name "Adeniyi Christiana") as the header, so leaving the old handle would put two handles on one frame. Name, bio and Followers (5,500) already matched the desktop.

Observed, not changed: on the **desktop** frames the post author lines read `@mekusa` even on the own Posts and own Media frames (inherited from the legacy frames, K4 report section 8), so the desktop pair of "header vs post author" is inconsistent. Listed OPEN. Whether `5778:8567` is replaced rather than edited is still not decided (#410 item 5); it was edited.

## 4. Logged-out mobile header and drawer (B-183, Decision Log #410 item 4)

### 4.1 What was added

| What | Id | How |
|---|---|---|
| New variant `Property 1=header 7 — mobile — menu` | `6793:29280`, appended to the existing set `2824:4309` | Clone of `header 7 — mobile` (`5386:6575`) at 428 x 64 like the other mobile variants; padding 16 left, 8 right; children: Logo and a group "Right — Actions + Menu" holding the existing Actions (search icon, Login button) and a 48 px menu button cloned from K4 (`bx:menu`, bound to `brand/navy`). Layout is the K4 header (Login at 16 px from the menu, 8 px right padding). The menu button's click reaction is **not** on the component (NAVIGATE cannot be set on a component descendant, #249); it is a per-instance override. |
| New component `Navigation Drawer — Mobile — Logged Out` | `6793:29321`, top level at (9329, 12760) beside the signed-in drawer (`5870:10689`) | Built from a clone of K4's detached logged-out drawer content (`6785:29539`) via `createComponentFromNode`: Scrim (with the same `ON_CLICK` close reaction the signed-in drawer's Scrim has), Panel with logo, Login and Sign up, Sports Hub, Blog, Scouting, Academy. 390 x 844. |

### 4.2 Why the drawer is a standalone component, not a variant

The brief asked for variants of the existing component sets. `Navigation Drawer — Mobile` (`5870:10689`) is **not in a set** (a single `COMPONENT`), and it is the OVERLAY destination of the signed-in mobile header's avatar. Combining it with a logged-out sibling into a set would make a variant the overlay destination, which Figma rejects (Decision Log #103), so it would break the signed-in header's overlay link. The register (B-183) anticipates exactly this ("a separate component, the mobile dropdown family precedent"). So: **header = variant of the existing set; drawer = new standalone component**. Nothing existing was converted into a set.

### 4.3 Existing variants unchanged

Before/after export comparison (PNG at 1x, djb2 hash + byte length), taken before the first write and after the last:

| Node | Result |
|---|---|
| `2841:4104` header 7 (desktop) | identical |
| `5386:6575` header 7 — mobile | identical |
| `5870:10689` Navigation Drawer — Mobile | identical |
| `5874:10690` drawer instance in the Community feed frame | identical |
| `2838:3502` header 4 (desktop), `5386:6576` header 4 — mobile, `5701:8239` (Community feed, mobile), `6784:29454` (K4 logged-in closed header) | **differ** from the baseline export |

The four that differ are exactly the four I exported that contain an IMAGE fill (the avatar). Their repeated exports are now stable (three identical results each) and every difference is a byte-length **increase** (for example `5386:6576`: 4,898 to 7,594), which is what a render with the avatar image loaded looks like against a baseline taken before the image had loaded in the exporter. I cannot prove that after the fact because the pre-change state cannot be exported again. Structural evidence that points the same way: the four existing variants of the set kept their x, y, width and height exactly (`2838:3502` 20,570 1440x90; `2841:4104` 20,1063 1440x90; `5386:6575` 20,1170 428x64; `5386:6576` 20,692 428x64); the set kept its size (1480 x 1360); the set's `findAll` count went from 242 to 258 (+16, the new variant). **OPEN for you**: open the four nodes in Figma once and confirm the avatar looks as before.

### 4.4 Frames re-pointed to instances

| Frame | Before | After |
|---|---|---|
| `6784:29476` Mobile Header — Logged Out — Closed | instance of `header 7 — mobile` (334 wide) + a loose 48 px menu button | instance `6794:29280` of the new variant, 390 wide (FILL); frame right padding 0; old instance `6784:29477` and menu `6784:29489` hidden + archived; the menu button's NAVIGATE to `6785:29485` was copied onto the new instance's menu button (read back) |
| `6785:29485` Mobile — Logged Out — Navigation Drawer Open | header frame `6785:29486` holding the same two pieces; detached drawer copy `6785:29539` | header now holds instance `6794:29297`; old `6785:29487`, `6785:29488` archived; the drawer is instance `6794:29313` of the new component, absolute at (0, 0); `6785:29539` archived |

The Scrim close reaction is inherited from the component. Login, Sign up and the row links have **no** prototype wiring (K4 had none either); they would be per-instance overrides.

K4's own note `6785:30713` said the component change was needed and not done. Point 4 of that note is rewritten (old text in section 7); the rest of the note is unchanged.

## 5. K2 notes `6754:29553`, `6754:29556`

Both rewritten to describe the current frames (old text in section 7). The old desktop note said the sidebars "are not reproduced" and named only the K2 state; it now lists the four desktop frames with their K3 and K4 origins, says the three sidebars are reproduced as sample content, restates the variants (pinned, blocked, Block menu, not found), the sample values, and what stays OPEN. The old mobile note said the two frames were identical clones of the legacy pair; it now lists all three mobile frames, the K5 value alignment and what is still OPEN. "Kept as built" items from #410 item 7 (the one-row Copy Profile Link menu on own Posts, the hidden K2 columns until the launch gate) are stated as decided, no longer open.

## 6. Guardian confirm footnote: frames `5108:6629`, `5531:7626`, `6748:29330`, `6748:29450`

All four footnote nodes (`5113:6744`, `5531:7738`, `6748:29446`, `6748:29556`) carried the same text. It is the Figma reference (link-expiry sentence, the cap sentence, the withdrawal sentence). It had **one** tag, after the withdrawal sentence, which left it unclear which sentences it covered. Each sentence that describes a guardian or a child now carries its own tag, so it matches the manifest's one-tag-per-string convention.

**Exact final footnote text** (copy this into code; `{date}` is the request's expiry date, formatted as "18 August 2026"):

```
This link expires on {date}. [COPY PENDING LEGAL REVIEW] You can decline up to 3 times. Changing the guardian email does not reset the count. After the third decline the account is scheduled for deletion. [COPY PENDING LEGAL REVIEW] You can withdraw consent at any time on the guardian withdrawal page. [COPY PENDING LEGAL REVIEW] Read our Privacy Policy.
```

As three tagged strings for the manifest:

1. `This link expires on {date}. [COPY PENDING LEGAL REVIEW]`
2. `You can decline up to 3 times. Changing the guardian email does not reset the count. After the third decline the account is scheduled for deletion. [COPY PENDING LEGAL REVIEW]` (identical to the string already in the manifest for `GUARDIAN_CAP_SENTENCE`)
3. `You can withdraw consent at any time on the guardian withdrawal page. [COPY PENDING LEGAL REVIEW]`

"Read our Privacy Policy." is not tagged (a link label, describes no child or guardian). The footnote text grew by one line (63 to 84 px desktop, 147 to 168 px mobile); each frame still has room (the footnote ends 16 to 45 px above the frame bottom; frame heights are unchanged).

Not tagged, not in this brief, listed OPEN: other sentences on these frames that describe a child or a guardian but carry no tag, for example the subheading ("Ade named you as their parent or guardian..."), "Post and comment in Community / Share updates and reply to other players. Everything is moderated.", "Join Banter Rooms & Community Groups ...", the "What we collect" rows (including "Your name, email and relationship / Kept only to record that you gave consent, and to contact you about it."), the "What stays switched off" rows. The code page does not tag them either; whether they need tags is a counsel question for B-185's PR.

Note for B-185: the manifest row for the cap sentence still says "Figma `5108:6629` and `6748:29330` / `6748:29450` still carry the old footnote (B-146)"; K4 fixed that. That manifest cell is not edited here (the inventory test reads that file).

## 7. Old text kept for the record

K2 note `6754:29553`:

> SCOPE OPEN (Decision Log #404 item 2, #405 item 9, B-138): these four desktop frames replace the legacy profile frames 1455:4362 and 1455:6626 (archived). Other user: Posts and Media tabs only; own profile: Posts, Media and Saved (Saved is private, #22). The variants are NOT new components: finalist pinned entry = 6707:26727 / 6707:26938 (desktop) and 6709:26922 / 6709:27056 (mobile); blocked = 6707:26595 / 6706:26750; Block menu open = 6669:27188; not found = 6738:30391 / 6738:30526. The country line shows only when the user filled it in (#403 item 17); "Nigeria" here is the filled sample. Avatar and cover are placeholders (no image storage yet). Media tiles carry no video marker or duration. The legacy sidebars (Trending News, Suggested, Trends, Fixtures) are not reproduced: no endpoint backs them. Own Saved desktop 1460:8940 and mobile Saved 5778:8567 are legacy and were not archived (not in the brief).

K2 note `6754:29556`:

> SCOPE OPEN (B-138): these two mobile frames are content-identical clones of 5702:8250 (own, Posts) and 5778:8490 (own, Media), which were already auto-layout; they exist so the legacy pair can be archived under one naming family. The mobile drawer "Signed in as" link now targets the own mobile frame (6747:29642). Mobile Saved 5778:8567 and the other-user mobile frame 6669:27188 keep their ids.

K4 logged-out note `6785:30713`, point 4 (the rest unchanged):

> 4. COMPONENT CHANGE NEEDED: header 7 — mobile has no menu control, and Navigation Drawer — Mobile has no logged-out content. Neither component was edited: the header is an instance plus a menu button, the drawer is a detached copy of the component with rows removed and Login / Sign up in place of the identity block. A Logged Out variant of each is the proper fix.

Restricted Pending subheading before K5: "We emailed sarah.bello@example.com on 15 August 2026. Until they approve, the things below are switched off to keep you safe." Row before K5: "Browse and follow" / "Follow teams and grassroots leagues."

## 8. Standing audit (page `0:1`)

| | before | after |
|---|---|---|
| top-level nodes | 885 | 886 (+1: component `6793:29321`) |
| hash of the original 885 ids (djb2) | 3456004488 | 3456004488 (unchanged, same order) |
| hash of all ids | 3456004488 | 2912832558 |
| `findAll` `5108:6630` / `5531:7461` | 73 / 73 | 73 / 73 |
| `findAll` `6654:57` / `6654:26782` | 33 / 33 | 33 / 33 |
| `findAll` `6747:29642` / `6747:29709` / `5778:8567` | 66 / 46 / 96 | 66 / 46 / 96 |
| `findAll` `6747:29445` / `6747:28894` / `6747:29094` / `6747:29291` | 766 / 773 / 766 / 646 | 766 / 773 / 766 / 646 |
| `findAll` `5108:6629` / `5531:7626` / `6748:29330` / `6748:29450` | 116 / 116 / 119 / 119 | 116 / 116 / 119 / 119 |
| `findAll` `6754:29553` / `6754:29556` / `6785:30713` | 2 / 2 / 2 | 2 / 2 / 2 |
| `findAll` `6784:29476` / `6785:29485` | 15 / 41 | 20 / 71 (new instances; hidden originals kept) |
| `findAll` set `2824:4309` | 242 | 258 (+16, the new variant) |
| `findAll` `5870:10689` (signed-in drawer) | 47 | 47 |
| `findAll` new `6793:29321` | none | 24 |
| ARCHIVED nodes | 419 = 62 + 357 | **427 = 62 top-level + 365 nested** (+8 nested, section 2i of `docs/figma-archive-index.md`, updated) |

Paints on authored nodes (new variant, new drawer component, the three new instances): 9, 17, 9, 9 and 17 solid paints, **0 unbound, 0 black, 0 image fills**. Edited text keeps the existing bound fills. Overlaps of the new top-level component and of every touched frame with visible top-level nodes: **0**. Screenshots read back for both Restricted Pending frames, the mobile Posts profile frame, the new variant, the new drawer component and both re-pointed K4 frames. Not compared in a real browser (none available).

## 9. OPEN, and register status lines

OPEN (needs you):
1. Restricted Pending: the Resend Note, the Registration status line and the SCOPE OPEN note differ structurally from the code (section 1). Decide per item whether the code or the frame moves.
2. Withdrawal-confirm: "The details they entered are deleted after 30 days." understates and the code email says "permanently deleted"; counsel check under B-190.
3. The four image-bearing nodes whose export differs from the baseline (section 4.3): confirm the avatar looks as before.
4. Desktop profile frames show `@mekusa` as the post author on own frames (section 3); `5778:8567` edited, not replaced.
5. Other child/guardian-describing sentences on the guardian confirm frames carry no tag (section 6).
6. The drawer is a standalone component because of #103 (section 4.2); say if you want a different structure.
7. Login, Sign up and drawer-row links on the logged-out frames are not wired.

Register status lines (to route; `docs/build-register.md` not edited):

- B-191: `Figma pass K5 2026-10-20 (figma-pass-k5-report.md): Restricted Pending 5108:6630 / 5531:7461 now say 'Browse and read' with the code's body ([COPY PENDING LEGAL REVIEW]) and drop the 'on 15 August 2026' from the subheading; the position-and-photo row was already hidden; Resend Note, Registration status line and SCOPE OPEN note differ structurally from the code and are OPEN (report section 1).`
- B-183: `Figma pass K5: new variant 'header 7 — mobile — menu' (6793:29280) in set 2824:4309 and new standalone component 'Navigation Drawer — Mobile — Logged Out' (6793:29321, standalone because a variant cannot be an overlay destination, #103); K4 frames 6784:29476 and 6785:29485 now hold instances; existing variants unchanged (four of eight comparison nodes identical, four image-bearing nodes differ in export, see report 4.3); Login/Sign up/row links not wired.`
- B-184: `Figma pass K5: 6747:29642, 6747:29709, 5778:8567 aligned to @nelson_iheagwam, 5,500 Following, posts-count stat hidden (ARCHIVED — Stat — Posts), own post author lines aligned; desktop post author lines still @mekusa (OPEN).`
- B-185 / B-146: `Figma pass K5: the footnote on 5108:6629, 5531:7626, 6748:29330, 6748:29450 is the reference; each of its three guardian/child sentences now carries its own [COPY PENDING LEGAL REVIEW] tag; exact final text in report section 6.`
- B-190: `Figma pass K5: checked the withdrawal-confirm wording against the code and Decision Log; 'closes the account straight away' and 'cannot be undone from this page' are accurate, 'deleted after 30 days' understates (anonymised, consent record kept 6 months) and the code email says 'permanently deleted'; nothing changed, OPEN (report section 2).`
- B-138 / B-170: `Figma pass K5: K2 notes 6754:29553 and 6754:29556 rewritten for the current frames.`
