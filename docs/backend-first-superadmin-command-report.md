# Backend: first-superadmin command (report)

Branch `backend/first-superadmin-command`, from `origin/main` `a31dec6`. Founder decision 2026-11-14: build the missing command that creates the first Admin Console account (runbook step 5.5 and open question F3). Procedure for the founder: `docs/first-superadmin.md`.

## Handshake

- `git fetch origin`; `origin/main` = `a31dec6` (merge of PR #784).
- Open PRs: none (`gh pr list --state open` returned nothing), so none touches `services/api/src/scripts/` or `services/api/package.json`.
- Tests ran on **my own scratch Postgres database and Redis DB** (stated under Verification), never the shared `soccernity_test`. The worktree is `D:\Projects\soccernity-first-superadmin`, `node_modules` linked to the shared checkout's.

## What was built

- `services/api/src/scripts/create-first-superadmin.ts`, run as `node dist/scripts/create-first-superadmin.js`, with the npm script `create-first-superadmin` in `services/api/package.json` (`npm run create-first-superadmin -- --email ... --full-name ...`). Same style as `rotate-dob-encryption-key.ts` and `backfill-dob-encryption.ts`: dotenv from the root `.env` first (variables already set win), counts-and-ids-only output, exit codes, a `.spec.ts` beside it, `require.main === module` wiring, an exported function (`runCli`) that returns the exit code so tests can drive it.
- It creates ONE `AdminUser`: `role = 'superadmin'`, `accountStatus = 'active'`, the email (trimmed, lower-cased) and full name (trimmed), `passwordHash` from the existing `PasswordService` (argon2id, no parameters chosen here).
- No schema change, no endpoint, no change to admin auth, the Admin Console or any existing script, no new dependency. No "reset password" or "make admin" path.

### Inputs

- Email and full name: `--email` / `--full-name` (also `--email=...`), or `FIRST_SUPERADMIN_EMAIL` / `FIRST_SUPERADMIN_FULL_NAME`; asked at a prompt when there is a terminal and they are missing.
- **Password: I built BOTH routes** the brief allowed. `FIRST_SUPERADMIN_PASSWORD` (the only way with no terminal) and a **hidden prompt, asked twice** and compared. Why both: the prompt keeps the secret out of the environment and out of history and is the one the founder should use; the variable is needed for a remote shell or script with no tty. **`--password` (any spelling starting `--password`) is refused** with a message that never repeats the value. The variable is deleted from the process's own environment after it is read.
- Validation is the Admin Console's own, read from `create-admin-staff.dto.ts` and `AdminStaffRolesService.createStaff`: email `IsEmail` (class-validator `isEmail`, the same function) and at most 254 characters; full name 1 to 120 after trimming; password at least 8 and at most 128, not trimmed. There was **no difference** between those rules and the brief. All problems are listed at once and the password is never echoed.

### Safety

- **Refuses, exit 1, writes nothing,** when any superadmin already exists (any account status, including deactivated) and when the email is already used by any admin (any role). The check is repeated inside the write: the real store does count, lookup and insert in **one Serializable transaction**, so two simultaneous runs cannot both succeed (proved in the e2e test). A unique violation maps to "email exists", a Serializable conflict to "another run changed the accounts".
- `--dry-run`: validates, inspects the database, writes nothing, hashes nothing, exit 0 only when the real run would not be refused.
- Prints `Database: <name> on <host:port>` (host and database only, never user, password or query string) and asks you to **type the database name** to confirm unless `--yes`. My choice over a plain "yes": it forces reading the line. With no terminal and no `--yes` it refuses.
- Never prints the password or the hash. For an unexpected error only the error class and Prisma/system code are printed, never the message (a database error can echo query values).
- **Exit 0 only when the row exists and verifies:** after the insert it reads the row back and checks role, status, email, that the hash is not the plaintext, and `PasswordService.verify(hash, password)`. A dry run exits 0 when nothing blocks the real run (nothing exists to verify).
- It prints the next step: sign in, then set up two-factor (`docs/first-superadmin.md`, runbook step 6.2).

## Verification

All run on `origin/main` `a31dec6` plus this change, on my **own scratch Postgres database `soccernity_test_firstsa`** (127.0.0.1:5432) and **Redis DB 14**, never the shared `soccernity_test`.

| Check | Result |
|---|---|
| `tsc --noEmit` (services/api) | exit 0 |
| `eslint` on the script and its spec | clean after a CI fix (see the note below) |
| Unit: `src/scripts/create-first-superadmin.spec.ts` | 1 suite / 33 tests, 0 failures (validation, `describeDatabase`, real argon2id success path, refusals, dry run, `--password` refusal, no secrets in output, DB connection closing, interactive path with fake streams) |
| e2e: `test/create-first-superadmin.e2e-spec.ts` (real Postgres, real `AppModule`) | 1 suite / 7 tests, 0 failures: dry run writes nothing; created admin signs in through `POST /admin/auth/login` and a wrong password gets 401; second run refuses; refuses when the email belongs to an editor; two simultaneous runs create exactly one superadmin; invalid input writes nothing |
| `nest build` | exit 0 (took about 15 minutes, the machine was heavily loaded by other sessions); `dist/scripts/create-first-superadmin.js` exists |
| Compiled command run by hand (`node dist/scripts/create-first-superadmin.js`, password in `FIRST_SUPERADMIN_PASSWORD`, `--yes`) | dry run exit 0, nothing written; real run exit 0 and printed `Created superadmin ... The stored password verified.`; second run exit 1 `A superadmin account already exists`; `--password hunter22hunter` exit 1 with a message that does not repeat the value |

Notes: the first e2e attempt failed with 7 hook timeouts at the default 30 s inside `resetDatabase()` (the machine's slow disk, a known issue) and passed 7/7 with `--testTimeout=900000 --forceExit`. The by-hand run covers the three lines of `main()` wiring the e2e does not (it calls the exported `runCli`). The `dotenv` start-up banner (`injected env (27) from ..\..\.env`) is printed by the library and shows no values. The hand run left one admin row in the scratch database only.

**CI correction:** the first push failed the Lint step with 4 `no-undef` errors (`NodeJS` and `BufferEncoding` are not defined under the repo's ESLint 9 flat config). My earlier "eslint clean" was wrong; I had not run the repo's config on it. Fixed by typing the streams with `Readable`/`Writable` from `stream` and dropping the encoding argument; the old version now fails the same lint locally and the new one passes. `tsc` exit 0 and the unit spec 33/33 were re-run after the fix; the e2e and the by-hand run were not repeated (the change is types plus one write argument).

Not run: the full API suites, Playwright.

## Not done / flagged

- `docs/launch-gate-runbook.md`, `docs/build-register.md` and the Build Plan docx are **not edited**, as instructed. R80 updates runbook step 5.5 and question F3 after this merges.
- Run against Neon or any real hosted database: **never**. The doc recommends the direct (unpooled) address for this one write; that is unchecked against a real Neon database.
- The interactive prompts (hidden password, confirmation) are tested with fake streams, not a real terminal; the hidden echo-muting on a real Windows or Linux console is not exercised by any test.
- A Decision Log row or register status line for this command is not written (next docs PR).
