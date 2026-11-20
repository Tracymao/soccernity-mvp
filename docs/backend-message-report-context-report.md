# Backend: message report context (B-286, Decision Log #477)

Branch `backend/b286-message-report-context`, built from `origin/main` `be679cd`. `services/api` only, plus this report
and the CLAUDE.md status bullet. No `apps/web`, `apps/admin`, Figma, `.docx` or `docs/build-register.md` change.

## What was built

1. **`POST /reports`, `targetType: "message"`** accepts optional `contextMessageIds` (array of uuid, at most 20, duplicates
   dropped, order kept). With any other `targetType` it is a coded 400 `report_context_not_allowed` before any database
   read (an empty array is refused too). `POST /reports/public` never accepts the field (global `forbidNonWhitelisted`).
2. **One validation, one place** (`ModerationService.resolveContextMessageIds`), run after the reported message itself
   passed `assertMessageReportable` (which now returns what the context check needs). Every id must be in the same
   conversation, among the 10 messages immediately before or after the reported one in `(sentAt, id)` order, and visible
   to the reporter exactly as the reported message must be (not hidden by them, after any `ConversationHide` cutoff, not
   deleted for everyone). The reporter's own messages are allowed. Any failure is the same `404 "Message not found"`.
3. **`ReportContextMessage`**: `reportId` (FK, CASCADE), `messageId` (FK, RESTRICT, a deliberate safety net), composite
   primary key, `createdAt`, index on `messageId`. Migration `20261123090000_add_report_context_message` (additive,
   rollback in its header; the previous latest was `20261122090000`). Classified in
   `anonymized-row-purge.references.ts` as `REPORT_EVIDENCE_MODELS`, with spec cases (see below).
4. **Repeat reports**: the existing rule (one open report per reporter per message returns the existing report) now also
   adds any new valid context ids to it, in the same transaction and advisory lock, up to 20 in total.
5. **Admin read**: `GET /admin/moderation/reports/:id` on a message report keeps `reportedMessage` and adds
   `contextMessages` (empty array when none, oldest first), each
   `{ id, sentAt, sender: { publicName }, sentByReporter, contentText, originalContentText, editedAt, deletedForEveryone }`.
   No conversation id, no recipient, no sender id, no other message. The child-safety-vetting gate applies first.
6. A filed report notifies nobody (unit and e2e assert it).
7. **Retention note** for the later sweep is in `moderation/README.md` ("Context messages") and the CLAUDE.md bullet: the
   sweep must skip any message with a row in `ReportContextMessage`.

## Defaults I chose (all founder-veto-able)

- The window is counted over ALL the conversation's messages (hidden and deleted ones included), then visibility is
  applied to the submitted ids. A window over only the visible messages would give the reporter more reachable context
  but would make the window depend on what the reporter has hidden.
- The reported message itself as a context id is a 404 (it is already the target, and it is not before or after itself).
- When a repeat would take the report past 20 context messages, only the first ids that fit are added and the rest are
  ignored without an error. A 400 would make a harmless repeat fail.
- `contextMessageIds: null` is read as absent.
- One bad id refuses the whole set (nothing is partly attached).

## Findings and things to know

- `ReportContextMessage` has no relation to `User`, so the derived purge classification cannot see it. The decision is
  explicit instead: the sender of every attached message is already covered by `Message.sender` (content) and
  `Conversation.participantIds`, which block the purge of any account that wrote or took part in the thread.
- The 404 for a context id the reporter may not see is deliberately identical to the refusals of the reported message
  itself, so the endpoint cannot be used to probe a thread. It does take two extra reads, so timing differs between a
  request with and without context; that is not a protection target here (the reporter is a participant).
- `apps/web` does not send `contextMessageIds` and `apps/admin` does not show `contextMessages` yet.

## Forward-pointer notes (NOT written; no docx or register edited)

- Decision Log #477: status line "built by `backend/b286-message-report-context`; backend only; web and admin not built".
- `docs/build-register.md` B-286: BUILT (backend), with the defaults above; open: the web leg (send the ids from the
  report dialog) and the admin leg (show `contextMessages` on Report Detail).
- Decision Log candidate (not transcribed): the new `ReportContextMessage` table, a genuine addition beyond Section 3.
- Part of the later retention work (the sweep for messages): must skip any message with a `ReportContextMessage` row.

## Verification

Measured on this branch (before-figures not taken on a clean `main`):

- `tsc --noEmit` clean; `eslint` clean on `src/modules/moderation` and the two purge-reference files; `prisma generate` ran.
- Unit, 5 suites / 166 tests, 0 failures: `moderation.message-report-context.spec.ts` (new: DTO, the 400 for
  other target types, a valid set, every 404 and its sameness, duplicates, repeat merge and the 20 cap, admin read,
  vetting-first), `moderation.message-report.spec.ts` (setup only: its Prisma mock gained the two new calls),
  `reports.controller.http.spec.ts` (+3), `public-reports.controller.http.spec.ts` (+1),
  `anonymized-row-purge.references.spec.ts` (+3, REPORT_EVIDENCE_MODELS).
- API e2e on real Postgres (private database `soccernity_test_b286`, `--runInBand`), 2 suites / 38 tests, 0 failures:
  new `test/message-report-context.e2e-spec.ts` (window edges 10/11 both ways, same-`sentAt` ties ordered by id, 404
  sameness byte-identical to a missing message, repeat merge and the 20 total, 5 simultaneous reports, RESTRICT and
  CASCADE, admin read, vetting, no notification) plus the existing `message-report.e2e-spec.ts`. The migration applied
  cleanly from zero as part of that run.

Not run: the full mocked suite, the full e2e suite, every other e2e file, Playwright, `apps/web`, `apps/admin`.
Environment notes: `node_modules` in the worktree are junctions to the shared checkout, so `prisma generate` updated the
shared generated client (additive: one new model); the e2e needed `127.0.0.1` instead of `localhost` for Postgres.
