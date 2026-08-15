# Soccernity — Claude Code project context

Read this before doing anything. It's the short version of two much longer documents that live in `docs/` — read those in full before making any decision this file doesn't cover.

- `docs/Soccernity_Inventors_Log_Book_v2.10.docx` — the strategic and product record. Vision, market, full feature catalogue, competitive positioning, safeguarding principles, Figma design audit.
- `docs/Soccernity_MVP_Build_Plan_v1.4.docx` — the tactical execution plan. MVP scope, data model, API contract, sprint backlog, infrastructure decisions, definition of done. **This is the one to work from day to day.**

## What Soccernity is

A platform giving unaffiliated grassroots football players — and the fans, coaches, and communities around them — an identity, a community, and (in a later phase) a safe path to being discovered. MVP v1 deliberately does **not** build the AI-scouting or careers pillars yet — see "What's explicitly out of scope" below before adding anything ambitious.

## Branch strategy

- `main` — production source of truth. Protected: nothing merges without CI passing and a review.
- `staging` — pre-production, for testing a batch of merged work before it goes live.
- Task branches — one per agent task or sprint deliverable, named `sprint-<id>/<short-description>` (e.g. `sprint-d/design-tokens`, `sprint-1/guardian-consent-api`) so the sprint dependency is visible in the branch name, not just in Build Plan Section 6. Delete after merge.

`.github/workflows/deploy.yml` deploys `staging` and `main` automatically once pushed to — but its actual deploy step is a deliberate placeholder that fails loudly (`exit 1`) rather than guessing a hosting platform. See "Where things stand right now" below: hosting is Decision Log item #9, still open.

## Non-negotiables

1. **Never remove or weaken the safeguarding fields on `User` or `Guardian`** (`is_minor`, `guardian_id`, `consent_status`, `consent_token`, `consent_timestamp`) or the restricted-pending state they support. This isn't a style preference — see Build Plan Section 8 and Log Book Section 10.
2. **Never treat any `safeguarding-drafter` output as approved.** It is always a draft for human legal counsel to review. Say so if you're asked to skip that review.
3. **Never introduce a new brand color.** Soccernity's palette is exactly two colors — green `#7BB929` and navy `#282E65` — documented in Log Book Section 23.4. Every other color, including dark-mode values, must be derived from those two and justified. See `.claude/agents/figma-design-system.md`.
4. **Never build Discover-pillar or Careers-pillar features** (AI Combine, Talent Passport, Scout CRM, job board, Academy Marketplace) without an explicit go-ahead. They're real, documented, and deliberately deferred — see Build Plan Section 2.2 for why.

## Stack

- Backend: Node.js + TypeScript, NestJS, PostgreSQL (via Prisma — see `services/api/prisma/schema.prisma`), Redis.
- Web: React. Mobile: React Native. Admin: React.
- Repo: npm workspaces monorepo — `apps/web`, `apps/mobile`, `apps/admin`, `services/api`, `packages/shared`.
- Start as a modular monolith inside `services/api`. Don't split into separate services until load actually demands it.

Full reasoning for every choice above: Build Plan Section 5.

## The data model and API contract are fixed specs, not suggestions

`services/api/prisma/schema.prisma` implements Build Plan Section 3 exactly — 20 entities. If a task needs a field or entity that isn't there, that's a Decision Log candidate (Build Plan Section 9), not something to add silently. Same for endpoints: Build Plan Section 4 is the full list, grouped by service.

## Where things stand right now

- **Sprint D and Sprint 0 have not started.** Dark mode doesn't exist in Figma yet. No screens exist yet for the guardian-consent flow, the full Notification Center, or Grassroots record-keeping.
- **Three Decision Log items block Sprint 1 and Sprint 4** — auth provider choice, regional minimum age for the age-gate, and sports-data vendor selection (Build Plan Section 9, items #6–#8). Check these are resolved before starting that work; don't guess and move on.
- **A fourth item, #9, blocks the deploy workflow specifically** — hosting platform is not yet chosen. `.github/workflows/deploy.yml` will fail on purpose until this is resolved and the workflow is updated to match. Don't fill in a provider by guessing.
- Community, Sports Hub, and the Admin Console are the strongest-designed pillars in Figma (Log Book Section 23.1) — Discover and Careers have zero screens.

## The eight agents, and the order they run in

All eight live in `.claude/agents/`. Three are sequence-dependent — running them out of order produces work built on an unfinished system:

1. **`figma-design-system`** — derives light/dark tokens from the two brand colors, retouches already-built screens, fixes Figma housekeeping. Runs first, always.
2. **`figma-screen-builder`** — designs screens that don't exist yet (guardian-consent flow is the priority). Only starts once (1) is finished.
3. **`figma-to-code`** — converts whatever (1) or (2) finished into real code. Only runs on screens already marked complete.
4. **`backend-api`** — builds the API/database layer against Sections 3–4. Independent of the Figma sequence; can run in parallel with (1)–(3).
5. **`qa-reviewer`** — read-only. Reviews PRs and test runs against Build Plan Section 7. Never fixes code itself.
6. **`competitive-scanner`** — quarterly market re-scan, independent of sprint cycles.
7. **`content-ops`** — drafts blog content once the Admin Console is live. Never publishes directly.
8. **`safeguarding-drafter`** — drafts DPIA/policy/consent-copy language. Every output is explicitly unapproved until legal counsel signs off.

Full agent map to sprints: Build Plan Section 11.

## Sprint order

Sprint D → Sprint 0 (parallel) → Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 5 → Sprint 6. Each sprint's tasks and its "done when" criterion are in Build Plan Section 6. Don't build a later sprint's screens or endpoints early just because they happen to be convenient — the sequencing exists for real dependency reasons, not arbitrary ordering.

## Definition of done

Build Plan Section 7. The safeguarding items in it (age-gate enforcement, DPIA review, guardian-consent flow) are hard blockers on calling MVP v1 complete — not soft goals.

## When you're unsure

Check the Consolidated Decision Log (Build Plan Section 9) before guessing. If the thing you need isn't resolved there either, surface it — don't invent an answer and move on quietly. That's how this project ended up needing a full gap-analysis pass before (Log Book Section 25); the goal from here is to not repeat that.
