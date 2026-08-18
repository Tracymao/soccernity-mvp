# Soccernity

Read `CLAUDE.md` first — it's the short version of everything below and the file Claude Code loads automatically.

## Full documentation

- `docs/Soccernity_Inventors_Log_Book_v2.13.docx` — strategy, product, market, safeguarding.
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — the document to actually build from: scope, data model, API contract, sprint backlog, definition of done.

## Structure

```
apps/
  web/       fan-facing web app (React)
  mobile/    fan-facing mobile app (React Native)
  admin/     Admin & Operations Console (React)
services/
  api/       NestJS backend, Prisma schema, one module per feature area
packages/
  shared/    shared types + design tokens (owned by figma-design-system agent)
.claude/
  agents/    the eight Claude Code subagents — see CLAUDE.md for sequencing
docs/        the two source documents above
```

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the real values
docker compose up -d   # local Postgres + Redis — see docker-compose.yml
npm run prisma:generate
npm run prisma:migrate
npm run dev:api
```

Confirm it's actually working, not just that commands didn't error:

```bash
curl http://localhost:<port>/health
# expect {"status":"ok","database":"connected"}
```

Run the test suite too: `npm test` at the repo root runs every workspace's tests (`--workspaces --if-present`). `services/api` currently has 25 suites / 158 tests passing (as of PR #33, the Postmark email-provider wiring). `apps/web` has its first test suite as of PR #38 (`AgeGateStep.test.tsx`, 7 cases) — most of `apps/web` still has no test coverage, don't assume otherwise.

Two items in `.env.example` are still open Decision Log items and need a real value before deployment — `SPORTS_DATA_API_KEY` (#6) and hosting-platform secrets (#9). `JWT_SECRET` needs a real generated value (`openssl rand -base64 32`) even for local dev — never the placeholder.

## Branches

- `main` — production, protected.
- `staging` — pre-production.
- Task branches — `sprint-<id>/<description>`, deleted after merge.

```bash
git checkout main && git pull
git checkout -b sprint-1/guardian-consent-api
# ...work...
git push -u origin sprint-1/guardian-consent-api
# open a PR into main
```

## Agents

Eight Claude Code subagents live in `.claude/agents/`. Three of them — `figma-design-system`, `figma-screen-builder`, `figma-to-code` — must run in that order. See `CLAUDE.md` for the full sequencing and the sprint-to-agent map in Build Plan Section 11.
