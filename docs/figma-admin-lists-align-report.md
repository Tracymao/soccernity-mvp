# Admin list pages aligned to the shipped code (part 2 of 2)

Figma and docs only. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. The shipped code is the source of truth; the restyle from #920 and #921 is unchanged. The shell, the Moderation Queue and other frames were not edited. 2026-11-26.

## Changes
- All four frames: page fill `brand/off-white` (#f4f5fb). `color/background/page` is white, so it was not used. No shell fill covers the page.
- Users `917:218`: title x302; text tabs with a navy underline replace the chips; outline "Incorrect-details reports" and a disabled "Add Member" in the tab row; the two-line note; table at y366; View, Block/Unblock and Delete are navy outline buttons; "Load more" left at (302,846); shell Create hidden.
- Articles `123:56` and Categories `128:488`: tabs, page-row "Create Article" / "Add Category", table at y318, columns at the measured x, "Load more" left; shell Create hidden.
- Add Category `138:93`: back link above the title, label, 1097x41 input, 95x40 Submit.
- Patterns `7230:71662`: page fill; "Retry" link; empty state "No categories yet" / "Add the first one to get started." with no button; navy "Confirm delete", outline "Cancel". Height 1512 to 1502.
- Found in screenshot review and fixed: one-line article titles sat at the top of their 44px boxes (now centred, 8 rows); the Users "Load more" label was 13px, the code renders 14px. Articles and Categories stay at 12px, as their CSS does.

## Verification
- Top-level nodes 2004, id hash (excluding the patterns frame) 2327422288: both unchanged. Moderation Queue content: 89 descendants, unchanged.
- Positions, match/mismatch at 2px: Users 8/0, Articles 6/0, Categories 6/0, Add Category 5/0. Header x versus value x: 0 mismatches.
- Overlaps with the search box or rail: 0. Red-ish paints in the five frames: 0.
- Unbound solid fills: `Rectangle 223` in each of the four shell instances; `Row - Hover`, `Row - Pressed`, `Button - Deactivate` in patterns (all known).
- Page-content font sizes: Users and patterns {12,13,14,16,24}; the other three {12,14,16,24}. Shell instances also contain 15 and 18 (not touched). Radii: 6, 8, 12 or full only.
- Contrast: lowest 4.79 (4.8 on Add Category). Disabled "Add Member" 1.47 (allowed). A 2.22 flag on the patterns hover "Deactivate" was a fault in the check script: solid navy on an 8% navy wash.
- Screenshots (6): page off-white, tabs and buttons as listed, tables end at the content edge, nothing clipped or overlapping. The Users, Categories, Add Category and patterns shots predate the two review fixes; only Articles was re-shot.

## Differences and choices
- Add Category: the search bar stays at y182; the code has y198 on that page. Reported, not fixed. The title box ends at y177.
- Seven frames still draw the shell Create button (Create Task x4, Add Role, Add Media, Filter), for later groups. This list is from the task brief; it was not re-counted.
- Tabs use `Admin/Body strong` (there is no `Web/Body Medium` style).
- Load-error text: "Couldn't apply the correction." (`pages/users/CorrectDobPage.tsx`, the grep's first match). It is a date-of-birth correction message, not a list-load message. The list pages show the server's message, else "Something went wrong. Please try again." (`pages/content/adminContentShared.tsx`).
- The code's error box has a red accent bar; it is not drawn (no red anywhere).
- Empty-state heading is 16px in Figma, 18px in `content.css`.
- "Load more" is 40 high on all three pages, as measured in the brief. The Articles and Categories CSS (6px 12px padding, 12px text) suggests a shorter button; this was not re-rendered.

## Not verified
The shipped pages were not rendered again for this pass; measurements are the brief's. Hover and pressed states of the new buttons were not drawn. No code, test or build was run.
