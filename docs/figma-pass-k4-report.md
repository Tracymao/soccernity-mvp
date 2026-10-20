# Figma pass K4 — profile frames diffed against their legacy twins, guardian and revoke wording, logged-out mobile navigation

Branch `figma/pass-k4-profile-diffs-copy-logged-out-nav`, from `origin/main` `44ad9d9`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`; `docs/build-register.md` is not edited (status lines in section 9). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Light mode, Soccernity Theme variables, no black, no new component, nothing deleted from the canvas. Temporary scratch clones I made of the hidden legacy frames (so they could be screenshotted: a hidden node renders 1 x 1) were deleted again at the end; they were my own artefacts, not canvas content.

**Result in one paragraph.** The three K2 desktop profile replacements were as simplified as K3 suspected (own Media had 15 texts and no posts; the other-user frame had no side rails, no cover photo, no menu). All three are rebuilt from clones of K3's finished Saved frame and match their legacy twins item by item except the differences in section 2. The two mobile replacements, by contrast, are node-for-node identical to their legacy twins (0 differences in 112 nodes), so nothing was changed there. While diffing I found one K3 defect (the Fixtures separator dots) and fixed it in all four desktop frames. Part 2 (wording) and Part 3 (logged-out mobile navigation, five new frames) are done; open points are in section 8.

## 1. Part 1 — diff before the fix, per frame

Method: screenshot of both frames, full node trees, programmatic inventories (texts with position and size, element types, image fills, reactions), then item-by-item comparison. K2's and K3's counts were not relied on. Counts below are measured today.

### 1a. `6747:28894` Profile — Other User — Posts — Desktop vs legacy `1455:4362`

Legacy: 1440 x 2709, 132 visible texts, 24 image fills, 3 footer-link reactions plus the navbar avatar. K2 frame: 926 high, 195 nodes, 28 texts, 0 image fills, 0 reactions. Differences (all fixed unless marked):

1. Layout: legacy is three columns (left rail x 35, main column x 321 / 796 wide, right rail x 1132); K2 had one 796 px column.
2. Left rail missing: Trending News card (3 rows: thumbnail, headline, hard-broken excerpt, clock, "08/08/2022"), Suggested card (3 people with Follow pills, See more).
3. Right rail missing: Trends for you (7 rows with three-dots, See more), Fixtures (8 rows, crests, scores / 16:00), legal footer with three link reactions.
4. Cover: stadium photo vs flat green-tint block. Avatar: 158 px photo with 3 px white ring vs a 120 px "AC" disc.
5. Buttons: legacy order three-dots circle, mail circle, navy filled "Follow" pill 76 x 38 (radius 23, white 14 Medium); K2 had mail, dots and an outlined 12 px "Follow".
6. Name 20 Medium vs 19 Bold; handle `@nelson_iheagwam` 14 vs `@christine001` 13; bio 14 Medium vs 13; country: pin icon on the name line vs a separate line without icon; stats "5,500 Followers · 5,500 Following" (14, dot between) vs "5,500 / 250 / 124 Posts".
7. Open profile menu card (240 x 76: "Copy Profile Link", "Block nelson_iheagwam" with red block icon) missing. No club badge in the legacy frame (correct, kept absent).
8. Tabs: legacy white strip 210 x 38, radius 8, "Posts" full and "Media" at 30 %, 16 px dash between, no Saved tab on the other-user variant; K2 used full-width tabs with a green underline.
9. Posts: legacy has four post blocks (first with write-a-comment row and a two-comment thread with two replies each, then Eleanor Pena with a 628 x 333 stadium photo, an Emeka John text post, an Emeka John post with a video still and play icon), photo avatars, three-dots, engagement rows; K2 had two bordered cards with different text and initials avatars.
10. Reactions: 3 footer links missing.

### 1b. `6747:29291` Profile — Own — Media — Desktop vs legacy `1455:6626`

Legacy: 1440 x 2660, 113 visible texts, 19 image fills, 3 footer reactions. K2 frame: 1381 high, 149 nodes, 15 texts, 0 image fills. Differences: everything in 1a items 1–4 (rails, cover, avatar); filled navy "Edit Profile" pill 144 x 38 vs outlined button; club badge beside the name missing; country pin; name / handle / bio / stats as in 1a item 6; tabs "Posts · Media · Saved" strip with Media full and the other two at 30 %; and **all four media posts missing** (Eleanor Pena photo, Emeka John video, Eleanor Pena photo, Emeka John video, 628 x 333 each, engagement rows). Legacy has no open menu on this frame.

### 1c. `6747:29094` Profile — Own — Posts — Desktop

No legacy twin exists: the legacy file holds only the other-user Posts frame (`1455:4362`), own Media (`1455:6626`) and own Saved (`1460:8940`); the archive index lists `6747:29094` as part of the replacement set for `1455:6626`, which is Media. K2 frame: 919 high, 192 nodes, 29 texts, no images, the same simplifications as 1a. It is therefore **derived**: K3's rebuilt Saved frame (itself a faithful copy of `1460:8940`) with the Posts tab active; its post list is the same four blocks as the legacy Posts feed (`1455:4362`). See OPEN 1.

### 1d. `6747:29642` Profile — Own — Posts — Mobile vs `5702:8250`, `6747:29709` Profile — Own — Media — Mobile vs `5778:8490`

Compared node by node (66 and 46 nodes): type, geometry, text and font size, fills (including the bound variable id), strokes, visibility, opacity and reactions. **0 differences in both.** The K2 replacements are exact clones of their legacy twins. Nothing changed. OPEN 2 concerns their sample values.

## 2. What was done, and the differences kept on purpose

Method (K3's): each frame keeps its id and its Navbar instance; K2's single-column body is hidden and renamed "ARCHIVED — K2 profile column (superseded by K4 rebuild)" (`6747:29005`, `6747:29205`, `6747:29402`); a clone of K3's `Body` (rails, header card, tabs, posts, footer, with the three footer reactions) is added and edited. Frame spacing and padding match the Saved frame (item spacing 0, bottom padding 89).

| Frame | Edits to the cloned body |
|---|---|
| `6747:28894` other user (now 2710 high) | Edit Profile button becomes the navy "Follow" pill (76 wide); two 38 px outlined circle buttons (three-dots, mail; icons cloned from the legacy frame) at 19 px gap; club mark removed; name-row spacing so the pin and "Nigeria" sit at the legacy x (574); menu card holds Copy Profile Link and Block nelson_iheagwam (block icon bound to `semantic/alert`, legacy red); tab strip reduced to Posts (full) and Media (30 %), 210 wide. |
| `6747:29094` own Posts (2710) | Posts tab full, Media and Saved at 30 %. Otherwise the Saved body (one-row menu, Edit Profile pill, club mark). |
| `6747:29291` own Media (2822) | Media tab full; open menu removed (legacy has none); feed replaced by the four media posts in legacy order; post pitch matched to the legacy (524 px after a photo post, 534 px after a video post) with block bottom padding. |

Differences from the legacy frames that are kept (same rules as K3's report section 2; everything else matches):

| # | Legacy | New | Why |
|---|---|---|---|
| a | Other-user menu shows "Block nelson_iheagwam" with a red icon | Kept on the other-user frame only | Decision Log #396 C1 (Block lives on the other-user variant); the red is bound to `semantic/alert` (#97, #99). Own frames have a one-row menu (K3). |
| b | Hidden "Share Profile Via" | Not carried | #371. |
| c | Crest art next to the name (Chelsea), Chelsea / Liverpool crests in Fixtures | Typographic discs (CFC, LFC) | #85, #97, #403 item 13. |
| d | Footer "Privacy Settings", "© 2022" | Removed, "© 2026" | #222 part 4, #207. The legacy Media frame still showed both; the legacy Posts frame had the link hidden. |
| e | Tab text `#034694` | `color/text/primary`, inactive tabs 30 % | Non-negotiable #3. |
| f | Comment bubbles `#d9d9d9` at 40 % | `brand/green-tint` | PR #128 / #174 precedent. |
| g | Menu shadow `#454545` | `elevation/menu` style | #118. |
| h | Legacy Media frame is 2660 high and its last post overflows it (actions row at y 2678) | Frame is 2822 high and shows the whole post | Clipped content is a legacy defect. |

