# Figma gaps K: 404 notes tidy (Figma and docs only)

File weZWWqggy9j13eX8bhFgs6, page 0:1. Text edited in place, ids unchanged. No node added or deleted, no frame other than text nodes touched.

## Changed nodes (old -> new)
- 7142:70447
  - old: "Design proposal drawn 2026-11-24 at the founder’s request. Approved by the founder on 2026-11-24. Not built yet."
  - new: "Design drawn 2026-11-24 at the founder’s request. Approved by the founder on 2026-11-24. Built in PR #896 (Decision Log #565) and brought into line with these frames in a follow-up PR (note on #565)."
- 7142:70448
  - old: "Built today: the heading “Page not found” plus a “Back to home” link, rendered under the site footer."
  - new: "Before this change the page showed the heading “Page not found” and a “Back to home” link under the site footer."
- 7142:70449
  - old: "If approved, NotFoundPage.tsx changes and the copy on these frames is new."
  - new: "Built: NotFoundPage.tsx now shows this content; the signed-in Back to home goes to /community and the signed-out one to /."
- 7142:70451
  - old: "OPEN: frames 6738:30391 and 6738:30526 (blocked profile) and 7015:58735 and 7015:58744 (private-profile post) show old wording and are NOT edited. OPEN: whether the code reuses NotFoundPage for those states."
  - new: "Resolved 2026-11-24: the four older not-found frames (6738:30391, 6738:30526 blocked profile; 7015:58744, 7015:58735 private-profile post) were redrawn to this page. In the code a missing or blocked profile and a missing or private post all render this page."
- I6738:30554;6671:27526 (note 6738:30554 body; was false: said old wording, generic-404 question open)
  - old: "SCOPE OPEN (Block, Decision Log #404): a blocked user sees the blocker’s profile as not found. Drawn with the app’s existing wording (“Page not found”, “Back to home”, apps/web NotFoundPage), so it is the same state as a profile that does not exist and shows nothing about the block. Open: whether it should be the generic app 404 (with the site footer, #228) or this in-profile state. The profile route has no code yet (B-082). No file held a profile not-found frame before this one."
  - new: "SCOPE OPEN (Block, Decision Log #404): a blocked user sees the blocker’s profile as not found. Drawn as the app’s 404 page (“We can’t find that page”, with “Back to home”, “Sports Hub” and “Contact us”), so it is the same state as a profile that does not exist and shows nothing about the block. In the code a missing or blocked profile renders this page (NotFoundPage, Decision Log #565). The profile route has no code yet (B-082). No file held a profile not-found frame before this one."
- 7015:58743 (label)
  - old: "PV3 · private profile post link, non-follower: ordinary “Page not found”"
  - new: "PV3 · private profile post link, non-follower: the 404 page (“We can’t find that page”)"
- 7018:59195 (note, found by scan)
  - old: "• A post link of a private profile opened by a non-follower shows the ordinary “Page not found” (PV3, PV4), the same as a missing post, so nothing leaks. A “This profile is private” page there would reveal that the post exists."
  - new: "• A post link of a private profile opened by a non-follower shows the 404 page (“We can’t find that page”, PV3, PV4), the same as a missing post, so nothing leaks. A “This profile is private” page there would reveal that the post exists."

## Read and left alone
- 7142:70446 (title), 7142:70450 (links note): as instructed.
- 7015:58749 label ("PV4 · same, desktop"): still true.
- Headings "Page not found" 6738:30524, 6738:30552, 7015:58741, 7015:58747 and their "Back to home" siblings: old content inside the redrawn frames, already hidden and renamed ARCHIVED by pass J; not edited.
- 7037:60964 ("Post not found" removed-post notice, different state), 7144:70660 ("Match not found."), I7080:67823 ("Record not found"), I6754:29553 (profile note), 6706:26934 (blocked-profile note): other states, not about this 404 page.
- Legal-draft hits (6114:*, 6116:*) matched the scan on other words.
- Layer names containing "same as not found" (7015:58743, 7015:58749, 7015:58744) are names, not text; not changed.

## Checks
- Top-level node count 1,990 before and after.
- Hash of ordered top-level ids (djb2-style over id characters, in page order) 517768233 before and after.
- Notes frame 7142:70445 is vertical auto-layout; it grew 326 to 360, children end at y 335, so nothing clips and no frame was enlarged by hand.
- Only text changed, so fills are unchanged (no new unbound paints). No screenshot taken (not run).
