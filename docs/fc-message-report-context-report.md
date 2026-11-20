# Web and admin: add messages for context to a message report (B-286, Decision Log #477)

Written for: the founder and the reviewer who verify and merge this PR.

`apps/web`, `apps/admin`, `e2e/`, `docs/pending-copy-manifest.md` and this report only. `services/api`, Figma, every `.docx` and `docs/build-register.md` are untouched. Branch `frontend/message-report-context-web`, from `origin/main` `c7a5a02`. Built on the merged backend (`backend/b286-message-report-context`, PR #705) and the merged Figma frames (`docs/figma-message-report-context-report.md`, frame ids there).

## What was built

### apps/web: the optional step

- **Flow.** Reporting a message (the "Report" item on their message, both surfaces) is now: category and details -> **Next** -> "Add messages for context" -> **Submit report** (or **Submit with N messages**) / **Back**. The first step's main button reads "Next" only when there is something to offer; with no other message around the reported one it is the plain "Submit report" form as before.
- **Where the rows come from.** The thread the page has already loaded (no new request): `reportContextRows()` in `pages/messages/actions/messageActionRules.ts` takes the reported message and the 10 messages before and 10 after it by position, oldest first. A message deleted for everyone keeps its place in the count (the server counts it too) but is not offered. The reporter's own messages read "You"; the other person's carry their public name (or "The other person").
- **The step** (`components/report/ReportContextStep.tsx` + `.css`): title, subtitle, the tagged safeguarding callout, "N of 20 selected" with "Clear selection", "Include the messages shown" (chooses every offered message; reads "All shown messages included" and is disabled once everything is chosen), "That's the most we can include." at 20, and a scrolling list with a checkbox per message. The reported message is shown highlighted with a "Reported message" pill and has no checkbox, so it cannot be selected. Nothing is selected by default.
- **What is sent.** `createReport` gains `contextMessageIds` (`api/moderation.ts`, with `REPORT_CONTEXT_MAX = 20`). Only ids go; the key is left out entirely when nothing is chosen (the server refuses the field on any other target, even as `[]`). It is only ever sent for a message report that has the step.
- **After sending.** The confirmation keeps "Reported — thanks / Our team will review it." and adds "N messages from the chat were included with your report." (singular for one) when ids went. Back returns to the first step with the category and details kept, and the choice is still there when the person goes forward again. Escape and the scrim cancel on every step (not mid-send). Errors are the existing report errors: a refusal (the server's single 404) shows "Couldn't submit that report. Please try again." on the step and keeps the choice.
- Wired through `useMessageActions` (new `messages` argument, `contextRowsFor`), `MessageHost` and the shared `ReportAction` (new `contextRows` prop), so the mobile page and the Community pop-up behave identically.

### apps/admin: the card

`pages/moderation/ContextMessagesCard.tsx`: "Messages around the reported one" under the Reported content card on a message report. Messages the reporter chose, oldest first, with the reported message highlighted in its place (`aria-current`) and a "Reported message" pill; "Reporter" pill on the reporter's own; "Edited" with the original text; "Deleted by the sender" (text kept). With no messages chosen: "The reporter did not add any messages from the chat. Only the reported message is shown above." The card is left out while loading, when the read failed, and when the reported message is gone and nothing was attached. Read-only: no control to remove or change a message. `contextMessages` is read from the same single-report read as `reportedMessage` (both for a report handed over from the queue and for a direct visit).

### Tagged wording

One sentence says who sees what, so it carries `[COPY PENDING LEGAL REVIEW]`: "Our safeguarding team will see the messages you choose, and the message you are reporting." One row added to `docs/pending-copy-manifest.md` (`apps/web/src/components/report/ReportContextStep.tsx`); the inventory test passes. All other new wording is plain and untagged.

## Differences from the Figma frames (the code or the server wins; all veto-able)

1. **Loading and "couldn't load the messages" frames (mobile 04 and 05, desktop 04 and 05) are not built.** The brief says the candidates come from the thread already loaded, so there is no load to show or fail.
2. **No "N messages were not included" gap rows in the admin card.** The server returns only the chosen messages, with no position or count for the rest. The description line says the others are not shown.
3. **"Next" is not drawn.** The frames show the first step with "Submit report" and the context step with "Submit report / Back". Something has to lead to the step, so the first step's button reads "Next" when the step exists. Plain, untagged wording.
4. **"Submit with 1 message"** (singular) is mine; the frame only draws "6 messages".
5. **Sender label is the public name**, not the frames' "@handle (real name)".
6. **The reported message is slotted into the admin card by (time, id)**, the order the server uses. The report row does not say whether the reporter sent it, so it never gets a "Reporter" pill.
7. **"20 of 20" means the counter denominator is always 20.** With fewer than 20 offered, "Include the messages shown" chooses all of them; "That's the most we can include." shows only at exactly 20.

## Limits to know

- **The window is counted on the loaded thread.** The server counts its window over every message in the conversation, including ones the reporter hid for themselves, which the loaded list no longer holds. If the reporter has hidden messages near the reported one, the client's "10th before" can sit outside the server's window; the server then refuses the whole set with its single 404 and the person sees the plain could-not-send line. They can clear the selection and send. Not fixed (the client cannot know the hidden count); a server-side option would be to ignore out-of-window ids instead of refusing.
- **Only the newest page of the thread is loaded** (20 messages by default). If the reported message is near the top of the loaded page, fewer than 10 before are offered until the person loads earlier messages.
- Playwright coverage of the loading and error frames is not possible for the same reason as item 1.

## Existing tests changed (the only behaviour change)

`messageActions.test.tsx`: four report tests ran against a thread that has other messages, so the first step's button is now "Next" and sending needs the context step. They now click Next first (and the back/keep-choice assertion moved onto the new Back button). `e2e/tests/47-b284-message-report-web.spec.ts`: two tests (pop-up report, repeat report) go through Next the same way; the mobile and deleted-message tests use threads with no other message and are unchanged. No assertion was weakened or removed.

## Tests

- New unit tests: `ReportContextStep` behaviour through `messageActions.test.tsx` (10 new cases on both surfaces: window of 10 before/after, none chosen, reported not selectable, You/name labels, counter and button, ids sent in order, singular, include-all and the limit line, clear, back keeps, refusal keeps the choice, Escape cancels); `reportContextRows` (8 cases); `createReport` body (ids sent, key omitted); admin `contextMessages.test.tsx` (10 cases).
- Playwright `e2e/tests/50-b286-message-report-context.spec.ts` (next free number; checked against every remote branch): real Chrome, real API, Postgres, Redis. A thread of 20 messages; the step offers 18 (8 before, 10 after) with none chosen and the reported message unselectable; choosing 3 sends exactly those ids and the three rows are read back from Postgres; the admin card lists them with the reported message highlighted; "Include the messages shown" stores the whole window on the same (single) report; Back keeps the first step, Escape sends nothing, nothing chosen stores no context rows; mobile 390px with no sideways scroll and the buttons in view. Screenshots in `docs/b286-message-report-context-screens/`.

## Verification (measured)

Measured on this branch (before-figures for the full suites were not taken on a clean `main`; the new tests are listed above).

- `apps/web`: `tsc --noEmit`, `npm run lint`, `npm run build` clean. Full vitest **149 files / 1,913 tests, 0 failures** (`--maxWorkers=3`, 160 s). After the full run, one fix (focus, below) re-ran the two report-related files: 2 files / 149 tests, 0 failures. The pending-copy inventory test passes inside the full run.
- `apps/admin`: `tsc --noEmit`, `npm run lint`, `npm run build` clean. Full vitest **53 files / 861 tests, 0 failures**.
- Playwright (real Chrome, real API, Postgres, Redis; only these two specs run): `50-b286-message-report-context.spec.ts` **6 passed / 0 failed**; `47-b284-message-report-web.spec.ts` **5 passed / 0 failed** (re-run after the focus fix). The full Playwright suite was NOT run (the QA reviewer runs it at the launch gate). Specs 47-admin, 20 and 22 (admin report screens) were not run; the admin change only adds a card, but they were not re-checked.
- Not run: every `services/api` suite (untouched).

**A real bug the browser found, fixed:** after "Next", the button that had focus was removed, so focus dropped to the page and Escape (and Tab trapping) stopped working inside the dialog. The first Playwright run of spec 50 failed on exactly that. The dialog now takes focus on the context step and, going Back, focus goes to the chosen category. A new unit test pins it (not checked to fail without the fix). jsdom had hidden this because the unit Escape tests fire the key on the dialog element itself.

Screenshots from the Playwright run are in `docs/b286-message-report-context-screens/` (compared by eye with the Figma frames: mobile 01/02, desktop 01 to 03 and the admin frames; the others were not individually compared). The spec runs also rewrite the older `docs/b284-message-report-screens/` images; those were reverted, not committed.

Environment notes: the worktree's `node_modules` are junctions to the shared checkout, `prisma generate` was run once (additive: the `ReportContextMessage` model), and `services/api` was built in the worktree for the QA stack. A first background vitest run hung and was killed and re-run; nothing was lost.


## Forward-pointer notes (NOT written; no `.docx` or `docs/build-register.md` edited)

- Decision Log #477: add "web and admin legs built by `frontend/message-report-context-web`; the loading and error frames are not needed (candidates come from the loaded thread); a window mismatch from hidden messages is refused by the server and shown as the plain could-not-send line".
- `docs/build-register.md` B-286: BUILT (backend PR #705, web and admin this PR). Open: the hidden-message window mismatch; whether the server should ignore out-of-window ids instead of refusing.
- Figma follow-up, if wanted: a "Next" affordance on the first step, a singular "1 message" button, and the cases in items 1 to 5 above.