**K3 defect found and fixed.** In Fixtures rows 2 to 8 the separator dot between the two scores is a neutral navy 15 % dot in the legacy frame; only row 1 has the red live dot. K3 had bound all six to `semantic/alert`. The five neutral dots are rebound to the legacy paint in all four desktop frames (including `6747:29445`).

**Frame move.** The other-user frame grew from 926 to 2710 high and would have overlapped the mobile profile frames and two K2 notes at its old place (0, 77200). It was moved to (6560, 77200), the free slot right of the Saved frame. Checked: 0 overlaps with every visible top-level node.

## 3. Verification of the rebuilt frames

Programmatic text comparison, legacy vs new (matched by characters, then nearest position), run after the build:

| Pair | Legacy texts | Matched | Offsets 0 / 1 / 2 / 3 px | Over 3 px | Not matched |
|---|---|---|---|---|---|
| `1455:4362` vs `6747:28894` | 132 | 132 | 9 / 86 / 32 / 2 | 3 | none |
| `1455:6626` vs `6747:29291` | 113 | 111 | 7 / 79 / 20 / 4 | 1 | "Privacy Settings", "© 2022 Soccernity" (item d) |

Over 3 px: the footer re-flow (Contact Us, "© 2026 Soccernity", same as K3) and "Nigeria" on the other-user frame (8 px off in the first comparison, fixed afterwards: now at the legacy x 574). Extra texts in the new frames: the monogram letters (CFC, LFC) and "© 2026 Soccernity".

