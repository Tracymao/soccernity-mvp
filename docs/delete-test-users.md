# Deleting test users from a database (`delete-test-users`)

**Use this ONLY for test data on staging or a local database.** Never on production, never on real people. The command refuses when `NODE_ENV=production`, but on Render staging `NODE_ENV` is also `production`, so run it from your own computer with the staging database address in your shell environment (see below). `--expect-database` is the guard that makes sure you are pointing at the database you mean.

It deletes the users you name by email, plus every row that blocks their deletion (many tables point at a user with ON DELETE RESTRICT). It does NOT touch R2 files or Redis keys: it lists them for you to clean by hand.

## Run it (dry run first)

From `services/api`, after `npm run build`:

```
DATABASE_URL=<database address> npm run delete-test-users -- --expect-database=<database name> --email tester1@example.com --email tester2@example.com
```

Emails can also come from a file, one per line (`#` comments and blank lines ignored): `--emails-file ./test-users.txt`. Emails are lowercased; there are no wildcards and no "all". An empty list is refused. At most 200 users per run.

The dry run prints the database name only (never the address, host, user or password), then for each user: id, email, status, created date, the number of rows in every table that would be deleted, any row it would keep with a link cleared, every email not found, and the R2 and Redis to-do list. It writes nothing (it runs in a read-only transaction).

## Execute

When the dry run lists exactly what you expect:

```
DATABASE_URL=<database address> npm run delete-test-users -- --expect-database=<database name> --email tester1@example.com --execute --confirm=1
```

`--confirm` must be the exact number of users you listed. Execute needs BOTH `--execute` and `--confirm=<n>`. An email that does not exist stops the run unless you add `--allow-missing`. Everything happens in one transaction: if any step fails, nothing is deleted, and the error names only the table and constraint, never row values. On success one line is printed: timestamp, database name, number of users, rows per table (no emails, no ids).

## What it refuses (before writing anything)

- `NODE_ENV=production`, a missing or wrong `--expect-database`, a missing or wrong `--confirm`, no emails.
- A user linked to an Admin Console account (an AdminUser with the same email).
- A guardian or minor whose related account is not also on the list.
- A user's content that OTHER users (not listed) have interacted with (liked, commented on, saved, replied to), unless you add `--include-others-content`, which deletes those interactions too.

A report the test user filed about someone else's content is kept with the reporter cleared (set to NULL). Everything else that blocks deletion is deleted first, then the user.

## After it runs: the to-do list (NOT done by the script)

- R2: delete the files under `private-media/<userId>/`, `private-profile/<userId>/`, `quarantine/`, `data-export/<userId>/`, `post-media/<userId>/`, `profile-media/<userId>/`, `media/<userId>/` (and the legacy `avatars/`, `covers/`). Object keys stored in the deleted rows are also listed.
- Redis: delete `auth:refresh:user:<id>`, `auth:revoked-at:user:<id>`, `2fa:*:user:<id>` and `guardian-security-notice:*:<id>`. The `auth-limit:*` keys are hashed and expire on their own.

## Rules

- Staging test data only. Do not run this against production or against an account that belongs to a real person.
- Run the dry run first, read it, then execute. Never reuse an old `--confirm`.
- It is not audited in the database (no AdminActionLog row); keep the printed line if you need a record.
