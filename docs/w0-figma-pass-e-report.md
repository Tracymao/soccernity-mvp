# W0 Figma pass E — report

Branch `figma/w0-pass-e-contest-states`, 2026-10-15. Agent scope: `figma-screen-builder` (contest states, B-096). Figma file "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Figma only: no application code, schema, legal copy, DPIA or Decision Log row changed.

Source: `docs/contest-spec.md` sections 3, 5–8, 10, 10b, 11, 12 and 14b; build register rows B-096, B-095, B-098, B-099; Decision Log #61, #70, #71, #381, #386, #387, #388, #393; `docs/sprint-2-create-post-contest-tab-states-report.md`; `docs/sprint-2-mobile-leaderboard-homepage-contest-audit-report.md`; `docs/w0-figma-pass-c-report.md`.

## 1. Audit numbers

| Check | Result |
|---|---|
| Whole-canvas metadata (page `0:1`, nodeId `0:1`) before / after | 39,855 → 42,500 nodes. **0 nodes missing.** 2,645 new nodes. 74 existing nodes changed (all listed by cause in section 4: renamed frames, replaced text, one banner and button group in the Already Voted desktop frame). Nothing deleted, nothing archived, nothing hidden among existing nodes. |
| New top-level nodes | **39**: 16 state frames, 4 components, 18 SCOPE OPEN note frames, 1 Design Notes frame. |
| Unbound fills / strokes on authored nodes | **0** (4 components 0 of 122 paints, 18 notes 0 of 77, Design Notes frame 0, edited controls 0 of 7, banners and closed messages inside the cloned frames 0). The 16 cloned state frames carry the same unbound-paint count as their donors (donor `5556:7632` 56, clones 56; `5524:7836` 8 / 8; `5561:7733` 25 / 25; `5541:7750` 17 / 17; legacy Create Post `2009:2913` 1,791 / 1,790; `2496:4462` 1,789 / 1,789): inherited legacy debt, not authored here and not force-bound. |
| Overlaps | **0** between the 39 new top-level nodes and every visible top-level node (699 on the live canvas, checked twice: on the fresh metadata pull and again right before finishing). |
| Light mode only | Yes. Variables used: `brand/navy`, `brand/green`, `brand/green-tint`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/icon/inactive`. No `semantic/alert`, no new variable, no new colour, no black. |
| Mobile width | 390 on every new mobile frame; the showcase component is 358 / 350 wide inside it. Pinned/sticky elements: none, so the 844 viewport rule did not apply. |
| Placement | New band below the whole canvas (every existing node ends at y 42,480): y 43,600 → 56,240. Components strip at x 5,200, y 43,600+. Admin frames not touched (this pass has no admin frame). |
| Existing frames still containing "Level" in a frame name | **None** after the pass (section 5). |

## 2. Per B-ID: node ids before / after

Only B-096 is the Figma deliverable; B-098 and B-099 name B-096 as their Figma leg and carry a status line.

### B-096 — new contest states

| State | Desktop | Mobile (390) | Cloned from (unchanged apart from section 4) |
|---|---|---|---|
| Weekly "Forfeited" slot (Week 2 forfeited: 3 winners, 3 Forfeited slots, 3 winners) | `6659:25987` | `6659:26981` | `5556:7632` / `5561:7733` |
| Week 4 "uploading" before the reveal (finalists listed, no ranking, no rank number) | `6659:26310` | `6659:27163` | `5556:7632` / `5561:7733` |
| "No winner this month" | `6659:26636` | `6659:27348` | `5524:7836` / `5541:7750` |
| Live ranking from the reveal (existing frame, renamed) | `5524:7512` | `5541:7527` | n/a |
| Finalist-only Create Post > Contest tab, upload open | `6660:28736` | `6660:35662` | `2009:2913` / `5818:8997` |
| Create Post > Contest tab, closed for non-finalists | `6660:31044` | `6660:35699` | same |
| Create Post > Contest tab, closed after the deadline | `6660:33353` | `6660:35737` | same |
| "Final week" showcase in the Community feed | `6661:26929` | `6661:29200` | `2496:4462` / `5818:9031` |
| "Final week" showcase on the Contest page | `6661:29122` | `6661:29321` | `2155:1062` / `5801:8635` |
| Showcase components | `6661:26780` (feed, 3), `6661:26837` (Contest page, 9) | `6661:26865` (feed, 3), `6661:26928` (Contest page, 9) | new |
| Retract-vote interaction | `5802:8978` Already Voted, `2094:994` Voting (edited in place) | `5815:8916`, `5802:8726` (edited in place) | n/a |
| Design Notes | `6664:27328` | | |

The three reference frames the register names: **`5818:8997`** is "Community — Create Post — Contest Mode — Mobile" (Contest tab active, caption field and Upload file); **`5982:10905`** is "Community — Create Post — Mobile — Active Contest" (the Create a Post | Contest tab row present); **`5982:10932`** is "Community — Create Post — Mobile — No Active Contest" (tab row removed). They were left untouched. `5818:8997` is the donor of the three mobile finalist states; desktop states were cloned from `2009:2913` because that frame already carries the composer with the Contest tab active.

What each new frame shows:

- **Forfeited**: weeks 1 and 3 show winners with placement points (+500 / +300 / +150, the section 9d defaults, admin-set per contest). Week 2's three rows read "Forfeited", "No placement points awarded", em dash for club and points. Chip "Week 2 · Forfeited". Summary "· 6 weekly winners · Week 2 forfeited".
- **Uploading**: all 9 finalists listed by weekly round with no rank number and no points ranking; banner "WEEK 4 FINAL · UPLOADING" with the days 22–24 window, the 23:59:59 deadline, "hidden from everyone but their owner until the reveal at 00:00 on day 25"; chip "Week 4 · Uploading".
- **No winner**: standings stay visible without medals or winner pills; banner "AUGUST · NO WINNER THIS MONTH".
- **Create Post, upload open**: banner "WEEK 4 FINAL · UPLOAD WINDOW OPEN", caption placeholder "Add a caption for your final entry…", Upload file kept.
- **Create Post, closed (not a finalist)**: banner "WEEK 4 FINAL · FINALISTS ONLY", composer replaced by "This portal is open to finalists only." (desktop) and a greyed POST (mobile). Entry counter badge hidden.
- **Create Post, closed (after the deadline)**: banner "WEEK 4 FINAL · UPLOAD WINDOW CLOSED" with the spec consequence sentence; composer replaced by "This portal is closed.".
- **Final week showcase**: module with title "Final week", the headline "Every finalist is shown to everyone equally." and the tagged explanatory sentence, finalist cards (thumbnail placeholder, name, club) in a **shuffled order that matches no leaderboard order**, no counts, no rank. Feed version shows 3 of 9 and a link to the Contest page; Contest page version shows all 9 and hides that link. On the Contest page, "Task for this week" becomes "Week 4 final" and the Join Contest button is hidden.
- **Retract vote**: "Retract vote" button next to "Voted" (desktop and mobile), banner sentence rewritten, and prototype links Vote → Already Voted and Retract vote → Voting.

### Handoffs (section 11): prototype reactions set (ON_CLICK → NAVIGATE), each read back

- Leaderboard → Contest Details: weekly fill 3 / 6 / 9 (`5556:7426`, `5556:7529`, `5556:7632`), vacant `5524:7188`, crowned `5524:7836`, and the three new desktop frames → `2155:1062`; mobile equivalents (`5541:7304`, `5561:7483`, `5561:7608`, `5561:7733`, `5541:7750`, three new) → `5801:8635`.
- Live ranking `5524:7512` / `5541:7527` → the final-week Contest pages `6661:29122` / `6661:29321`.
- Contest Details (week 3 live) → weekly fill with 6 winners: desktop link added to `2155:1062` (node `6663:27192`) → `5556:7529`; mobile `5801:8666` → `5561:7608`.
- Final-week pages → live ranking: `6661:29199` → `5524:7512`; `6661:29332` → `5541:7527`.
- Between Weeks: desktop results link `5802:9200` → `5556:7529`; mobile `5815:8957` and `5815:8959` → `5561:7608`.
- Voting `2130:3432` → Already Voted `5802:8978`; mobile Vote `5802:8761` → `5815:8916`; Retract vote `6663:27180` → `2094:994`; mobile `6663:27186` → `5802:8726`.
- **One existing reaction was wrong and was corrected**: `5802:9200` (Between Weeks desktop "View this week's results ›") pointed to `2009:2913`, the Create Post For Contest frame (inherited from the Join Contest button it was cloned from). Now `5556:7529`.
- Existing reactions on other leaderboard links were not overwritten; none was found to skip except the one above.

### B-098 / B-099 (status lines only)

B-098's retract interaction and B-099's Forfeited / uploading / live-ranking / No winner states are the frames above. Code legs untouched.

## 3. "[COPY PENDING LEGAL REVIEW]" tags

One tagged sentence, present in the four showcase components and their four instances. It describes how viewer impressions are balanced (new processing of viewers' data; open item 8 in `docs/contest-spec.md` section 14).

| Where | Text node ids | Wording |
|---|---|---|
| Showcase components | `6661:26761`, `6661:26787`, `6661:26844`, `6661:26872` | "Finalists appear in a different order for each viewer. The order is never based on likes, comments, ranking, follower count or when a video was uploaded. [COPY PENDING LEGAL REVIEW]" |
| Instances | `I6661:29097;6661:26761`, `I6661:29143;6661:26787`, `I6661:29294;6661:26844`, `I6661:29354;6661:26872` | same, inherited from the component |
| SCOPE OPEN note that quotes the tag | `6664:27282` | documentation, not product copy |

Headline "Every finalist is shown to everyone equally." is the spec's own phrase (section 10b) and is not tagged.

New wording written for this pass that is **not** tagged (composed from spec sections; contest screens, not guardian-specific; listed so it can be reviewed):

- Leaderboard: the Forfeited banner sentence ("All weekly rounds have closed. A week with fewer than 3 entries is forfeited: its 3 slots show "Forfeited" and no placement points are awarded."), "No placement points awarded", footers "6 finalists this month (Week 2 forfeited). The Week 4 final starts on day 22." and "9 finalists. Ranking is shown live from the reveal at 00:00 on day 25.", uploading banner and subtitle, "Uploads close 23:59:59 on day 24", "Reveal at 00:00 on day 25", No winner banner "No finalist reached the minimum tally. No top 3 is crowned and no placement points are awarded for the Week 4 final.", "9 finalists · final result", "Placement points" column header.
- Create Post: the three banner bodies (desktop and mobile), "Add a caption for your final entry…", "This portal is open to finalists only.", "This portal is closed.".
- Showcase: "View on the Contest page ›", "Showing 3 of 9 finalists", the Contest page "Week 4 final" sentence ("Finalists uploaded a new video on days 22–24. Videos were revealed at 00:00 on day 25 and are ranked by likes and comments until the end of the month.").
- Retract: "Retract vote" and the banner sentence "You've already voted this week. You can retract your vote until voting closes at 23:59:59 on day 7."

## 4. Existing nodes changed (text only, one group, renames)

**Renames**: `5524:7512` "Leaderboard — Contest Tab · 2 Live — Level 1 Final (Week 4)" → "Leaderboard — Contest Tab — Week 4 Final — Live Ranking (from the reveal)"; `5541:7527` same with " — Mobile"; `5527:7245` and `5541:7992` "Level 1 Final — Live Banner" → "Week 4 Final — Live Banner".

**Text replaced on visible frames (55 nodes, 2 of them inside the new final-week frames)**: the retired numbered-level wording → "Week 4 final / WEEK 4 FINAL / Week 4 field"; stale calendar wording → spec calendar ("ends at month end", "starts on day 22", "start on day 1", "Voting closes at 23:59:59 on day 7", "(fewer if a week is forfeited)", "the count is lower for any forfeited week", "The next weekly challenge opens the next day.", Already Voted banner). Node ids (text @ top-level frame):

`2220:1200@2155:1062`, `2220:1204@2155:1062`, `5176:6654@5171:6633`, `5177:6677@5171:6633`, `5525:7249@5524:7188`, `5524:7518`, `5524:7521`, `5527:7248`, `5527:7249`, `5524:7729` (all `@5524:7512`), `5524:7842`, `5524:7845`, `5528:7249`, `5524:8053`, `5528:7250` (`@5524:7836`), `5528:7266@5528:7260`, `5534:7274`, `5534:7268` (`@5534:7264`), `5541:7977@5541:7304`, `5541:7533`, `5541:7536`, `5541:7995`, `5541:7996`, `5541:7710` (`@5541:7527`), `5541:7756`, `5541:7759`, `5541:8011`, `5541:7933`, `5541:8012` (`@5541:7750`), `5543:7397@5543:7383`, `5545:7400@5545:7394`, `5557:7486@5556:7426`, `5558:7486@5556:7529`, `5556:7640`, `5558:7557`, `5558:7621` (`@5556:7632`), `5561:7588@5561:7483`, `5561:7713@5561:7608`, `5561:7741`, `5561:7838`, `5561:7854` (`@5561:7733`), `5801:8661`, `5801:8663` (`@5801:8635`), `5802:9182@5802:8978`, `5802:9196`, `5802:9199` (`@5802:9183`), `5815:9003@5815:8916`, `5815:8954`, `5815:8956` (`@5815:8948`), `6241:14670`, `6241:14673@6241:14657`, `6241:14683`, `6241:14685@6241:14677`; and, inside the new frames, `6661:29135@6661:29122` and `6661:29327@6661:29321`.

Left as found: hidden archived frames (`6276:16202` "Open the Level 1 Final?" inside archived `6276:16080`; hidden Competition frames' "Sunday" / "Monday" strings), and every "Sunday" that is sample content ("Sunday league", Sunday bookings).

**Geometry changes that follow from the text edits** (no node was moved on purpose): the 3- and 6-winner weekly fill frames shrank 17 px because the banner sentence now fits one line (`5556:7426`, `5556:7529` and their children).

**Already Voted desktop `5802:8978`** (legacy absolute layout): added "Retract vote" button group `6663:27179`; the vote row group `5802:8987` recentred (x 229.8 → 160.8); banner `5802:9181` widened 199 → 640 so the sentence shows in one line; **a pre-existing defect fixed**: the "Voted" label `5802:8990` was navy 70% on a navy button (invisible, with a stray wrapped "d"); now `color/text/on-navy`, unwrapped. Mobile `5815:8916` got button `6663:27186` and the banner sentence.

## 5. Frames whose name still contains "Level"

| Node | Name | Related to the contest? |
|---|---|---|
| `6635:22216` | "Callout — Case-level actions (#376)" | No. Moderation case-level actions. |
| `6635:22220` | "Actions — Case-level (#376)" | No. |
| `6635:22225` | "Callout — Case-level actions (#376)" | No. |

No contest frame name contains "Level 1" or "Level 2" any more. One text node still reads "Open the Level 1 Final?" inside the hidden archived frame `6276:16080` (not a name; left because nothing existing is edited inside archives).

## 6. "SCOPE OPEN" notes (each an on-canvas note frame; none is a decision)

| Note | Frame it sits under | Open point |
|---|---|---|
| `6664:27179` | Forfeited desktop | Whether a reason is shown beside "Forfeited"; sentence wording composed; where a forfeit is announced on the Contest page. |
| `6664:27188` | Uploading desktop | Whether an upload status per finalist is shown before the reveal (not drawn so nothing leaks); order of finalists (none specified); placement points are sample defaults. |
| `6664:27197` | No winner desktop | How the minimum tally x is shown; whether below-tally standings stay listed. |
| `6664:27206`, `6664:27213`, `6664:27220` | the three mobile leaderboard states | "Same open points as the desktop frame". |
| `6664:27227` | Create Post upload open | Caption / file size / format rules; entry counter badge for the final; banner placed above the card because the legacy frame has no room inside it. |
| `6664:27236` | Closed (not a finalist) | Tab shown closed (this frame) or hidden for non-finalists during days 22–24; existing hidden pattern is `6171:16994`. |
| `6664:27244` | Closed (after the deadline) | Whether a finalist who missed the deadline is told the consequence; tab state from day 25 to month end. |
| `6664:27252`, `6664:27259`, `6664:27266` | the three mobile Create Post states | "Same open points as the desktop frame". |
| `6664:27273` | Community feed final week | Module position (pinned above the first post as drawn); what a finalist card opens; module absent before the reveal (not drawn); transparency wording is new processing of viewers' data; impression counts never shown to users. |
| `6664:27284` | Contest page final week | "Week 4 final" sentence composed; Join Contest hidden; whether a finalist-only action replaces it; "View leaderboard" link added on desktop. |
| `6664:27294`, `6664:27301` | the two mobile showcase frames | "Same open points as the desktop frame". |
| `6664:27308` | next to Design Notes | Retract: confirmation not specified; "Change vote" as a separate control not drawn; restricted-account Voting state not drawn; legacy desktop layout. |
| `6664:27319` | next to Design Notes | Between Weeks under the fixed calendar may last only moments; which week it stands for; link retargeted. |

## 7. Decision Log candidates (none written)

1. **Between Weeks state under the fixed calendar** (spec section 8): votes lock at 23:59:59 on day 7 and the next week opens on day 8 at 00:00, so the state may not exist or last only moments. Keep, merge into Details, or drop.
2. **Non-finalist Contest tab during the upload window**: shown closed (drawn) or hidden (existing No Active Contest pattern). Spec section 10 says only finalists "get access".
3. **Upload status visibility before the reveal**: whether other users may see that a finalist has or has not uploaded, given videos are hidden until 00:00 on day 25.
4. **Minimum tally display**: whether x is shown to users on the No winner state or only to admins.
5. **Retract vote**: confirmation yes/no; "Change vote" as a distinct control; how a retracted vote returns the entrant's tally.
6. **Voting page state for a restricted account** (cannot vote, section 8): not drawn, no frame exists.
7. **Final week showcase**: card destination (video, profile or Entries), whether it appears on the Contest page before the reveal, mobile placement in the feed.
8. **Counsel review of the transparency sentence** and of impression tracking (spec section 14 open item 8; DPIA not updated).
9. **"How Contest works" body** on the Contest Details frames still describes weekly community votes producing "a top 3 — nine weekly winners" and "tracked live on the Leaderboard's Contest tab"; only retired terms and calendar words were corrected. Rewrite belongs to the Contest page content owner (B-097/B-098).
10. **Forfeited announcement on the Contest page** (Details / Between Weeks), not specified.

## 8. Self-review, screenshot by screenshot

Every frame was rendered after its last edit and read. Findings and fixes:

- **Forfeited desktop `6659:25987`**: read clean (three-row groups, em dashes, +500/+300/+150, chip). No change.
- **Uploading desktop `6659:26310`**: read clean; fourth chip present. No change.
- **No winner desktop `6659:26636`**: rank numerals for rows 1–3 were missing because the donor hides them behind the medal. **Fixed** (numerals made visible, medals and winner pills hidden).
- **Forfeited / Uploading mobile**: the footer sentence ran past the card edge. **Fixed** (wrapping text, hug height). **No winner mobile**: rows read clean.
- **Create Post desktop (3)**: the closed-state message landed at the top-left of the frame (position maths against the wrong parent). **Fixed** (re-placed from absolute bounds, verified dx 78 / dy 150 inside the card). Banner overlaps the faint page behind the scrim; accepted, noted.
- **Create Post mobile (3)**: banner label and body were centred; **fixed** to left aligned. Closed states keep the author row; accepted.
- **Showcase (4)**: read clean. On the Contest page desktop there is a large gap between "Week 4 final" and the module, inherited from the legacy task block's fixed height; accepted, not changed.
- **Already Voted desktop**: three defects found and fixed (displaced button, wrapped label, truncated banner), plus the invisible "Voted" label described above. Mobile read clean.
- **Live ranking, 6-winner fill, mobile live, Vacant** (after text replacement): re-read after a second pass found the uppercase "LEVEL 1 FINAL · LIVE" banner labels that the first, case-sensitive scan had missed (3 nodes); fixed and re-scanned case-insensitively: only the hidden archived text remains.
- **Not verified**: prototype playback (links were read back, not played); a screenshot of the hidden Between Weeks frames after the link change (only a reaction edit, no visual change).

## 9. Requests for figma-design-system (nothing built here)

- The finalist card, the "Final week" module, the banner and the note frame exist only as local components or clones; a shared Banner and Note component would remove the clone-from-leaderboard pattern used here.
- The legacy desktop Create Post and Already Voted frames are absolute-layout compositions with large unbound legacy paint counts (1,791 / 1,789 unbound paints inherited); a rebuild on the Admin-style component set is advisable before code conversion.