Paints on the four desktop frames (visible nodes): 371 / 369 / 331 / 369 solid paints (other / own Posts / Media / Saved), **0 unbound, 0 black**; image fills 25 / 25 / 20 / 25 (photos and avatars); fonts Montserrat plus the existing Inter in the Navbar. Reactions on each: the three footer links (`6114:14222`, `6114:14471`, `6113:14053`) and the navbar avatar to the account dropdown `2841:5361`.

## 4. Link scan

Scanned every node on page `0:1` with prototype reactions (888, scratch clones excluded) for a destination equal to one of the five archived twins (`1455:4362`, `1455:6626`, `1460:8940`, `5702:8250`, `5778:8490`) or any of their 6,793 nodes (ids collected in total), and the page's 30 flow starting points. **0 reactions found, 0 re-pointed; 0 flow starting points inside the twins.** Their outbound reactions (three footer links per desktop twin) are replicated on the replacements (section 3).

## 5. Part 2 — wording (code is the reference: `GuardianConsentPage.tsx`, `GuardianConsentConfirmPage.tsx`, `docs/pending-copy-manifest.md`)

| Frame / node | Old | New |
|---|---|---|
| `5491:8241` (`5491:8306`), `5501:8453` (`5501:8518`), decline page | "You can still browse, follow teams and check scores." | "You can still browse the Sports Hub and check scores. [COPY PENDING LEGAL REVIEW]" |
| `5108:6629` (`5113:6674`, `5113:6675`) | title "Follow teams and check scores"; body "Browse the Sports Hub and follow grassroots and pro fixtures." | title "Check scores and fixtures"; body "Browse the Sports Hub, including grassroots and pro fixtures. [COPY PENDING LEGAL REVIEW]" |
| footnote on `5108:6629` (`5113:6744`), `6748:29330` (`6748:29446`), `6748:29450` (`6748:29556`) | "Declining keeps the account locked and deletes the details Ade entered after 30 days." | "You can decline up to 3 times. Changing the guardian email does not reset the count. After the third decline the account is scheduled for deletion." (the cap sentence of the code; the existing tag stays where it was) |

Not asked but done, because it is the same wording in the same dialog: the **title and body of both on-hold frames** (`6748:29376` / `6748:29377`, `6748:29486` / `6748:29487`) and the **mobile twin `5531:7626`** (`5531:7668`, `5531:7669`, footnote `5531:7738`) carried the identical old text and now match.

Revoke Username (admin-facing, proposed wording, OPEN):
- Dialog `6647:25789` (body `I6724:29200;6671:27545`) and Error `6649:24714` (dialog body `6649:24978`): second line "The username is held for 30 days after it is revoked: nobody can take it, and this user cannot choose it again."
- Username Revoked `6649:24462` (banner `I6724:27766;6671:27502`): "Username revoked. The action was recorded. The username is held for 30 days."
- Source: #398 D3, #402 item 3, #408 item 5 (B-167). #408 gives the decision but not the wording; this is a proposal. No tag was added (admin-facing; B-167 leaves the tag undecided); the existing "[COPY PENDING LEGAL REVIEW]" on the body line is unchanged. The error frame carries the line in its dialog body, as the dialog does, rather than inside the error banner ("nothing was changed"). B-167's adopted reading was "error frame gets none"; this follows the instruction that named all three frames and is OPEN 5.

