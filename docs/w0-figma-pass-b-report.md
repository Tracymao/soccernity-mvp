# W0 Figma pass B — report

Branch `figma/w0-pass-b-retouch`, 2026-10-15. Agent scope: `figma-design-system` (retouch of existing frames only; no new screens). Figma file "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Figma only: no application code, schema, legal copy, DPIA or Decision Log row changed.

Source rows: `docs/build-register.md` B-006, B-007, B-012, B-015, B-095 (design-system leg). Decisions applied: #58, #366, #367, #369, #371, #376, #378, #381, #392 (item 10), #393, `docs/contest-spec.md` §3, §4, §12.

## 1. Audit numbers

| Check | Result |
|---|---|
| Whole-canvas metadata (page `0:1`) before / after | 36,289 / 36,344 nodes (before equals pass A's after). **0 nodes missing**; 55 new nodes (3 hint clones, 16 admin action/callout nodes, 22 tag nodes, 1 Design Notes bullet, 13 notes). Both pulls were saved to disk (4.6 MB each) and diffed by node id. |
| Existing nodes changed | 93, all inside the 19 frames named below (Create Profile ×2, profile ×6, Two-Factor ×2, Report Detail, Appeal Review, six archived frames moved, Design Notes). No other frame changed (Moderation Queue `5794:8635` was inspected and left unchanged). |
| Deleted | **Nothing deleted.** Superseded content is hidden and renamed `ARCHIVED — …`. |
| Unbound fills / strokes on touched nodes | **0** across 79 audited nodes (every created node plus every edited text node). One pre-existing unbound white fill (`Rectangle 139` menu card, `1455:6614` / `1460:11192`, which I resized) was bound to `color/background/surface` (same #FFFFFF, no visual change). |
| Overlaps | **0** between new tags and sibling content, 0 for notes and the six archived frames against every top-level node, **except** the three B-007 desktop notes, which sit inside the bounding box of the existing section label text `1871:2755` "Community and Create post" (11097×2817). The three profile frames themselves lie inside that same box, so this is the pre-existing label bounding box, not visible content. |
| Frame heights (Admin minimum 1184) | Report Detail 1184, Appeal Review 1234, hub frames 1184 / 1213, Start a Cycle 1184 / 1496 / 1184, Cycle History 1184, Design Notes 1711 → 1767. None below 1184. |
| Variables | Light mode only. No new colour, no hex. New nodes are clones of bound nodes, or bind `brand/green-tint`, `color/text/primary`, `semantic/alert` (non-text bar only). |
| Screenshots | Every changed frame was rendered after its last edit and read (see §6). |

## 2. Per B-ID — node IDs before / after

### B-006 — Create Profile
| Frame | Before → after | Change |
|---|---|---|
| `1498:2303` desktop | 1440×1626 → 1440×1656 | `1557:2312` label "Date of Birth*" → "Date of Birth"; `1557:2314` placeholder → read-only value `04 / 09 / 2011` (same sample as Register); hint `6634:22212` added (clone of Register hint `6627:22258`). Lower fields moved down 30. `1565:2434` "Location" → "Country", `1565:2436` → "United Kingdom" (sample prefill). `1498:2514` "Preferred Club*" → "Preferred Club", `(Optional)` clone `6634:22213`, placeholder `1498:2516` → "Enter your preferred club", chevron `1498:2520` hidden and renamed `ARCHIVED —`. Username*, avatar, Bio (Optional) already present, unchanged. Left background `1498:2505` and `Right Side` `1498:2333` grown 30 to match. |
| `1629:2449` mobile | **430×1424 → 390×1501** | Horizontal padding 20 → 0, counter-axis sizing FIXED, `resize(390, …)`; Top Bar (390) is now full-bleed and the 350px fields sit at x = 20; height hugs content. Same field changes as desktop: DOB value `1629:2469` + hint `6634:22214`, `1629:2516` → "Country", `1629:2518` → "United Kingdom", `1629:2520` → "Preferred Club (Optional)", `1629:2522` placeholder, chevron `1629:2524` hidden; input `1629:2521` left-aligned with 20px padding. |

Notes: `6637:21602` (desktop), `6637:21603` (mobile).

### B-007 — other-user profile frames
| Frame | Change |
|---|---|
| `1455:4362` | `1455:6401` "Port Harcourt" → "Nigeria". Menu group `1455:6613`: "Share Profile Via" `1455:6616` and its icon `1455:6620` hidden, renamed `ARCHIVED —`; "Block …" row and icon pulled up 33; card `1455:6614` 109 → 76. Copy Profile Link and Block kept. |
| `1455:6626` | `1455:8663` and the nested sidebar card `1620:9086` → "Nigeria". No "…" menu on this frame. |
| `1460:8940` | `1498:2616` → "Nigeria"; menu `1460:11191`: `1460:11194` / `1460:11198` hidden, Block row up 33, card `1460:11192` 109 → 76. |
| `5702:8250`, `5778:8490`, `5778:8567` | `5702:8266`, `5778:8506`, `5778:8583` "Port Harcourt, Nigeria" → "Nigeria". No Share item on mobile. |

Notes: `6637:21604`–`6637:21609`.

### B-012 — Report Detail / Appeal Review
| Frame | Change |
|---|---|
| `5796:8635` Report Detail | Row `5796:8741` (855×40) gained navy buttons "Reporter acted in bad faith" `6635:22212` and "Legal hold" `6635:22214` (clones of `5796:8742`). New callout `6635:22216` (clone of `5796:8750`) with the bar bound to `semantic/alert` (non-text). |
| `5796:8753` Appeal Review | New row below the existing callout: label `6635:22219` "CASE-LEVEL ACTIONS", actions `6635:22220` (the two buttons), callout `6635:22225` (alert bar). Kept separate from "DECIDE THE APPEAL" so they are not read as appeal outcomes. |
| `5794:8635` Moderation Queue | Inspected, unchanged (no per-row actions; only "Review"). Note only. |

Notes: `6637:21610`–`6637:21612`. List screens (held investigations, flagged-image queue, username revoke) not built.

### B-015 — Two-Factor Auth
| Frame | Change |
|---|---|
| `2926:8294` desktop | SMS row `2926:8408` hidden, renamed `ARCHIVED — Text message row (SMS, #378)`; `2926:8526` "Authentication app" → "Authenticator app"; `2926:8528` description uses "authenticator app". Frame renamed "(SMS)" → "(Authenticator App)". No phone-number element existed. |
| `5696:8213` mobile | SMS row `5696:8226` and divider `5696:8233` hidden; `5696:8236` / `5696:8237` as above; renamed; 463 → 363 high. |

Notes: `6637:21613`, `6637:21614`.

### B-095 — admin Contest console (design-system leg)
Reference scan before archiving, whole page `0:1`: **133,158 nodes scanned, 646 with prototype reactions, 0 inbound reactions** to any of the six frames or their descendants, **0 instances** of components defined inside them (0 components inside), **0 of 12 flow starting points** inside them. All six were therefore moved, none held back.

| Frame | Was | Now |
|---|---|---|
| `6274:15676` Judge Week (Open Round) | (45783, −15835) | hidden, `ARCHIVED — …`, (69580, −13200) |
| `6275:15777` Judge Week (Already Judged) | (47403, −15835) | (71200, −13200) |
| `6275:15985` Judge Week (No Entries) | (49023, −15835) | (72820, −13200) |
| `6275:16182` Judge Week — Blocked | (50643, −15835) | (74440, −13200) |
| `6276:16080` Open the Final (Confirm) | (40923, −14335) | (76060, −13200) |
| `6276:16213` Crown Winners | (42555, −14095) | (77680, −13200) |

They continue the existing Contest archive strip (y −13200, pitch 1620, previous last frame ended at x 69400); each position was checked against all top-level nodes. Names end with "(superseded: contests are not admin-judged — Decision Log #381, docs/contest-spec.md §3)".

Tags "TO BE REDESIGNED (B-095, screen-builder)" (green-tint chip, `color/text/primary`, at 300,10 inside the frame; at 50,12 on Design Notes) added to `6271:15272` `6636:23258`, `6269:14868` `6636:23260`, `6266:14767` `6636:23262`, `6269:15107` `6636:23264`, `6270:15070` `6636:23266`, `6270:15346` `6636:23268`, `6272:15373` `6636:23270`, `6273:15474` `6636:23272`, `6273:15664` `6636:23274`, `6277:16282` `6636:23276`, `6278:16383` `6636:23278`. Design Notes bullet `6636:23280` records the archive and why; frame 1711 → 1767. The calendar component and all other components were not touched.

## 3. "[COPY PENDING LEGAL REVIEW]" tags

| Where | Node ids | Wording |
|---|---|---|
| Create Profile DOB hint (desktop / mobile) | `6634:22212` / `6634:22214` | "Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]" (same sentence as pass A) |
| Report Detail callout | `6635:22216` | "Reporter acted in bad faith holds the reporter’s account in full for 6 months. Legal hold holds both accounts in full until an admin lifts it. Both ask for confirmation first. [COPY PENDING LEGAL REVIEW]" |
| Appeal Review label and callout | `6635:22219`, `6635:22225` | "CASE-LEVEL ACTIONS [COPY PENDING LEGAL REVIEW]" and the same callout text |

Wording that is new on a minor-facing screen but small functional microcopy, listed in the Create Profile notes rather than tagged inline (an inline tag does not fit a 440px input): label "Country", sample value "United Kingdom" (a coded option), "Preferred Club (Optional)", placeholder "Enter your preferred club" (copied from this frame's own "Enter …" pattern). **Counsel/founder should confirm these or tell me to tag them inline.** Wording taken verbatim from a Decision Log row or shipped code and left untagged: "Authenticator app" (#378), button labels "Reporter acted in bad faith" and "Legal hold" (#376).

## 4. "SCOPE OPEN" notes (each is an on-canvas note, not a decision)

| Frame | Open point |
|---|---|
| Create Profile desktop / mobile (`6637:21602`, `6637:21603`) | Whether the user may edit the prefilled Country (#368 makes the IP value authoritative); whether the profile picture is required and what the user is told about the automatic image check (#371); whether Full Name (First/Last, already collected at Register) stays here (#369); username moderation text and the placeholder name for an incomplete profile (#369); the confirm-or-edit state for a flagged Bio or Preferred Club (#366/#367). |
| Profile `1455:4362` (`6637:21604`) | Owner vs viewer (audit Q4); Block confirmation not drawn. |
| Profile `1455:6626`, `1460:8940` (`6637:21605`, `6637:21606`) | Frames show "Edit Profile" (and in 8940 a Saved tab plus the viewer "…" menu); owner vs viewer undecided; nothing converted. |
| Profile mobile ×3 (`6637:21607`–`6637:21609`) | Frames carry Edit Profile and a Saved tab and no Follow / message / Copy link / Block; owner vs viewer undecided; nothing added. |
| Report Detail (`6637:21610`) | Confirmation step form, reason/notes field, the control that lifts a legal hold, and which report statuses allow each action. |
| Appeal Review (`6637:21611`) | Whether the two actions belong on Appeal Review and how they interact with an open appeal. |
| Moderation Queue (`6637:21612`) | Whether queue rows show a held / legal-hold marker. |
| Two-Factor Auth ×2 (`6637:21613`, `6637:21614`) | QR-code and enter-code steps, and any recovery / backup wording, not drawn (screen-builder). |

## 5. Decision Log candidates (none written)

1. Is Full Name (First / Last) kept on Create Profile, given it is collected at Register and #369 shows no real name to others?
2. Is the prefilled Create Profile Country editable?
3. Is the avatar required, and what is the user told about the automatic image check (#371 wording, counsel-reviewed)?
4. Are the other-user profile frames also the owner's own profile (audit Q4)? Until decided the mobile frames cannot gain Follow / message / Copy link / Block without becoming a viewer variant.
5. Block confirmation pattern for the profile "…" menu.
6. Admin confirm step for "Reporter acted in bad faith" and "Legal hold" (dialog vs inline), reason field, and where "lift hold" lives (#376 says "until an admin lifts it").
7. Should "Reporter acted in bad faith" / "Legal hold" also be available from Appeal Review?
8. Two-factor recovery (backup codes, lost device) wording and flow.
9. How a flagged free-text value (#366) is shown on Create Profile.

## 6. Self-review (screenshot by screenshot)

- Create Profile desktop: fields in order Picture, Full Name, Username*, Date of Birth (value + hint), Country, Bio (Optional), Preferred Club (Optional), button; no overlap, hint two lines sits 20px above Country. Right panel and background extend to the new height.
- Create Profile mobile: 390 wide, Top Bar full-bleed, 350px fields centred, all labels and the hint readable; the free-text placeholder was initially centred after hiding the chevron; fixed to left-aligned and confirmed by layout read-back (x 20), not re-rendered.
- Profile `1455:4362` (rendered at full size) and `5702:8250`: "Nigeria" beside the pin / under the bio; menu shows only Copy Profile Link and Block. `1455:6626`, `1460:8940`, `5778:8490`, `5778:8567` were checked by node diff and text read-back, not re-rendered individually.
- Report Detail and Appeal Review: Report Detail row has six navy buttons, Appeal Review has two extra navy buttons in a new row, red bar only on the new callouts, shell and heights intact.
- Two-Factor desktop and mobile: single "Authenticator app" row, no gap, mobile frame shortened.
- Hub frame `6269:15107` and Design Notes: tag chip sits above the page title with no overlap; Design Notes bullet readable. The other ten tagged frames were verified by overlap query, not individually rendered.
- Not re-rendered: the six archived frames (hidden).

## 7. Observed, not changed

- Create Profile mobile has 104px empty space above the Top Bar (frame `paddingTop` 104).
- Profile frame `1455:4362` right rail still shows legacy "Privacy Settings" and "© 2022" footer text (outside scope).
- Design Notes frame `6278:16383` sections 1–3 still describe the judged model (screen → endpoint tables for Judge Week, Open the Final, Crown Winners). Only a new bullet was added; rewriting them belongs to the screen-builder redesign.
- The admin shell shows a stray green band with "Search Soccernity" under the content area on Report Detail / Appeal Review (pre-existing shell debt).
- `get_metadata` on page `0:1` exceeds the tool's size limit and is returned as a saved file; diffs were run on those files.
