# Home hero live-scores card (Figma only)

Branch `design/home-hero-live-card`, from `origin/main` f690888. Figma and docs only. Founder decisions 2026-11-25. Sample data throughout; Soccernity Theme variables only, no raw hex, no new colour.

## Frames (page 0:1)

In place (Home frame 5204:6728 and its mobile twin 5543:7407):
- HC-1 desktop card `5206:6805` (440 wide) in hero `5205:6804`; HC-1 mobile card `5543:7427` (350) in hero `5543:7409`. Header "Today’s matches" with "1 live now" pill, league tabs (Premier League active, Champions League, La Liga, More), three match rows (Liverpool 2–1 Chelsea live 68'; Arsenal 3–0 Brighton FT; Man City 1–1 Newcastle FT), footer caption and "View all scores →".
- FS-1 desktop `5208:6804` and FS-2 mobile `5543:7457`: four scheduled cards, Grassroots removed (Arsenal v Everton 17:30, Inter v Porto 20:00, Sevilla v Valencia 20:00, Tottenham v Aston Villa 19:45), grey kickoff pills, scores "–".

New top-level frames (band y 355000): HC-2 `7173:145` desktop no live; HC-3 `7173:217` desktop one league; HC-4 `7173:290` desktop loading; HC-5 `7173:386` desktop no card; HC-6 `7173:458` mobile no live; HC-7 `7173:530` mobile loading; HC-8 `7173:626` mobile no card.
Band y 356300: FS-3 `7174:82` desktop and FS-4 `7174:163` mobile latest-results fallback (eyebrow "LATEST RESULTS", title "Latest results", four finished cards, FT pills, link "View all fixtures →"); Notes `7174:164`.

## Links (4, read back)
"More" desktop `7172:15` and "View all scores →" desktop `7172:53` go to Sports Hub `205:2`; "More" mobile `7172:67` and "View all scores →" mobile `7172:105` go to `5647:8023`.

## Standing check (Decision Log #404 item 14)
Top-level nodes 1,990 to 2,000 (10 new). Hash of the 1,990 original ids unchanged (djb2, baseline 1144955311). 0 overlaps. 0 unbound solid fills on the new frames and edited cards (only the inherited Admin Shell `Rectangle 223` exists elsewhere). Text under 11px: found 16 pill texts at 10px in FS-1 to FS-4, raised to 11px; none left; pills re-checked, no text wider or taller than its pill. Contrast computed from variable values (my own approximation, not a tool): minimum about 5.0:1 on HC-1 and FS-3/FS-4, about 4.8:1 on FS-1/FS-2.

## Defaults, veto-able
Fixtures section keeps its heading "TODAY'S FIXTURES / Matches happening right now"; kickoff pills are grey; card footers read "Today" (scheduled) and "Full time" (results); sample teams and times are illustrative; the loading frames use skeleton bars on the same card shell.

## Not verified / open
`get_screenshot` returns only a URL in this session, so no frame was inspected by eye; checks are by node data. Stale: Annotation Zone note `5214:6828` (zone `5214:6805`) still says fixtures show grassroots clubs; FS-1's layer is still named "Today's Fixtures — Grassroots". Neither edited. The code (`apps/web` HomePage) is not changed here; wiring to the live API is a separate PR.
