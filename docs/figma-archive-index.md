# Figma archive index

Generated 2026-10-18 (Figma pass K, `figma/pass-k-admin-incorrect-details-archive`) from a live read of the file `weZWWqggy9j13eX8bhFgs6`, page `0:1` (`findAll` on every node whose name starts with `ARCHIVED`). Nothing was deleted by this pass: an archived node is hidden and prefixed `ARCHIVED — `. Coordinates are canvas coordinates of the top-level frame (x, y), width x height.

**Updated 2026-10-18 by Figma pass K2** (`figma/pass-k2-profile-frames-and-states`): the four legacy profile frames are now archived (section 1g), the carousel and Message archive-name findings are fixed (section 4), and 13 hidden archived nodes that came along when frames were cloned are listed in section 2f. Live count taken at the end of K2 with `findAll` on every node whose name starts with `ARCHIVED`: **414** = **61 top-level** + **353 nested**, in **83** host frames. The figures below (397 = 57 + 340, 81 hosts) were the founder's count before K2; 397 + 4 top-level (section 1g) + 13 nested (section 2f) = 414, so K2 closes the gap, and no unexplained difference remains.

**Updated 2026-10-18 by Figma pass K3** (`figma/pass-k3-own-saved-desktop`): the legacy own-Saved desktop frame `1460:8940` is now archived (section 1g, fifth row) after its replacement `6747:29445` was rebuilt to match it, and one hidden nested node, `6747:29556` (the K2 profile column that K3 replaced inside `6747:29445`), is listed in section 2g. Live count taken at the end of K3 with `findAll` on every node whose name starts with `ARCHIVED`: **416** = **62 top-level** + **354 nested** (K2: 414 = 61 + 353; +1 top-level for `1460:8940`, +1 nested for `6747:29556`; no other change). The K3 report is `docs/figma-pass-k3-report.md`.

**Updated 2026-10-20 by Figma pass K4** (`figma/pass-k4-profile-diffs-copy-logged-out-nav`): three more hidden nested nodes, the K2 profile columns inside `6747:28894`, `6747:29094` and `6747:29291`, are listed in section 2h. Live count taken at the end of K4 with `findAll` on every node whose name starts with `ARCHIVED`: **419** = **62 top-level** + **357 nested** (K3: 416 = 62 + 354; +3 nested, no change at top level). The other-user replacement `6747:28894` was moved from (0, 77200) to (6560, 77200) because it grew from 926 to 2710 high and would otherwise overlap the mobile profile frames. The K4 report is `docs/figma-pass-k4-report.md`.

**Updated 2026-10-20 by Figma pass K5** (`figma/pass-k5-restricted-pending-mobile-logged-out`): eight more hidden nested nodes are listed in section 2i (the posts-count stat on three mobile profile frames, the pieces of the two K4 logged-out frames that were replaced by instances of the new header variant and drawer component, and the K4 detached drawer copy). Live count taken at the end of K5 with `findAll` on every node whose name starts with `ARCHIVED`: **427** = **62 top-level** + **365 nested** (K4: 419 = 62 + 357; +8 nested, no change at top level). The K5 report is `docs/figma-pass-k5-report.md`.

**Updated 2026-10-24 by Figma pass K6** (`figma/pass-k6-restricted-pending-profile-states`): four more hidden nested nodes are listed in section 2j (the "Last sent" resend note and the stale SCOPE OPEN note on both Restricted Pending frames). Live count taken at the end of K6 with `findAll` on every node whose name starts with `ARCHIVED`: **431** = **62 top-level** + **369 nested** (K5: 427 = 62 + 365; +4 nested, no change at top level). The K6 report is `docs/figma-pass-k6-report.md`.

Previous counts (corrected 2026-10-18 to the live figures given by the founder): **397** archived nodes = **57 top-level frames** (section 1) + **340 nested nodes** (section 2) inside **81** host frames. The first version of this index said 398 = 57 + 341; the live count is one lower. The figures are the founder's; this docs-only change did not re-count the canvas, and the host-frame count (81) was not re-checked. Nothing in this index lists a node removed after pass K, so the one-node difference is recorded, not explained. Pass K also removed one hidden `ARCHIVED — Button — Retry` that came along when the incorrect-details Load Error frame was cloned, because it was an artefact of the clone, not an original; it was never one of the counted nodes.

How to use it: section 1 answers "where is the old frame and what replaced it". Section 2 answers "which hidden originals sit inside this live frame". To find an id on the canvas, paste it into Figma search or use the id in a plugin call.

"Superseded by" is taken from the node name where the name says so, and from the pass reports and Decision Log rows cited in the last column. Where the name says nothing, the cell says so.

## 1. Top-level archived frames (57)

56 are hidden; one (`5648:8093`) is a visible caption.

### 1a. Blog, Articles and company pages (10), superseded by the Logged In / Logged Out split

