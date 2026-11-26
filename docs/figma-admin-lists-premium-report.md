# Admin list pages: aligned to shipped code, then premium restyle (group 1)

Figma only (premium UI pass, step 2c-1). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No application code, schema, legal text or Build Plan docx changed. Founder decisions 2026-11-26: keep existing colours; the shipped code is the truth for these list frames; no code changes; about 50 newer frames not touched.

## Frames
- Users `917:218`, Articles `123:56`, Categories `128:488`, Categories - Add Category `138:93`: redrawn to the shipped pages, then restyled.
- New frame "Admin patterns (premium pass)" `7230:71662` (1440x1512, y 362696): table card, header band, row states (default, hover, pressed), six chips, four button states, delete-confirm row, empty table, load-error row, rules text.
- Admin Shell set `6014:12948`, Moderation Queue `5794:8635`, Articles - Create Post `124:313` and every other frame: not edited.

## Figma versus code, and how each was aligned
- Articles: Cover column and thumbnails removed (the code has none); Status column and Publish/Unpublish button added; per-row kebab removed; dates now `D Mon YYYY`; bold black three-line titles replaced by Web/Body navy, two lines max; truncated "Premier Lea..." fixed; grey stripes removed; Draft/Published tabs added.
- Users: icon-only actions replaced by the code's labelled actions; tabs and the link repositioned (they overlapped and were clipped).
- Categories: icon-only actions replaced by Activate/Deactivate; saturated pills replaced by the two chip styles; stray "Submit Post" button and empty area removed; tabs added.
- Add Category: now a standalone page. It was an overlay over a stale list.
- Page-level action buttons live inside the shell instance, so they were not added as children.

## Restyle applied
Page fill #f4f5fb; title Web/Title navy; white table card radius 12; header band green tint 12% with Web/Caption; 52px rows with a 1px `icon/inactive` hairline; 24px chips, radius full (Positive = green tint, Inactive/Draft = `icon/inactive`); row buttons navy 1px outline, radius 8, height 32. All bound to variables and styles; no new colours.

## Findings
- Create Post `124:313`: none of the four list frames has a prototype reaction pointing at it. Other frames were not checked.
- Hover and pressed states first rendered as solid navy (a bound paint takes its alpha from the variable). Fixed with unbound literal navy at 0.08 and 0.15 (Decision Log #199 precedent). That is an intentional exception: 3 unbound fills in the patterns frame, plus the shell's inherited `Rectangle 223`.
- Chip "navy 8%" uses the bound `icon/inactive` (15%).
- Secondary text on green tint is 4.54:1, close to the 4.5:1 limit.

## Not verified
- The overlay fix was checked by fill readback only; no screenshot afterwards (screenshot budget of 10 was used up).
- In earlier screenshots the page area looked white rather than #f4f5fb; not investigated.
- The last Categories row hairline may extend slightly past the card.
- Original-id hash not recomputed against a stored baseline; Moderation Queue and shell geometry were read, not compared to a stored baseline.
- Structure check against the before-snapshot was only partly done.
