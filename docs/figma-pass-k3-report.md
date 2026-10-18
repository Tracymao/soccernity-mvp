# Figma pass K3 — own Saved desktop frame: diff, rebuild, link scan, archive

Branch `figma/pass-k3-own-saved-desktop`, from `origin/main` `b81f810` (after A5 and #427). Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`; `docs/build-register.md` is not edited (status line in section 8). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.

**Result.** `6747:29445` (Profile — Own — Saved — Desktop) is rebuilt to match the Saved tab of the legacy frame `1460:8940` item by item, except the differences listed as intentional in section 2 (each tied to a Decision Log row or a standing rule). `1460:8940` is archived (hidden, renamed, not deleted). K2's report was not relied on for this frame: K2 only checked counts and bounds, and its frame was in fact a single-column simplification of the old one.

## 1. Diff before the fix (old `1460:8940` vs K2's `6747:29445`)

Method: screenshot of both, then full node trees (old 2,364 nodes / 137 texts / 2 hidden; K2's frame 192 nodes / 31 texts). Old frame facts: 1440 x 2709, white fill, absolute layout, no annotation or note nodes, 4 prototype reactions, 1 `Web app Navbar` instance. Everything below was missing, extra, changed or mis-sized in K2's frame.

**Frame level**
1. Layout: K2 had Navbar + one 796px centred column. Old has three columns: left rail (x 35, 270 wide), main column (x 321, 796 wide), right rail (x 1132, 270 wide). MISSING both rails.
2. Height: K2 919 vs old 2709 (K2 held two posts, old holds four post blocks and a comment thread).
3. Navbar: old is an instance named "Web app Navbar - Desktop and Mobile" (`2841:5633`); K2 an instance of `header 4` (`2838:3502`). Same component set, same nine icons, same avatar reaction (to the account dropdown `2841:5361`). Not a difference in output.

**Left rail (all MISSING in K2)**
4. "Trending News" card (270 x 331, radius 12): title (12 Medium), refresh icon (`ci:refresh`, 15% navy), divider under title, three news rows each with a photo thumbnail (47 x 42, rounded, Sky Sports image), headline "Kane joins 250 club after heading Spurs past Wolves" (10 SemiBold), excerpt "Harry Kane scored his 250th goal for Totten / ham as Antonio Conte's.........." (8 Regular, hard line break kept as in the old frame), clock icon (`bx:time`) and date "08/08/2022" (8 Medium), two row dividers.
5. "Suggested" card (270 x 255): title, refresh icon, divider, three people rows (photo avatar 39, name 12 SemiBold, handle 10 SemiBold 70%, outlined "Follow" pill 51 x 21 radius 13): Emeka John @mekusa, Abdul Yusuf @naijamessi, Chukwu James @nicekidzz; two row dividers; "See more".

**Right rail (all MISSING in K2)**
6. "Trends for you" card (270 x 418): title, refresh icon, divider, seven rows (Ronaldo 2500 Posts, Manchester United 2325 Posts, Alex Ferguson 1856 Posts, #ChelseaVsArsenal 1213 Posts, Emirates Stadium 1104 Posts, #NPFL 998 Posts, #Europa 898 Posts), each with a three-dots icon (`bi:three-dots`); six row dividers; "See more".
7. "Fixtures" card (270 x 418): title, refresh icon, divider, eight rows "Chelsea [crest] score-or-time [crest] Liverpool": rows 1, 4, 5, 6, 7, 8 show "3 · 1" with a red live dot, rows 2 and 3 show "16:00"; row spacing 23 px for rows 1 to 3 and 25 px after (kept).
8. Legal footer: "Terms of Service", "Privacy Policy", "Privacy Settings", "Contact Us", "© 2022 Soccernity", with bullets; three of the links carry prototype reactions (Terms of Service to `6114:14222`, Contact Us to `6113:14053`, Privacy Policy to `6114:14471`).

**Profile header card (K2 had a different, simpler one)**
9. Cover: old is a stadium photo (796 x 192, radius 12); K2 a flat green-tint block. CHANGED.
10. Avatar: old is a photo (158 circle, 3px white ring, overlapping the cover at x 28, y 110); K2 a 120px "AC" initials disc. CHANGED / mis-sized.
11. Edit Profile: old is a filled navy pill 144 x 38 (radius 23, white 14 Medium text); K2 an outlined 101 x 33 button (radius 8). CHANGED.
12. Name: old "Adeniyi Christiana" 20 Medium; K2 19 Bold. Handle: old "@nelson_iheagwam" 14 Regular; K2 "@christine001" 13. Bio: old 14 Medium; K2 13 Regular. CHANGED (text and size).
13. Club badge beside the name (Chelsea crest in a 33px frame): MISSING in K2.
14. Country: old shows a pin icon then "Nigeria" to the right of the badge on the name line; K2 put "Nigeria" as a separate line under the bio without the icon. CHANGED / pin icon MISSING.
15. Stats: old "5,500 Followers · 5,500 Following" with a dot between, 14 Medium, no posts count; K2 "5,500 Followers  250 Following  124 Posts". CHANGED (numbers, separator) and EXTRA ("124 Posts").
16. Profile menu card (240 x 76, white, drop shadow, open over the cover): "Copy Profile Link" with link icon, "Block nelson_iheagwam" with a red block icon, hidden "Share Profile Via". MISSING in K2.
17. Tabs: old is a white strip 315 x 38 (radius 8) with "Posts", "Media" faint (30%) and "Saved" full, small 16px dashes between tabs, no underline, tab text colour `#034694`; K2 used full-width tabs with a green underline under Saved. CHANGED, and an EXTRA underline.

**Posts and comments (K2 had two plain bordered cards, with different text)**
18. First saved post is a block with: photo avatar, "Emeka John @mekusa · 2m", the lorem post text (12 SemiBold), engagement row (comment 25, like 124, repost 345, save icon), a three-dots menu, then a "Write a comment..." row (avatar, divider, green-grey pill radius 20) and a thread of two comments (name "Emeka Thomas" 8 ExtraBold, grey bubble radius 12, reply and like icons with 124) each with two replies (indented, like icon and 124). ALL MISSING in K2 (K2: "Match day. Travelling with the team to Aba this morning — first away fixture of the season." in two bordered cards, initials avatars, handle `@christine001 · 2m`, no menu dots).
19. Post 2 "Eleanor Pena" with photo avatar, post text and a 628 x 333 stadium photo. MISSING.
20. Post 3 "Emeka John" text-only post (172 high). MISSING.
21. Post 4 "Emeka John" with a 628 x 333 video still (scrim gradient, 63px white play icon). MISSING.
22. Engagement icons: K2's were bound clones but sat in different cards; old icon colours (comment and like at 15% navy, repost and save at 100%) now matched.
23. Card styling: old posts are white blocks with no border, K2 added a 1px border. EXTRA.

**Reactions and notes**
24. Old reactions: 4 (three footer links, one navbar avatar). K2 had only the navbar avatar's. MISSING 3.
25. Notes and annotations: none exist in the old frame; none added.

## 2. Differences kept on purpose (follow a decision, not decided silently)

| # | Old frame | New frame | Why |
|---|---|---|---|
| a | Menu has "Block nelson_iheagwam" with a red block icon | Row removed; menu keeps only "Copy Profile Link" | Decision Log #396 C1: the Block action lives on the OTHER-user variant; this frame is named "Own profile variant (#396 C1)". The old frame's own name contradicts its own menu. |
| b | Hidden "Share Profile Via" | Not carried | #371: there is no Share action (already hidden and ARCHIVED-prefixed in the old frame). |
| c | Menu shadow `#454545` 17% blur 48 | Effect style `elevation/menu` (`color/shadow/elevated`) | DL #118; no unbound shadow colour. |
| d | Chelsea crest next to the name, and Chelsea / Liverpool crest art in Fixtures (unbound third-party colours) | Typographic monogram discs (CFC, LFC) on `brand/green-tint` | DL #85, #97 and #403 item 13 (typographic marks accepted; fixture crest licensing stays open). Crest art cannot be bound to the two brand colours. |
| e | Footer lists "Privacy Settings" | Removed; row reads "Terms of Service · Privacy Policy · Contact Us", second line "© 2026 Soccernity" | DL #222 Part 4 (founder: remove, do not relink) and #207 (stale 2022). The three links keep their reactions. |
| f | Tab text colour `#034694` (off-palette club blue); inactive tabs at 30% | `color/text/primary` (navy); inactive tabs at node opacity 30% | Non-negotiable #3 (no new colour). Node opacity gives exactly 30% because no 30% token exists. |
| g | Comment bubbles, comment pill: `#d9d9d9` at 40% | `brand/green-tint` (12%) | Same rebind precedent as PR #128 and #174 for loose `#d9d9d9` plates. Visibly slightly green. |
| h | Photo avatars stretched (39 x 36 and 35 x 32.3) | Circles 39 x 39 and 35 x 35 | Old frame defect (non-circular ellipses). |
| i | Red live dot (`#da0000`), red block icon (`#ed1c24`) | Live dot bound to `semantic/alert`; block icon not carried (a) | DL #97/#99. |
| j | Video scrim: near-black red gradient 20% to 0 | Navy gradient: first stop bound to `color/icon/inactive` (15% navy), last stop transparent | No black allowed; a gradient stop bound to an opaque token forces full opacity (tried first: it hid the photo, fixed). The last stop is a transparent navy and is the one non-variable paint (invisible). |
| k | Icons at 15% navy (comment, like, reply, refresh, pin) | Same strengths, bound to `color/icon/inactive` | Faithful; the faintness is the old design. |
| l | Old text boxes with fixed sizes | Auto-layout hug or fixed where the old box was fixed | Structure requirement of the brief. |
| m | Frame height 2709 | 2710 | 1px from auto-layout rounding. |

Old-frame oddities reproduced verbatim (not fixed): the hard line break "Totten / ham" in the news excerpt; reply text boxes of fixed height 43 ending at "himenaeos"; handle `@nelson_iheagwam` with display name "Adeniyi Christiana". Old row spacing quirks (23 px then 25 px between fixtures) kept.

## 3. What changed in `6747:29445`

- K2's body column (`6747:29556`, 85 nodes) is HIDDEN and renamed "ARCHIVED — K2 profile column (superseded by K3 rebuild)" inside the frame. Not deleted ("nothing deleted from the canvas"); delete it if you do not want it.
- New `Body` row (padding 35 / 24 / 37, gap 16) holding `Left rail` `6765:29346`, `Main column` `6765:29347`, `Right rail` `6765:29348`, all auto-layout. Navbar instance `6747:29446` and the frame itself keep their ids.
- Main column: Header card `6765:29349` (cover, absolute avatar and menu, Info block), Tabs wrapper, saved-post block with comments `6766:29345`, post cards `6766:29462`, `6766:29498`, `6766:29539`.
- Left rail: `6767:29345` (Trending News), `6767:29396` (Suggested). Right rail: `6768:29345` (Trends for you), `6768:29416` (Fixtures), `6768:29538` (legal footer, with three reactions copied from the old links).
- Photos and the thumbnail and avatar images are clones of the old image nodes (image fills; the white and `#d9d9d9` plates under them were dropped). Icons are clones of the old icon frames re-bound to tokens. No new component, no new colour.
- Fine-tuning after the first build: post meta spacing (handle and "2m" positions), Trending News row height, Suggested row alignment, video scrim.

## 4. Verification (after)

Screenshots: old frame before (`1460:8940`, 1440 x 2709) and new frame before (K2, 1440 x 919) were taken first; the rebuilt frame (1440 x 2710) was taken after and compared by eye section by section (rails, header, tabs, thread, four posts, footer). Not visually compared in a real browser (none available).

Text comparison, programmatic (old visible non-instance texts vs new, matched by characters then nearest position): 131 matched; offsets 0 px: 10, 1 px: 83, 2 px: 34, 3 px: 3, over 3 px: 1 ("Contact Us", moved by the intentional footer re-flow, item e). Not matched on purpose: "Block nelson_iheagwam" (a), "Privacy Settings" and "© 2022 Soccernity" (e); extra in the new frame: monogram letters (CFC, LFC) and "© 2026 Soccernity".

Paints on the new frame (visible nodes): 369 solid paints, **0 unbound, 0 black**; 25 image fills (photos and avatars); 1 gradient (first stop bound, last stop transparent); fonts 150 Montserrat text nodes plus 1 inside the Navbar instance (Inter, existing). Overlaps with every visible top-level node: **0**.

Standing audit (page `0:1`):

| | before | after |
|---|---|---|
| top-level nodes | 881 | 881 |
| top-level id hash (djb2 over comma-joined ids) | 2410092652 | 2410092652 |
| `findAll` `1460:8940` | 2364 | 2259 |
| `findAll` `6747:29445` | 192 | 766 |
| `findAll` Navbar instance `6747:29446` | 105 | 105 |
| `findAll` K2 column `6747:29556` | 85 | 85 (hidden) |
| `findAll` whole page | 140979 | 141448 |
| ARCHIVED nodes | 414 = 61 + 353 | 416 = 62 + 354 |

The drop of 105 in `1460:8940` is the Navbar instance inside a hidden frame no longer reporting its sub-layers (same effect as K2 recorded); it is not a loss. Page total: +574 nodes in the rebuilt frame, minus 105. The archived total is 416 (not 415): +1 top-level (`1460:8940`) and +1 nested (the hidden K2 column).

## 5. Link scan (step 4)

Scanned every node on page `0:1` that has prototype reactions: **880** nodes (K2 recorded 873; the extra are the 3 footer links and a few nodes added by other passes since). Reactions whose destination is `1460:8940` or any of its 2,364 descendants: **0 found, 0 re-pointed**. A second scan immediately before archiving (880 nodes) again found **0**; flow starting points inside it: 0. The reverse direction (old frame's own four outbound reactions) was replicated: three footer links on the new frame (read back: `6114:14222`, `6113:14053`, `6114:14471`), the avatar to account dropdown `2841:5361` is on the Navbar instance already.

## 6. Archive (step 5)

All of steps 1 to 4 closed, then `1460:8940` hidden and renamed "ARCHIVED — Profile — Own — Saved — Desktop (superseded by 6747:29445)". `docs/figma-archive-index.md` updated (section 1g fifth row, section 2g, header counts).

## 7. Open, and findings not fixed

OPEN (needs you):
1. Whether an own-profile variant should show a "Copy Profile Link" menu at all. The old frame did (with Block, which #396 C1 removes); kept as a one-row menu, statically open over the cover as in the old design.
2. Crest licensing for the represented-club mark and the Fixtures rows (#85, #97, #403 item 13 stays open): monograms stand in.
3. The hidden K2 column `6747:29556` is kept inside the frame; delete or keep.

Seen, not fixed (out of scope):
- K2's other replacements (Own Posts `6747:29094`, Own Media `6747:29291`, other-user `6747:28894`, own mobile frames) very likely carry the same simplifications as the K2 Saved frame did (initials avatars, flat cover, outlined Edit Profile, bordered cards, `@christine001`, "250 Following", "124 Posts", underline tabs, no side rails). They now disagree with this frame's sample values and styling. They were not diffed in this pass; the same diff-first approach would be needed before their legacy twins count as superseded. `1455:4362` and `1455:6626` are already archived on K2's say-so.
- The old frame's own name says "Own profile variant" while its menu showed Block (item 2a).
- Old counts vs K2: the old frame shows no posts count; K2's "124 Posts" came from the pass H frames.
- The mobile Saved frame `5778:8567` and the legacy-frame set of the mobile profile were not touched.

## 8. Register status line for B-138 (for you to route; build-register.md not edited)

`Figma pass K3 2026-10-18 (figma-pass-k3-report.md): own Saved desktop frame 6747:29445 rebuilt to match 1460:8940 (side rails, photo cover and avatar, Edit Profile pill, club mark, country line, tabs, comment thread, four posts, legal footer with link reactions); intentional differences listed in the report section 2 (Block row removed #396 C1, typographic crests #85/#97, Privacy Settings link removed #222, 2026 year #207, palette-only colours); 0 inbound links found, 0 re-pointed; 1460:8940 archived, archive index 416 = 62 + 354; the other K2 replacements were not re-diffed (report section 7).`