| id | Name | Superseded by | Position |
|---|---|---|---|
| `1009:128` | Blog Page Desktop | `5953:10771` Logged In, `5953:11364` Logged Out | -40611, -30794, 1440 x 11756 |
| `41:4` | Blog Page Mobile (375px) | `5956:10960`, `5956:11331` (390px) | -39067, -30794, 375 x 5753 |
| `54:434` | Articles Page Desktop | now named Blog — Article Detail Desktop: `5997:10905`, `5997:11224` (Decision Log #197) | -37934, -30797, 1440 x 4657 |
| `87:80` | Articles Page mobile (375px) | Blog — Article Detail Mobile: `6000:11346`, `6000:11377` | -36355, -30797, 375 x 6049 |
| `87:158` | Contact Us Desktop | `6113:14053`, `6113:14199` | -15510, -30794, 1440 x 2081 |
| `102:340` | Terms of Service Desktop | `6114:14222`, `6114:14352` | -13463, -30794, 1440 x 2129 |
| `104:444` | Privacy Policy Desktop | `6114:14471`, `6114:14601` | -11416, -30794, 1440 x 2129 |
| `96:253` | Contact Us Mobile (375px) | `6115:14611`, `6115:14684` (390px) | -13924, -30794, 375 x 1191 |
| `104:393` | Terms of Service mobile (375px) | `6116:14627`, `6116:14685` | -11937, -30794, 375 x 3563 |
| `104:474` | Privacy Policy mobile (375px) | `6116:14734`, `6116:14792` | -9890, -30794, 375 x 3563 |

Source: names; Decision Log #169, #171, #176, #202; pass reports in `docs/` (blog-split, articles-page-split, legal-pages-navbar-retrofit).

### 1b. Settings (6), superseded by the Settings consolidation (Decision Log #230, #244 to #249)

| id | Name | Superseded by | Position |
|---|---|---|---|
| `2922:5143` | Settings — Security & Account (one-row intermediate) | `2926:8056` Settings — Security & Account Settings | -16000, -13500, 1440 x 2517 |
| `5649:8074` | Settings — Security & Account — Mobile | `5695:8279` | -12400, -13500, 390 x 319 |
| `2922:5602` | Settings — Notification Preferences (By Type) (losing hub) | `2926:9721` Settings — Notification Preferences | -14200, -13500, 1440 x 2517 |
| `5649:8116` | Settings — Notification Preferences (By Type) — Mobile | `5696:8340` | -11800, -13500, 390 x 399 |
| `2922:5382` | Settings — Privacy & Safety | name does not say; merged into Settings — Privacy `6178:14437` (Decision Log #222, pass `auth-navbar-delete-account-privacy-consolidation`) | -12029, -8642, 1440 x 2517 |
| `5649:8092` | Settings — Privacy & Safety — Mobile | name does not say; merged into Settings — Privacy — Mobile `6185:14547` (#222) | -3751, -8642, 390 x 368 |

### 1c. Message and Community mobile (9), superseded by the PR #116 rebuilds

| id | Name | Superseded by | Position |
|---|---|---|---|
| `1761:2342` | Messages mobile window 1 (360px) | the name cites `2067:3006`, which was itself deleted later (Decision Log #114); current replacement: Message — Inbox (Chat List) — Mobile `5709:8354` | 6582, 26200, 360 x 1059 |
| `1761:2321` | Messages mobile window 2 | same as above, `5709:8354` | 7102, 26200, 428 x 926 |
| `1762:2645` | Messages mobile window 4 | the name cites `2067:3176` (also deleted later); current replacement: Message — Conversation — Mobile `5709:8419` | 7622, 26200, 428 x 926 |
| `5648:8093` | ARCHIVED — note (visible caption) | caption for the three Message frames above; says window 3 is NOT archived (its context menu was componentised as `5706:8270`) | 6582, 26050, 1500 x 44 |
| `1708:2321` | community mobile 1 (428px, absolute layout) | one of the five 390px auto-layout rebuilds `5701:8239`, `5703:8250`, `5701:8328`, `5702:8250`, `5702:8317` (the pairing by number is not recorded) | 8150, 26200, 428 x 926 |
| `1762:2847` | community mobile 2 | same set | 8650, 26200, 428 x 926 |
| `1708:2401` | community mobile 3 | same set | 9150, 26200, 428 x 926 |
| `1769:5230` | community mobile 4 | same set | 9650, 26200, 428 x 926 |
| `1770:5435` | community mobile 5 | same set | 10150, 26200, 428 x 926 |

### 1d. Contest "task" admin screens (9), superseded because contests are not admin-judged (Decision Log #381)

All at y -13200, 1440 x 1184.

| id | Name | x |
|---|---|---|
| `2363:2244` | Contest - Contest Task tab | 55000 |
| `2363:3446` | Contest - scheduled contest task tab | 56620 |
| `5403:6640` | Contest - Create Task | 58240 |
| `5403:6753` | Contest - Schedule Task | 59860 |
| `5403:6866` | Contest - Edit Task | 61480 |
| `5403:6979` | Contest - Search Task | 63100 |
| `5403:7092` | Contest - Delete Task | 64720 |
| `5405:8277` | Contest - Empty State | 66340 |
| `5405:8390` | Contest - Task Scheduled (Success) | 67960 |

Superseded by the Contest admin console screens; the "task" model has no backend entity (name). The current admin Contest screens are the pass C frames `6643:21602` to `6646:24345` (Create / Edit Contest, Overview, Cycle History, Finalist Impressions).

### 1e. Admin Contest console frames, admin-judged model (14), superseded by pass C

All at y -13200. Names state: contests are not admin-judged (Decision Log #381, `docs/contest-spec.md` section 3).

| id | Name | x | Size |
|---|---|---|---|
| `6271:15272` | Admin — Contest Console — No Cycle | 79300 | 1440 x 1184 |
| `6269:14868` | Admin — Contest Console — Vacant (No Week Judged) | 80920 | 1440 x 1184 |
| `6266:14767` | Admin — Contest Console — Weeks In Progress | 82540 | 1440 x 1184 |
| `6269:15107` | Admin — Contest Console — All Weeks Judged | 84160 | 1440 x 1213 |
| `6270:15070` | Admin — Contest Console — Final Live | 85780 | 1440 x 1213 |
| `6270:15346` | Admin — Contest Console — Crowned | 87400 | 1440 x 1213 |
| `6272:15373` | Admin — Contest — Start a Cycle | 89020 | 1440 x 1184 |
| `6273:15474` | Admin — Contest — Start a Cycle (Custom Weekly Windows) | 90640 | 1440 x 1496 |
| `6273:15664` | Admin — Contest — Start a Cycle — Blocked (Cycle Already Running) | 92260 | 1440 x 1184 |
| `6277:16282` | Admin — Contest — Cycle History | 93880 | 1440 x 1184 |
| `6274:15676` | Admin — Contest — Judge Week (Open Round) | 69580 | 1440 x 1184 |
| `6275:15777` | Admin — Contest — Judge Week (Already Judged) | 71200 | 1440 x 1184 |
| `6275:15985` | Admin — Contest — Judge Week (No Entries — Thin Week) | 72820 | 1440 x 1184 |
| `6275:16182` | Admin — Contest — Judge Week — Blocked (Out Of Sequence) | 74440 | 1440 x 1184 |
| `6276:16080` | Admin — Contest — Open the Final (Confirm) | 76060 | 1440 x 1213 |
| `6276:16213` | Admin — Contest — Crown Winners | 77680 | 1440 x 1184 |

(16 rows: the first ten were archived in pass F2 as "superseded by pass C admin Contest screens", the last six in pass B as admin judging frames with no successor.) Successors: pass C frames `6643:21602` to `6646:24345`.

### 1f. Contest voting, final week and carousel (7)

| id | Name | Superseded by | Position |
|---|---|---|---|
| `5802:8978` | Contest — Already Voted (legacy absolute layout, rebuilt on auto-layout, #401 E9) | first rebuilt as `6671:27155`, which was archived in turn; now Voting with the vote toggle, desktop `2094:994` | 0, 59400, 1440 x 1184 |
| `6671:27155` | Contest — Already Voted | Voting with the vote toggle (#403 item 7), desktop `2094:994` | 8120, 59400, 1440 x 1449 |
| `5815:8916` | Contest — Already Voted — Mobile | Voting — Mobile `5802:8726` | 9760, 59400, 390 x 871 |
| `6661:29122` | Contest — Details — Final Week (Week 4, from the reveal) — Desktop | final-week entries are not on the Contest page (E10, #400): Community feed Final Week Showcase `6661:26929`, pinned entry on the finalist's profile `6707:26727` / `6707:26938` | 3280, 59400, 1440 x 1741 |
| `6661:29321` | Contest — Details — Final Week (Week 4, from the reveal) — Mobile | `6661:29200`, `6709:26922` / `6709:27056` | 5420, 59400, 390 x 1406 |
| `6697:26197` | Page=3 (carousel is 6 finalists = 2 pages, pass J, #404 item 9) | carousel set `6697:26234` (Page=1, Page=2) | 6916, 43600, 796 x 340 |
| `6697:27409` | Page=3 (same, mobile) | `6697:27448` | 6048, 44847, 358 x 438 |

Pass K note: the two archived Contest-page Final week frames sample 9 finalists; the live carousel samples 6 (see the note on `6664:27284` and `6664:27301`). They were not edited.

### 1g. Legacy profile frames (5), superseded by the general profile frames (pass K2 for four, pass K3 for the fifth; B-138)

Archived in pass K2 only after each replacement existed and a page-wide scan found no reaction still pointing at it (the one reaction that did, the mobile drawer "Signed in as" link, was re-pointed first). Hidden; names now read "ARCHIVED — ... (superseded by id name)". Not deleted.

| id | Name | Superseded by | Position |
|---|---|---|---|
| `1455:4362` | User's post feed — Other User variant (#396 C1), desktop, legacy absolute layout | `6747:28894` Profile — Other User — Posts — Desktop | -45403, -8208, 1440 x 2709 |
| `1455:6626` | User's Media feed — Own profile variant (#396 C1), desktop, legacy absolute layout | `6747:29291` Profile — Own — Media — Desktop (own Posts `6747:29094`, own Saved `6747:29445`) | -43832, -8208, 1440 x 2660 |
| `5702:8250` | Community — Profile — Own — Mobile (#396 C1) | `6747:29642` Profile — Own — Posts — Mobile (the mobile drawer "Signed in as" link now targets it) | 8531, 23522, 390 x 630 |
| `5778:8490` | Community — Profile · Media — Mobile | `6747:29709` Profile — Own — Media — Mobile | 9531, 23522, 390 x 833 |
| `1460:8940` | User's Saved Posts — Own profile variant (#396 C1), desktop, legacy absolute layout (archived by pass K3; name now "ARCHIVED — Profile — Own — Saved — Desktop (superseded by 6747:29445)") | `6747:29445` Profile — Own — Saved — Desktop, rebuilt in K3 to match it (`docs/figma-pass-k3-report.md`) | -42236, -8208, 1440 x 2709 |

Not archived and still live: `5778:8567` Profile · Saved — Mobile, `6669:27188` other-user mobile.

Inside the two desktop frames the Navbar instance reports 0 sub-layers while the frame is hidden (105 when visible, as on the unarchived `1460:8940`), so a `findAll` count of each hidden frame is 105 lower than before (2336 to 2231, 2291 to 2186). Verified by counting the same frame hidden and shown and by comparing with `1460:8940`; nothing was removed.

## 2. Nested archived nodes (354 after K3; 353 before), grouped by host frame

Each host frame is live (visible) unless it says otherwise. "Pass J" nodes are the original local Pill, Button, Banner, Callout, Dialog frames that were replaced by an instance of the shared component and kept hidden next to it. The name of each node carries the reason in brackets; the ids are listed so every one is findable.

### 2a. Sign-in, registration and profile

| Host (id, position) | Archived nodes (reason) |
|---|---|
| `407:844` Login desktop (63527, -30902) | `5418:7088` Continue with Apple (#378: Apple removed) |
| `1625:2303` Login mobile (65162, -30902) | `5418:7154` Continue with Apple |
| `407:1051` Register desktop (66196, -30971) | `5378:6186` Date picker (open), Date of Birth (#367: DOB read-only); `5418:7110` Continue with Apple |
| `1625:2333` Register mobile (67838, -30971) | `5379:6190` Date picker; `5418:7176` Continue with Apple |
| `1498:2303` Create Profile desktop (66135, -28331) | `1498:2520` chevron (free-text field, #367) |
| `1629:2449` Create Profile mobile (67913, -28176) | `1629:2524` chevron |
| `6672:29251` Create Profile — Flagged Bio / Preferred Club — Desktop (68883, -28176) | `6672:29263` chevron |
| `6672:29235` same, Mobile (68413, -28176) | `6672:29247` chevron |
| `1455:4362` User's post feed — Other User variant (-45403, -8208) | `1455:6390` Privacy Settings link (#222 part 4); `1455:6393` bullet before it; `1455:6616` Share Profile Via (#371: no Share action); `1455:6620` share-outline icon |
| `1460:8940` Saved Posts — Own profile variant (-42236, -8208) | `1460:11194` Share Profile Via; `1460:11198` share-outline |
| `6669:27188` Community — Profile — Other User — Mobile (15031, 23522) | `6669:27222` Tab — Saved (own profile only, #22); `6669:27266` Share Profile Via; `6669:27270` share-outline |
| `6655:27355` Profile — Block Confirmation Dialog — Desktop (-45403, -5300) | `6655:29577` Share Profile Via; `6655:29581` share-outline; `6655:29597` Placeholder, consequences of blocking (decided in #396 / #402) |
| `6655:29600` Profile — Block Confirmation Dialog — Mobile (-43763, -5300) | `6706:26881` Tab — Saved; `6706:26914` menu (closed after tapping Block); `6706:26918` Share Profile Via; `6706:26922` share-outline; `6655:29601` own-profile background (superseded by other-user variant `6669:27188`); `6655:29677` Placeholder, consequences of blocking |

### 2b. Settings, guardian consent and leaderboard

| Host | Archived nodes (reason) |
|---|---|
| `2926:8294` Settings — Two-Factor Auth (Authenticator App) (-15456, -2690) | `2926:8408` Text message row (SMS, #378: authenticator app only) |
| `5696:8213` same, Mobile (249, -8642) | `5696:8226` Row — Text message; `5696:8233` Divider below the SMS row |
| `6655:2`, `6655:41`, `6655:85`, `6655:137`, `6655:173` Two-Factor Auth desktop steps 1 to 5 | `6655:17`, `6655:56`, `6655:100`, `6655:152`, `6655:188` Text message row (SMS, #378), one per frame in that order |
| `6655:27159`, `6655:27196`, `6655:27238`, `6655:27288`, `6655:27322` Two-Factor Auth mobile steps 1 to 5 | `6655:27167` + `6655:27172`; `6655:27204` + `6655:27209`; `6655:27246` + `6655:27251`; `6655:27296` + `6655:27301`; `6655:27330` + `6655:27335` (Row — Text message and the divider below it) |
| `6711:26922` Two-Factor — Manual setup key — Desktop (0, 72500) | `6711:26937` Text message row |
| `6711:27117` Two-Factor — Backup codes (-12240, 3700) | `6711:27132` Text message row |
| `6711:27333` Two-Factor — Turn off (3280, 72500) | `6711:27348` Text message row |
| `2924:7112` Settings — Account Information (Edit) (-10321, -5738) | `2924:7243` Frame 5929 (removed, #404 item 1: no Country field here) |
| `5649:8176` same, Mobile (-2251, -8642) | `5649:8200` Field — Country (removed, #404 item 1) |
| `5108:6629` Guardian Consent 4 Web Consent Confirmation (17504, -7359) | `5113:6664` Row — Build a player profile (#377: no player profile in the MVP) |
| `5531:7626` same, Mobile (22900, 700) | `5531:7658` Row — Build a player profile |
| `5108:6630` Guardian Consent 5 Restricted Pending State (19565, -7446) | `5114:6693` Row — Set up your profile (#377) |
| `5531:7461` same, Mobile (24395, 715) | `5531:7522` Row — Set up your profile |
| `5524:7512` Leaderboard — Contest Tab — Week 4 Final — Live Ranking (-40726, 11229) | `5524:7730` View this contest link (week 4 has no Contest page, E10 #400) |
| `5541:7527` same, Mobile (-38986, 10629) | `5541:7711` View this contest link |

### 2c. Contest voting, carousel and notes

| Host | Archived nodes (reason) |
|---|---|
| `2094:994` Contest - content voting page (32150, 6694) | `6695:27469` Vote status banner (state-neutral intro, #403 item 7) |
| `5802:8726` Contest — Voting — Mobile (28244, 8683) | `6671:27438` Vote toggle (replaced by a fresh instance); `5802:8761` Button — Vote (replaced by the Vote toggle, #401) |
| `5815:8916` (top-level archived frame, section 1f) | `5815:8931` Button — Voted; `6663:27186` Button — Retract vote (both replaced by the Vote toggle, #401) |
| `6697:26234` carousel set, Desktop (5200, 43600) | `6661:26758`, `6697:26163` Link — Contest page (dead link removed, #403 item 11) |
| `6697:27448` carousel set, Mobile (5200, 44847) | `6661:26841`, `6697:27373` Link — Contest page |
| `6697:26197`, `6697:27409` (top-level archived Page=3 variants) | `6697:26200`, `6697:27412` Link — Contest page |
| `6664:27284`, `6664:27301` Notes on Contest Details Final Week | `6664:27285`, `6664:27302` "ARCHIVED BY W0 PASS F1" caption text inside each note |
| `6278:16383` Contest Admin Console — Design Notes (36643, -17887) | `6278:16416` "Archived in Pass F2" |

### 2d. Admin: Contest screens of pass C (pass J originals replaced by shared components, plus E2 toggles)

The Phase pills, Toggle rows and buttons below were hidden when the shared Pill, Button, Banner and Callout were adopted (pass J) and when the followers-excluded switch became week 4 only (#399 E2). Hidden, kept.

| Host (id, position) | Archived nodes |
|---|---|
| `6643:21602` Create Contest (38987, -17887) | Button — Back to console `6643:21809`; Pills Phase 1/2 for the three weeks `6643:21871`, `6643:21873`, `6643:21898`, `6643:21900`, `6643:21925`, `6643:21927`; Pill — Upload 22–24 Oct `6643:21952`; Pill — Reveal 25 Oct `6643:21954`; Toggle row — Followers-excluded counting x3 (weeks 1 to 3, week 4 only, #399 E2) `6643:21887`, `6643:21914`, `6643:21941`; Button — Create contest `6643:21965`; Button — Cancel `6643:21967` |
| `6643:21973` Create Contest — Validation (40607, -17887) | Back `6643:22180`; Banner — validation `6643:21970`; Pills `6643:22245`, `6643:22247`, `6643:22275`, `6643:22277`, `6643:22305`, `6643:22307`, `6643:22335`, `6643:22337`; Toggle rows `6643:22264`, `6643:22294`, `6643:22324`; Create `6643:22348`; Cancel `6643:22350` |
| `6644:21820` Edit Contest (42227, -17887) | Pill — Running `6644:22027`; Back `6644:22029`; Pills `6644:22090`, `6644:22092`, `6644:22117`, `6644:22119`, `6644:22144`, `6644:22146`, `6644:22171`, `6644:22173`; Toggle rows `6644:22106`, `6644:22133`, `6644:22160`; Save `6644:22184`; Cancel `6644:22186` |
| `6644:22188` Edit Contest — Save Error (43847, -17887) | Running `6644:22395`; Back `6644:22397`; Banner — save error `6644:22402`; Pills `6644:22461`, `6644:22463`, `6644:22488`, `6644:22490`, `6644:22515`, `6644:22517`, `6644:22542`, `6644:22544`; Toggle rows `6644:22477`, `6644:22504`, `6644:22531`; Save `6644:22555`; Cancel `6644:22557` |
| `6644:22559` Overview — Running (45467, -17887) | Pill — Running `6644:22766`; Pill — Week 3 Phase 2 voting `6644:22768`; Buttons Edit contest `6644:22770`, Cycle history `6644:22772`, Finalist impressions `6644:22774`; Pills Winners confirmed `6644:22792`, Forfeited `6644:22794`, Voting open `6644:22796`, Scheduled `6644:22798`, Upload window `6644:22842`, Reveal `6644:22844`, Engagement window `6644:22846`; Callout — no admin judging `6644:22849` |
| `6644:22852` Overview — Final (No Winner) (47087, -17887) | Completed `6644:23059`; No winner this month `6644:23061`, `6644:23076`; Cycle history `6644:23063`; Finalist impressions `6644:23065`; Winners confirmed `6644:23070`, `6644:23074`; Forfeited `6644:23072`; Below minimum tally `6644:23121`, `6644:23123`, `6644:23125`, `6644:23127`, `6644:23129`; No upload by deadline `6644:23131` |
| `6644:23174` Overview — No Contest (48707, -17887) | Cycle history `6644:23381`; Create contest `6644:23389` |
| `6644:23391` Overview — Load Error (50327, -17887) | Cycle history `6644:23598`; Banner — load error `6644:23603`; Retry `6644:23607` |
| `6645:22444` Cycle History (51947, -17887) | Back to overview `6645:22651`; Running `6645:22656`; Completed `6645:22659`, `6645:22662`, `6645:22665`; Callout — history behaviour `6645:22702` |
| `6645:22705` Cycle History — Empty (53567, -17887) | Back `6645:22912`; Create contest `6645:22920` |
| `6645:22922` Cycle History — Load Error (55187, -17887) | Back `6645:23129`; Banner `6645:23134`; Retry `6645:23138` |

### 2e. Admin: moderation, held investigations, flagged images, user detail, DOB correction

| Host (id, position) | Archived nodes (all "replaced by instance, pass J" unless noted) |
|---|---|
| `6647:23351` Held Investigations (79600, -11700) | Pill — Held more than 90 days `6647:23558`; Back to moderation `6647:23560`; Apply filter `6647:23573`; Hold-type markers (Open report `6672:26843`, Legal hold `6672:26846`, Reporter acted in bad faith `6672:26850`); Lift hold `6672:26848`, `6672:26852` |
| `6647:23603` — Empty (81220, -11700) | `6647:23810`, `6647:23812`, `6647:23825` (Pill, Back, Apply filter) |
| `6647:23831` — Validation (82840, -11700) | `6647:24038`, `6647:24040`, `6647:24056` |
| `6647:24060` — Load Error (84460, -11700) | `6647:24267`, `6647:24269`, `6647:24282`, Banner `6647:24285`, Retry `6647:24289` |
| `6647:24318` Flagged Images (86080, -11700) | Pill `6647:24525`; Back `6647:24527`; Callout `6647:24532`; Pill — Not live `6651:25171`, `6651:25180`, `6651:25189`; Approve `6651:25174`, `6651:25183`, `6651:25192`; Reject `6651:25176`, `6651:25185`, `6651:25194` |
| `6647:24566` — Reject Dialog (87700, -11700) | Pill `6647:24773`; Back `6647:24775`; Callout `6647:24780`; Not live `6651:25198`, `6651:25207`, `6651:25216`; Approve `6651:25201`, `6651:25210`, `6651:25219`; Reject `6651:25203`, `6651:25212`, `6651:25221`; Cancel `6647:24814`; Reject image `6647:24816` |
| `6647:24833` — Reject Dialog — Validation (89320, -11700) | Pill `6647:25040`; Back `6647:25042`; Callout `6647:25047`; Not live `6647:24293`, `6647:24302`, `6647:24311`; Approve `6647:24296`, `6647:24305`, `6647:24314`; Reject `6647:24298`, `6647:24307`, `6647:24316`; Cancel `6647:25081`; Reject image `6647:25083` |
| `6647:25103` — Empty (90940, -11700) | `6647:25310`, `6647:25312` |
| `6647:25320` — Load Error (92560, -11700) | `6647:25527`, `6647:25529`, Banner `6647:25534`, Retry `6647:25538` |
| `6647:25540` User Detail (94180, -11700) | Pill — active `6647:25747`; Back to users `6647:25749`; Revoke username `6647:25780`; Correct date of birth `6647:25787` |
| `6647:25789` — Revoke Username Dialog (95800, -11700) | Pill `6647:25996`; Back `6647:25998`; Revoke username `6647:26029`, `6647:26040`; Correct DOB `6647:26036`; Dialog — Revoke username `6647:26043`; Cancel `6647:26038` |
| `6649:24462` — Username Revoked (79600, -8900) | Pill `6649:24672`; Back `6649:24674`; Banner — success `6649:24669`; Revoke `6649:24705`; Correct DOB `6649:24712` |
| `6649:24714` — Revoke Username Error (81220, -8900) | Pill `6649:24921`; Back `6649:24923`; Revoke `6649:24954`, `6649:24965`; Correct DOB `6649:24961`; Banner — error `6649:24975`; Cancel `6649:24963` |
| `6649:24980` User — Correct Date of Birth (82840, -8900) | Pill — Support action `6649:25187`; Back to user `6649:25189`; Callout — consequences `6649:25209`; Review correction `6649:25213`; Cancel `6649:25215` |
| `6649:25217` — Validation (84460, -8900) | Pill `6649:25427`; Back `6649:25429`; Banner `6649:25424`; Callout `6649:25455`; Review `6649:25459`; Cancel `6649:25461` |
| `6649:25463` — Confirm (86080, -8900) | Pill `6649:25670`; Back `6649:25672`; Callout `6649:25692`; Review `6649:25696`; Cancel `6649:25698`, `6649:25700`; Confirm correction `6649:25702` |
| `6649:25721` — Success (87700, -8900) | Pill — Recorded `6649:25928`; Back `6649:25930`; Callout — result `6649:25949` |
| `6649:25952` — Error (89320, -8900) | Pill `6649:26159`; Back `6649:26161`; Callout `6649:26181`; Review `6649:26185`; Cancel `6649:26187`, `6649:26189`; Banner — error `6649:26201`; Confirm `6649:26191` |
| `6672:27278` Report Detail — Bad Faith Confirm (0, 63400) | Dismiss `6672:27312`; Remove Content `6672:27314`; Warn `6672:27316`; Suspend `6672:27318`; Reporter Acted In Bad Faith `6672:27320`; Legal Hold `6672:27322`; Callout `6672:27324`; Callout — Case-level actions `6672:27327`; Cancel `6672:27345`; Confirm bad faith `6672:27347` |
| `6672:27349` — Legal Hold Confirm (1620, 63400) | `6672:27383`, `6672:27385`, `6672:27387`, `6672:27389`, `6672:27391`, `6672:27393`, Callout `6672:27395`, Case-level `6672:27398`, Cancel `6672:27416`, Place legal hold `6672:27418` |
| `6672:27420` — Lift Hold Confirm (3240, 63400) | `6672:27454`, `6672:27456`, `6672:27458`, `6672:27460`, `6672:27462`, `6672:27464`, Callout `6672:27466`, Case-level `6672:27469`, Field — Rejection reason (not used for lift hold) `6672:27481`, Cancel `6672:27487`, Lift hold `6672:27489` |
| `6672:28898` — Legal Hold Active (4860, 63400) | Marker `6672:29053`; Lift hold `6672:29056`; `6672:28932`, `6672:28934`, `6672:28936`, `6672:28938`, `6672:28940`, `6672:28942`; Callout `6672:28944`; Case-level `6672:28947` |
| `6672:29059` Appeal Review — Legal Hold Active (6480, 63400) | Marker `6672:29211`; Lift hold `6672:29214`; Callout `6672:29065`, `6672:29096`; Uphold `6672:29092`; Overturn `6672:29094`; Bad faith `6672:29101`; Legal hold `6672:29103`; Case-level `6672:29105` |
| `6738:28328` Incorrect-Details Reports — Load Error (86080, -6100) | none now: the one archived Retry that came with the clone (`6738:28508`) was removed in pass K |

### 2f. Archived nodes carried into new frames by cloning (pass K2, 13 nodes)

These are copies of the hidden originals listed in sections 2b and 2e; they came with the frame when it was cloned and were left hidden, not removed.

| Host (id, position) | Archived nodes |
|---|---|
| `6748:29330` Guardian Consent — 4 Web Consent Confirmation — Approval On Hold (0, 81800) | Row — Build a player profile `6748:29366` (#377) |
| `6748:29450` same, Mobile (1640, 81800) | Row — Build a player profile `6748:29476` |
| `6752:29980` Admin — User — Correct Date of Birth — Adult To Minor — Guardian Details (82840, -3400) | Pill — Support action `6752:29986`; Button — Back to user `6752:29989`; Callout — consequences `6752:30008`; Button — Review correction `6752:30013`; Button — Cancel `6752:30016` (all replaced by instance, pass J) |
| `6752:30141` same, Validation (84460, -3400) | Pill — Support action `6752:30147`; Button — Back to user `6752:30150`; Banner — validation `6752:30154`; Callout — consequences `6752:30179`; Button — Review correction `6752:30184`; Button — Cancel `6752:30187` |

### 2g. Added by pass K3

| Host frame | Hidden archived node |
|---|---|
| `6747:29445` Profile — Own — Saved — Desktop (4920, 77200) | `6747:29556` "ARCHIVED — K2 profile column (superseded by K3 rebuild)": the 85-node single-column body that K2 built and K3 replaced with the three-column body. Kept hidden, not deleted, so the founder can compare or delete it. |

The Navbar instance inside the archived `1460:8940` reports 0 sub-layers while the frame is hidden, so a `findAll` count of it is 105 lower than before (2364 to 2259). Nothing was removed.

### 2h. Added by pass K4

| Host frame | Hidden archived node |
|---|---|
| `6747:28894` Profile — Other User — Posts — Desktop (6560, 77200; moved by K4) | `6747:29005` "ARCHIVED — K2 profile column (superseded by K4 rebuild)": the single-column body K2 built, replaced by the three-column body. Kept hidden, not deleted. |
| `6747:29094` Profile — Own — Posts — Desktop (1640, 77200) | `6747:29205` same name; same reason. |
| `6747:29291` Profile — Own — Media — Desktop (3280, 77200) | `6747:29402` same name; same reason. |

### 2i. Added by pass K5

| Host frame | Hidden archived node |
|---|---|
| `6747:29642` Profile — Own — Posts — Mobile | `6747:29666` "ARCHIVED — Stat — Posts (no posts count, Decision Log #410 item 5)" |
| `6747:29709` Profile — Own — Media — Mobile | `6747:29733` same name |
| `5778:8567` Community — Profile · Saved — Mobile | `5778:8591` same name |
| `6784:29476` Mobile Header — Logged Out — Closed | `6784:29477` "ARCHIVED — Navbar (instance: header 7 — mobile) (replaced by instance of header 7 — mobile — menu, K5)"; `6784:29489` "ARCHIVED — Menu button (replaced ...)" |
| `6785:29486` (header inside `6785:29485` Mobile — Logged Out — Navigation Drawer Open) | `6785:29487` and `6785:29488`, same two names as above |
| `6785:29485` Mobile — Logged Out — Navigation Drawer Open | `6785:29539` "ARCHIVED — Navigation Drawer — Logged Out — Mobile (detached ...) (replaced by instance of Navigation Drawer — Mobile — Logged Out, K5)" |

All eight are kept hidden, not deleted.

### 2j. Added by pass K6

| Host frame | Hidden archived node |
|---|---|
| `5114:6644` Content Column in `5108:6630` Guardian Consent — 5 Restricted Pending State | `5114:6704` "ARCHIVED — Resend Note (K6, #411 item 6: code renders no persistent resend note)" |
| `5114:6650` Card — Switched Off Until Approval in `5108:6630` | `5114:6677` "ARCHIVED — Note — SCOPE OPEN (K6, #411 item 6: answered, Grassroots limited, Sports Hub works)" |
| `5531:7473` Content Column in `5531:7461` Guardian Consent — 5 Restricted Pending State — Mobile | `5531:7533` same name as `5114:6704` |
| `5531:7479` Card — Switched Off Until Approval in `5531:7461` | `5531:7506` same name as `5114:6677` |

Decision Log #411 item 6 and build register B-198 say the SCOPE OPEN note is "deleted"; K6 hid and renamed all four nodes instead, because this file's standing rule is that nothing is deleted unless the brief names it. A page-wide scan of 894 nodes with prototype reactions found 0 inbound references to any of the four. They can be deleted later with no effect.

## 3. Things this index does not cover

- Nodes that were deleted (not archived): the four legacy Message frames (Decision Log #114, pass `design-cleanup-tokens-renames`), the ten hidden legacy layers in the Create Post desktop frames (pass G2), `1620:8975` and `6695:27342` (pass J). They are not on the canvas, so they have no row here.
- Hidden nodes that are not prefixed `ARCHIVED` (for example the hidden `header 7` variants, hidden pass E leftovers). A search by name will not find them. Pass K2 added more of these on purpose and did not rename them: in the six verify-email prompt frames (`6750:29378`, `6750:29429`, `6750:29480`, `6750:29531`, `6750:29582`, `6750:29633`) the hidden "Mark Stem" and "Mark Dot" of the cloned warning icon and the hidden "Note — OPEN DECISION"; in the two guardian on-hold frames the hidden "Action — Report incorrect details"; and in `6752:30141` five hidden "Error" rows. See `docs/figma-pass-k2-report.md` section 8.
- The `dump` page (`2155:1285`) and the cover page (`1860:2500`).

## 4. Findings while building the index (not fixed here)

1. Two Message archive names cite replacement frames (`2067:3006`, `2067:3176`) that no longer exist. The real replacements are listed in section 1c. **Fixed in pass K2:** the three affected names (windows 1, 2 and 4: `1761:2342`, `1761:2321`, `1762:2645`) now cite `5709:8354` and `5709:8419`.
2. The carousel components are still named "3 pages of 3 finalists" (`6697:26234`, `6697:27448`) although they hold 2 pages of 3 (pass J). **Fixed in pass K2:** both sets, and the two instances `6661:29097` / `6661:29294` inside archived frames, now say "2 pages of 3 finalists"; the three notes that quoted the stale name were updated.
3. Three Design Notes style captions say "Archived in Pass F2" / "ARCHIVED BY W0 PASS F1" inside live note frames (`6278:16416`, `6664:27285`, `6664:27302`); they are captions, not frames.
4. `5648:8093` is the only archived node that is visible on the canvas.
5. The four legacy profile frames `1455:4362`, `1455:6626`, `5702:8250`, `5778:8490` are NOT in this index because they were not archived (see `docs/figma-pass-k-report.md` section 6). **Fixed in pass K2:** replacements were built, the frames archived, and they are listed in section 1g.
