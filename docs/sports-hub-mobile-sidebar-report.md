# Sports Hub: league sidebar collapses on mobile (CH-H16)

Decision Log #584, build register B-337 and Section 154. Web only. Branched from `origin/main` `838414d`.

## The problem

On a phone the Sports Hub league sidebar sat at the top at full length, so the live scores started below the whole league list.

## What changed

- At 960px and below the sidebar is a drop-down. A full-width button shows "Leagues" and the current selection, with a chevron. It is closed on every load.
- The button opens and closes the panel (search box, "Sort by league", league list). It carries `aria-expanded` and `aria-controls`.
- Picking a league (or "All leagues") closes the panel. Typing in the search box does not.
- Above 960px the button is not displayed and the sidebar looks and behaves as before. The collapsed class only applies inside the 960px media query, so the open/closed flag cannot hide the desktop sidebar.
- No API, schema, admin or Figma change. No new copy tagged for legal review.

## Files

- `apps/web/src/pages/SportsHubPage.tsx`
- `apps/web/src/pages/sports-hub/SportsHubPage.css`
- `apps/web/src/pages/SportsHubPage.test.tsx`
- `docs/build-register.md`, `docs/Soccernity_MVP_Build_Plan_v1.7.docx`, `CLAUDE.md`, this report

## Test results

- `eslint` on the touched files: clean. `tsc --noEmit`: clean.
- Targeted vitest for the page: 35 tests passed.
- Full web vitest: 2,255 passed, 2 failed, in two files (a focus assertion in the Change Password page test, and a 5-second timeout in a source-scanning test in `MatchCentrePage.test.tsx`). Both files were re-run alone: 61 of 61 passed. Neither file was changed here.
- `npm run build:release`: passed, including the pending-copy check.

CI's first run failed on the same Change Password focus assertion. It is a timing race in that test: the page focuses the field in an effect that can run after the error text appears. The test now waits for the focus; the page is unchanged.

## Real browser

The built app was served locally and driven in the installed Windows Chrome through Playwright, with the API intercepted (40 sample leagues, 3 live matches), viewport height 844. 33 of 33 checks passed.

- 390px and 768px: toggle shown (49px tall), panel hidden on load, first match visible without scrolling (bottom edge at 396px), no horizontal overflow, expand and chevron rotation work, searching keeps it open, picking closes it, updates the label, filters the list and moves focus to the toggle, no page errors.
- 1440px: no toggle, panel open, sidebar 260px wide, picking keeps it open.
- Resizing between 1440px and 390px, open and closed, left no stuck state.
- Keyboard: Tab reaches the toggle with a visible outline, a closed panel is skipped, Enter opens, Space closes, an open panel is tabbable.
- Reduced motion: the chevron transition is effectively zero.

Screenshots were kept outside the repository.

Not run: the Playwright `e2e/` suite, a real device, Safari or Firefox, the admin and API suites, CI.

## Decisions the task did not spell out

- Focus moves to the toggle after a pick made while the panel was open, because the pressed button becomes hidden.
- The current selection is shown on a second line under the "Leagues" label.
- The sidebar's padding is reduced to 12px at 960px and below.
- The open flag survives a resize. It has no effect above 960px.
- One existing test query was made exact (`"All leagues"`), because the new button's name also contains those words.
- jsdom applies no stylesheet, so the unit tests check the collapsed class and read the CSS file; the rendered behaviour was checked in Chrome.
- `/usr/bin/google-chrome` does not exist on this Windows machine, so the installed Windows Chrome was used.
