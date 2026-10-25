# Figma pass L - Edit Profile username and free-text club, Create Profile samples, small checks

Figma and docs only. No application code, schema, legal copy, DPIA or `.docx`. Nothing archived or deleted (two chevrons were hidden, not removed). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Before and after screenshots of every changed frame are in `docs/figma-pass-l-screens/`.

## What changed

| Item | Frame(s) | Change |
|---|---|---|
| (a) Preferred Club free text | Edit Profile `1466:15934`, mobile `5702:8317` | Select chevron hidden (`1498:2524` desktop, `5702:8350` mobile, renamed "hidden (free-text field)"). The value "Chelsea" stays as typed text. Country keeps its select chevron. |
| (b) Username field, in place | `1466:15934`, `5702:8317` | New field "Username" after Full Name, value `nelson_iheagwam`, hint "Shown as @nelson_iheagwam. 3-30 letters, numbers or underscores. You can change it once every 30 days (one free correction)." Desktop is absolute layout: 16 nodes below Full Name moved down 140 px and the modal grew 1195 to 1335 (new nodes `6806:29318` to `6806:29321`). Mobile is auto layout, so the frame grew 737 to 871 on its own (new field `6806:29312`). |
| (b) Username field, standalone | New `6807:29312` (desktop, 560x186), `6807:29329` (mobile, 390x201) at y 95300, x 0 / 700 | Cloned from the K6 field frames, default (unflagged) state, input stroke copied from the real Edit Profile field. 0 overlaps. |
| (c) Create Profile flagged samples | `6672:29251`, `6672:29235` | Placeholders replaced with the typed sample text of `6800:29476` and the typed text colour (`color/text/primary`, opacity 1). Mobile bio text now wraps inside the input (it ran past the frame edge). |
| (f) Coming Soon sample name | `6477:20050`, `6477:20402`, `6477:20677`, `6477:20764` | "Scouting" becomes "Feature name" on all four frames (they are one shared template for Scouting and Academy). Design Notes `6477:20868` updated to say so. |

## Checks with no change

- **(d) `@mekusa` on own-profile frames.** One visible occurrence in each of `6747:29094` (`6781:29520`), `6747:29291` (`6782:30106`), `6747:29445` (`6767:29409`). All three are the "Suggested" rail row "Emeka John @mekusa", a different person from the profile owner. Left unchanged: rewriting another person's handle would be wrong, and the post-author handles #411 item 8 refers to already read `@nelson_iheagwam` (5 each). Founder call if Emeka's row should also lose the handle. Related, not in scope: other-user frame `6747:28894` carries one `@nelson_iheagwam` (`6782:29565`) and a "Block nelson_iheagwam" label (`6782:30037`) on a profile whose posts are `@mekusa`; the Block label looks like it should name the viewed user.
- **(e) Mobile Restricted Pending `5531:7461`.** Screenshotted. Visible text matches the desktop frame `5108:6630` exactly (0 differences either way), 0 visible nodes outside the frame width, 0 unbound paints, 0 truncated text. Nothing to fix.

## Counts

- Top-level nodes on `0:1`: 918 to 920 (the two standalone Username frames). Hash of the original 918 ids unchanged (`736226337` before and after).
- Nodes per frame (before to after): `1466:15934` 2377 to 2381; `5702:8317` 40 to 45; `6672:29251` 15 to 15; `6672:29235` 15 to 15; own-profile `6747:29094` / `29291` / `29445` 766 / 646 / 766 unchanged; `5531:7461` 73 unchanged; Coming Soon four frames 171 / 160 / 86 / 77 unchanged; Design Notes `6477:20865` 8 unchanged; new frames 6 nodes each.
- Unbound solid paints on all new or edited nodes: 0.

## Open points (not decided here)

1. Whether (b) meant in-place fields, standalone frames or both; both were done. Delete whichever is not wanted.
2. The username hint wording (cooldown, one free correction) comes from Decision Log #411 item 8 and #412 item 6 and is untagged as a functional string; confirm.
3. The Edit Profile desktop modal sits on a legacy absolute-layout frame, so the 140 px shift was done by hand. Converting it to auto layout is a separate task.
4. Observed, not in scope: on the mobile Coming Soon frames the canonical footer's social labels wrap mid-word ("face / book").
