# Playwright on demand in CI, and a run guard (B-134, B-273)

Branch `qa/playwright-on-demand-and-run-guard`, cut from `origin/main` `f6f7344`. Founder decision 2026-11-14: the
Playwright suite runs in CI **on demand only**. No product code, no spec change except one type fix in spec 34, no change to
`ci.yml`, no required check, no secret.

## What changed

| File | Change |
|---|---|
| `.github/workflows/e2e-playwright.yml` (new) | `workflow_dispatch` only. Inputs `spec_filter` and `test_clock_iso`. One ubuntu-latest job, Postgres 16 and Redis 7 service containers, Node 22.22.0 as `ci.yml`, `npm ci`, `prisma generate`, `npm ci --ignore-scripts` in `e2e/`, ffmpeg-static install step, ffmpeg/ffprobe warn-only check, Chrome check with a Playwright fallback install, `npm test`, a summary, and an `if: always()` artifact upload. `contents: read`, concurrency group `e2e-playwright` that queues and never cancels, job timeout 100 min, test-step timeout 80 min. |
| `e2e/support/run-guard.ts` (new) | The run guard (B-273). See below. |
| `e2e/support/global-setup.ts` | The guard is taken first. The old setup body became `startStack()`, the teardown became `stopStack()`; the exported function takes the guard, runs setup, releases the guard on a failed setup, and returns a teardown that stops the stack then releases the guard. There is no `global-teardown.ts` in this repo (the teardown is the closure `globalSetup` returns), so that is what was changed. |
| `e2e/support/helpers.ts` | `expireEmailVerifyToken` reads the Redis URL from `QA_BASE_REDIS_URL`, else the root `.env` only if it exists, else `redis://localhost:6379`. CI has no root `.env`, and spec 09 uses this helper. Harness only. |
| `e2e/tests/34-b037-profile-image-review-admin.spec.ts` | One line: `body: new Uint8Array(body)` in `putObject`. `npx tsc -p e2e --noEmit` is now clean. |
| `e2e/README.md` | Appended a section (38 inserted lines, 0 removed): how to run the workflow, inputs, duration, what it does not do, the guard message. |
| `services/api/src/e2e-playwright-workflow.spec.ts` (new) | 8 text tests, same style as `render-static-sites.spec.ts`: only `workflow_dispatch`, no other automatic trigger key, no secrets and no write permission, queueing concurrency, both timeouts, always-upload with hidden files, both inputs passed through env, and `ci.yml` never mentions Playwright. This is the test that says why there is no PR trigger. |

## The run guard

Why: a run drops and recreates `soccernity_qa`, flushes Redis DB 5 and uses fixed ports 3100, 5273, 5274, 3191, 3192. Two
sessions in two worktrees share all of that (the 2026-11-07 incident).

- A lock file `soccernity-e2e-qa.lock` in the OS temp directory (machine-wide, not per worktree), created with an exclusive
  write and holding `{ pid, startedAt, cwd }`.
- Live owner: refuse with one line naming pid, start time, folder, the database and ports, and how to clear it. A dead pid, or
  a lock older than 6 hours, is stale and is taken over automatically. An unreadable lock younger than 10 s is treated as a run
  that is still writing it and refused (a stale unreadable one is taken over).
- Then every watched port is checked; a busy one releases the lock and refuses, naming the port and `netstat`/`lsof`.
- Released at teardown, when setup fails, and on process exit. It never kills anything and never touches the database or Redis,
  and it runs before global setup does anything else, so a refused run changes nothing.
- Works on Windows and Linux (pid test through `process.kill(pid, 0)`, nothing platform specific).

Message seen when a second harness started while the first held the lock (spec 01, the cheapest):

```
E2E run guard: another QA run is active (pid <owner>, started <time>, from <folder>). It owns the scratch database "soccernity_qa" and ports 3100/5273/5274/3191/3192; a second run would drop that database under it. Wait for it to finish. If that process is not running, delete <tmp>/soccernity-e2e-qa.lock and start again. Nothing was changed or stopped.
```

## Results

| Check | Result |
|---|---|
| `actionlint` on `e2e-playwright.yml` | clean |
| YAML parse (js-yaml) | OK; `on` has exactly `workflow_dispatch` |
| Workflow guard spec (`e2e-playwright-workflow.spec.ts`) | 8 passed; a mutation check made 2 of them fail, then the file was restored |
| ffmpeg/ffprobe check script, run locally | OK |
| Spec 01 with the workflow's environment and no root `.env` (as in CI), final guard code | 6 passed, 0 failed, ~70 s; lock released, ports free afterwards |
| Second harness while the first holds the lock | refused with the message above; first run unaffected |
| Failed setup (wrong database password) | clear Prisma error; lock released, nothing left listening |
| Guard unit checks (live owner, dead pid, own pid, stale age, unreadable fresh and old, busy port, release only own lock) | all pass |
| Real two-process race for the lock, 6 rounds | exactly one winner and one refused each round |
| `npx tsc -p e2e --noEmit` | clean |

## Defaults I chose (founder-veto-able)

6 h maximum lock age; 10 s grace for an unreadable lock; `QA_TEST_CLOCK_ADVANCE=1` set automatically whenever a clock is
pinned; Chrome installed through Playwright only if the runner has none; job timeout 100 min, test step 80 min; artifacts kept
14 days; the extra workflow guard spec in `services/api`; the `helpers.ts` Redis change; cleanup of a half-started stack when
setup fails.

## What could not be verified

- **The workflow has never run on GitHub.** `workflow_dispatch` cannot be triggered before the file is on the default branch.
  **The first run must be started by Temi or the QA reviewer after this merges** (Actions, "E2E Playwright (on demand)", pick
  `main`; start with `spec_filter` = `01-adult-signup` to prove the runner, then run the whole suite).
- Everything Linux-specific was not executed: the ubuntu image, whether `google-chrome` is present (the step installs it if
  not), whether `ffprobe-static` is executable after `npm ci --ignore-scripts` on Linux, whether root `npm ci` works there, and
  that `upload-artifact` picks up the hidden `.run` directory (`include-hidden-files: true` is set for that reason).
- CI cannot be read from this session.
- The whole suite was not run (as instructed). The expected 40 minutes comes from the earlier full runs (38.4 and 38.6 min).
- The guard covers one machine. It does not stop two machines that share one remote Postgres. A reused pid is only mitigated by
  the 6 h age cap.

Not touched: `ci.yml`, required checks, `docs/build-register.md`, the Build Plan docx, spec 37-b058, any product code.