## 6. Part 3 — logged-out mobile navigation

New top-level frames below the canvas (y 89000, nothing over existing frames, 0 overlaps), all auto-layout:

| Frame | Id | What it is |
|---|---|---|
| Mobile Header — Logged In — Closed | `6784:29454` | 390 x 64, an instance of `header 4 — mobile` (`5386:6576`) resized to 390 (the file's precedent). |
| Mobile Header — Logged Out — Closed | `6784:29476` | 390 x 64: instance of `header 7 — mobile` (`5386:6575`) at 334 wide plus a 48 px "Menu button" (hamburger cloned from the file's `bx:menu`, bound to `brand/navy`). The button has a click reaction to the drawer frame. |
| Mobile — Logged Out — Navigation Drawer Open | `6785:29485` | 390 x 844: the closed logged-out header with a detached copy of `Navigation Drawer — Mobile` (`5870:10689`) laid over it, scrim and shadow as in the component. |
| Note — Logged-out mobile navigation (OPEN points) | `6785:30713` | Note instance (Scope open, component `6671:27524`) listing the undecided points. |

Drawer content: logo; two buttons in place of the identity block ("Login" navy, "Sign up" outlined, cloned from the header's Login button); rows Sports Hub, Blog, Scouting, Academy (the last two cloned from the Blog row). Removed relative to the signed-in drawer: identity block, Community, Notifications, Bants, Leaderboard, Clubs, Groups, Grassroots, Settings, divider, Log out.

**Evidence for "sections a logged-out visitor can open"** (read, not assumed):
- `apps/web/src/app/router.tsx`: `/sports-hub`, `/blog`, `/blog/:articleId`, `/scouting`, `/academy` sit under `FooterLayout` with no gate; `/` is the logged-out marketing page.
- Page sources: `SportsHubPage`, `BlogPage` and `ComingSoonPage` contain no session check. `CommunityPage` ("Log in to see your Community feed"), `BanterPage`, `ClubsPage`, `GrassrootsPage`, `LeaderboardPage`, `CommunityGroupsPage`, `SearchTrendingPage`, `ContestPage` each render a "Log in to…" prompt with no session and never call the API.
- Decision Log #129 (Leaderboard login only), #152 (Community/Bants family login-gated), #282 and #284 (the navbar is closed to new features; Scouting and Academy are navbar-only), #408 item 8 and B-178 (logged-out mobile gets a menu control and a drawer with the public sections plus Login and Sign up).
- `navigation.ts` `drawerNavItems` (signed-in drawer): Community, Notifications, Sports Hub, Blog, Bants, Leaderboard, Clubs, Groups, Grassroots, Settings; no Home, Messages, Scouting or Academy.

Finding: `header 4 — mobile` draws a search **icon**, a **messages glyph** and the avatar (not a "search field", as #408 item 8 and the brief read), and `header 7 — mobile` draws a search icon and a Login button. The closed-state reference shows the component as it is.

Paints on the new frames: 14 / 9 / 27 / 2 solid paints, **0 unbound, 0 black**; one image fill (the avatar inside the `header 4` instance, existing shared-component debt).

## 7. Standing audit (page `0:1`)

| | before | after |
|---|---|---|
| top-level nodes | 881 | 885 (+ my four new frames) |
| hash of the original 881 ids (djb2) | 2410092652 | 2410092652 (unchanged, same order) |
| hash of all 885 ids | n/a | 3456004488 |
| `findAll` `6747:28894` | 195 | 773 |
| `findAll` `6747:29094` | 192 | 766 |
| `findAll` `6747:29291` | 149 | 646 |
| `findAll` `6747:29445` | 766 | 766 |
| `findAll` `6747:29642` / `6747:29709` | 66 / 46 | 66 / 46 |
| `findAll` archived twins `1455:4362` / `1455:6626` / `1460:8940` / `5702:8250` / `5778:8490` | 2231 / 2186 / 2259 / 66 / 46 | unchanged |
| `findAll` `5491:8241` / `5501:8453` / `5108:6629` / `6748:29330` / `6748:29450` | 72 / 72 / 116 / 119 / 119 | unchanged (text edits only) |
| `findAll` `6647:25789` / `6649:24462` / `6649:24714` | 178 / 156 / 174 | unchanged |
| `findAll` new frames `6784:29454` / `6784:29476` / `6785:29485` / `6785:30713` | none | 21 / 15 / 41 / 2 |
| `findAll` whole page | 141448 | 143180 (scratch clones included in neither figure) |
| ARCHIVED nodes | 416 = 62 + 354 | **419 = 62 top-level + 357 nested** (+3: the three K2 columns, section 2; `docs/figma-archive-index.md` updated) |

Overlaps with visible top-level nodes: new frames 0; the four rebuilt desktop frames 0 (after the move of `6747:28894`); the eight edited guardian and admin frames 0 (also `5531:7626`). Not visually compared in a real browser (none available).

## 8. OPEN and findings not fixed

OPEN (needs you):
1. Own Posts desktop `6747:29094` has no legacy twin; it was derived from the Saved frame. Whether it should show the one-row "Copy Profile Link" menu open (as the Saved frame does) is the same question as K3's OPEN 1.
2. Two sample-value sets disagree: desktop frames use `@nelson_iheagwam`, "5,500 Following", no posts count; the two mobile frames (identical to their legacy twins) and the unarchived mobile Saved frame `5778:8567` use `@christine001`, "250 Following", "124 Posts". The brief says legacy item by item and also to match the desktop values; for mobile these conflict, so the mobile frames were left unchanged. One text pass can align them.
3. The code footnote on the guardian confirm page is "cap sentence + Read our Privacy Policy" only; the Figma footnote keeps the link-expiry and withdrawal sentences with the cap sentence replacing the "Declining keeps…" sentence. Which is final?
4. The Restricted Pending frames (`5108:6630`, `5531:7461`) still say "Browse and follow" / "Follow teams and grassroots leagues." (the manifest records different wording in code; not in this brief). `6654:76` / `6654:26801` (withdrawal confirm) say withdrawing "closes the account straight away".
5. Revoke Username: the proposed wording, whether it takes the tag, whether the error frame gets a line (B-167 said none), and whether the success frame shows a date (`heldUntil`).
6. Logged-out drawer: which sections (gated ones listed or not), Scouting and Academy in or out, Home, the placement of the menu control, and the component changes (a Logged Out variant of `header 7 — mobile` and of `Navigation Drawer — Mobile`): see the Note `6785:30713`.
7. The K2 notes beside the profile frames (`6754:29553`, `6754:29556`) describe K2's version and were not revised.
8. The hidden K2 columns inside the three frames and `6747:29556` in the Saved frame are kept; delete or keep.
9. Crest licensing (represented-club mark, Fixtures rows) stays open (#85, #97, #403 item 13).

## 9. Register status lines (for you to route; `docs/build-register.md` not edited)

- B-138 (profile frames): `Figma pass K4 2026-10-20 (figma-pass-k4-report.md): the other K2 replacements were diffed against their legacy twins; other-user Posts 6747:28894 and own Media 6747:29291 rebuilt to match 1455:4362 and 1455:6626 (rails, photo cover and avatar, buttons, menu, tabs, posts, footer reactions), own Posts 6747:29094 derived from the Saved frame (no legacy twin); mobile 6747:29642 and 6747:29709 have 0 differences from 5702:8250 and 5778:8490 and are unchanged; K3 Fixtures dot defect fixed in all four desktop frames; 0 inbound links to the archived twins; other-user frame moved to (6560, 77200); archive index 419 = 62 + 357.`
- B-146 / B-154 (guardian wording): `Figma pass K4: 'follow teams' wording replaced and the old decline footnote replaced by the cap sentence on 5491:8241, 5501:8453, 5108:6629, 5531:7626, 6748:29330, 6748:29450; Restricted Pending 5108:6630 / 5531:7461 not changed (report section 8).`
- B-167 (revoke hold line): `Figma pass K4: 30-day hold line added to 6647:25789, 6649:24462 and 6649:24714 with proposed wording (OPEN).`
- B-178 (mobile header): `Figma pass K4: logged-in closed header 6784:29454, logged-out closed header 6784:29476 with a menu control, logged-out drawer open 6785:29485 and a Note 6785:30713 drawn; header 7 — mobile and Navigation Drawer — Mobile were not edited (component change needed, OPEN); FC4 can build from these frames.`
