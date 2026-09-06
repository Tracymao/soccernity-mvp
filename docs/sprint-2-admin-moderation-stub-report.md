# Sprint 2 — apps/admin PR 3: Moderation screens (disclosed stubs)

**Agent:** figma-design-system (one-time cross-assignment to figma-to-code, founder-directed)
**Branch:** `sprint-2/admin-moderation-stub` — **stacks on PR 2** (`sprint-2/admin-profile-and-password`, PR #193). Merge order: #192 → #193 → this.
**Figma:** `5794:8635` (Moderation Queue), `5796:8635` (Report Detail & Action), `5796:8753` (Appeal Review).

## Why a stub

No moderation-queue backend exists. Build Plan Section 4.8 spec's `GET /admin/moderation/reports` + `PATCH /admin/moderation/reports/:id`, but neither is built — Sprint 5 scope, flagged in Decision Log #135/#189. Verified live: no moderation controller anywhere in `services/api`.

## What this PR ships

New shared stub primitives — `src/components/stub/AdminStub.tsx` (`StubBanner`, `StubSection`, `StubField`, `StubButton`, `StubTable`, `AdminStubScreen`) + `.css` — **reused by PRs 4–10**. The discipline: reproduce the real Figma layout, disable every control, banner-disclose the missing backend, caption sample data "Sample".

| Screen | Route | Reproduced |
|---|---|---|
| Moderation Queue | `/moderation` | Open Reports / Appeals tabs, the report table (6 sample rows), Export Queue button |
| Report Detail & Action | `/moderation/reports/:id` | Reported content + report details sections; the 4 moderator actions (Dismiss / Remove / Warn / Suspend) |
| Appeal Review | `/moderation/appeals/:id` | Routing banner, read-only original decision, appeal, Uphold / Overturn |

All buttons `disabled`. Delete/suspend actions are **navy, not red** — no destructive-colour token (CLAUDE.md non-negotiable #3).

## IA preserved for the Sprint 5 backend PR

Two rules from the design are rendered as visible on-screen copy so the future backend PR inherits them, not re-derives them:

- **Decision Log #138** — an appeal is reviewed by a **different** admin/moderator than the one who made the original decision (shown on both the Queue and the Appeal screen).
- **Build Plan Section 8.4** — both the reporter and the reported user are notified of the outcome.

The `:id` route params are accepted but unused (the pages render the static structure regardless) — the Sprint 5 PR wires them to real fetches.

## Verification

- `apps/admin` vitest — **9 files / 38 tests, 0 failures** (`moderation.test.tsx` +3: banner disclosure + sample table + DL #138 copy; 4 disabled moderator actions; disabled Uphold/Overturn)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean
- No real browser check available — same ceiling as every apps/web figma-to-code PR

**Decision Log #233.** Not merged — founder's call. Next: PR 4 `sprint-2/admin-dashboard-stub`.
