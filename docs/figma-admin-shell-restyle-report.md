# Admin shell restyle (Figma only, premium UI pass, step 2a)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. No application code, schema, legal text, wording or counsel pack changed. Decision Log #574 (a default, veto-able). Register Section 142.

## What changed
The "Admin Shell" component set `6014:12948` (12 variants, 295 instances) was restyled in place, so every admin screen that instances it updates. Existing colours only (navy, green, tint, surface, inactive); no new hue, no new variable.
- Nav rows: Web/ Nav label (15 Medium), active row Nav label active (15 Semi Bold), radius md, active row navy fill with on-navy text.
- Rail, logo, profile block, Create and Log Out buttons: radius sm/md, existing tokens.
- Search bar (component set `6926:35951`): white surface, 1px inactive border, radius md, 740x44.
- Typography: 204 of 228 shell text nodes are bound to Web/ text styles (nav labels Web/Nav label and Web/Nav label active, Create and Log Out Web/Body large, search placeholder Web/Body). 24 are intentionally unbound: the 12 logo wordmarks (artwork) and the 12 profile names (mixed style runs). Fix-up of #915: it had bound 48 of 228.
- Two new frames below the canvas: `7204:71662` component states (1440x776, y 361100) and `7205:71662` behaviour spec (1440x496, y 362000): hover 150ms, reduced motion shows the end state at once, and 8 rules (row actions never hidden behind hover, sticky header never covers content, one-line status chips, charts not hue-only, empty tables show a message and an action, active nav exposes aria-current, focus ring 2px navy offset 2px, 44px minimum height and 12px minimum text).

## Structure lock (verified, numbers only)
- Top-level nodes 2,001 to 2,003 (only the two new frames).
- Hash of the original ids unchanged: 4115603089.
- Structure signatures of the 8 checked frames (`5794:8635`, `6947:40930`, `5796:8635`, `5796:8753`, `6851:29675`, `7051:63458`, `6644:22559`, `1658:2303`): 8 of 8 match.
- Overlaps of the new frames with existing nodes: 0.
- Unbound solid fills in the shell set: only `Rectangle 223` (literal by design, Decision Log #199); 0 in the new frames.
- Contrast: 216 visible text nodes in the shell, lowest 12.58:1 (target 4.5:1).
- Reactions: none existed on the shell set, none added.
- Screenshot of `5794:8635` read by eye: "Username reviews" is on one line, the tab strip is intact, the standalone Filter button shows. Only this one screenshot was inspected; the other five planned ones were not taken (the tool returns a URL only).

## Report only, not changed
- Code Moderation tabs: Open Reports, Appeals, Media review, Contact enquiries, Held investigations (`ModerationQueuePage.tsx`). Figma queue `5794:8635` draws only Open Reports and Appeals as tabs; Media review `6851:29675` and Contact enquiries `7051:63458` are separate frames and are not seen sharing that tab strip; I did not look for a held-investigations frame. So the code's five-tab strip is not drawn as one strip in Figma.
- `5794:8635` shows the standalone Filter button; the shell Filter stays hidden (seen in the screenshot).
- `adminNav.ts` has the nine items the brief names plus Username reviews and Activity (eleven rows plus Settings pinned); the Figma shell draws the same eleven plus pinned Settings (screenshot). Role-based hiding of Username reviews is code only.

## Not verified
Five of the six planned screenshots, the Contest and Users variants by eye, and CI (unreadable from here). Nothing was run beyond Figma reads. All values are defaults for the founder to veto.
Checked only in the fix-up: states frame 7204:71662 (hover fills navy 8% / 90%, real Moderation icon in the five nav examples, focus rings, 42 of 42 text nodes styled), Users variant by eye, contrast over the shell set and states frame (lowest 5.01:1, none under 4.5:1; frame opacity on the disabled swatches is not composited, so those two are not independently proven), 8 structure signatures (after values only, no before values were captured, so match/mismatch is unproven), top-level count 2,003 and id hash 2519744380 unchanged. Held investigations frames exist: 6647:23351, 6647:23603, 6647:23831, 6647:24060 (not changed).
