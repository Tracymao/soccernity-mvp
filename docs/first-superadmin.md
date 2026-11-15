# Creating the first superadmin

For the founder. One command creates the **first** Admin Console account. Every later admin is created from the Admin Console itself (Settings > Roles > Add Role, superadmin only), so this command is used **once per environment**: once on staging, once on production.

It is not a way to add more admins and it is not a password reset. If any superadmin already exists it refuses and writes nothing.

## Before you start

- The database for that environment exists and its migrations have been applied (runbook Part 5).
- You have its `DATABASE_URL` from the host (for Neon, the **direct** connection address is the safer choice for this one-off write; this was not checked against a real Neon database).
- A computer with this repository, `npm install` done. Build the API once so the command exists:

```powershell
cd services\api
npm run build
```

## Run it

Set the database for this window only, then do a **dry run** first. The dry run checks everything and writes nothing.

```powershell
$env:DATABASE_URL = '<paste the DATABASE_URL for staging or production>'
npm run create-first-superadmin -- --email you@yourdomain.com --full-name "Your Name" --dry-run
```

If it says `Dry run: the inputs are valid and nothing blocks the real run`, run it for real (leave off `--dry-run`):

```powershell
npm run create-first-superadmin -- --email you@yourdomain.com --full-name "Your Name"
```

It then:

1. Asks for the password, **hidden**, and asks again to be sure they match. At least 8 characters, at most 128. Use a long one from your password manager.
2. Prints `Database: <name> on <host>` and asks you to **type the database name** to confirm. Read that line: it is the only check that you are about to write to staging and not production (or the other way round). Credentials are never shown.
3. Creates the account and checks it by reading it back and testing the password against the stored hash.

When it works you see `Created superadmin <email> (id ...). The stored password verified.` and the exit code is 0.

Afterwards, clear the setting from the window:

```powershell
Remove-Item Env:DATABASE_URL
```

### Other ways to give the inputs

- **The password is never an argument** (it would be kept in your shell history). The command refuses `--password`. You can instead set `FIRST_SUPERADMIN_PASSWORD` for the run, which is the only way when there is no terminal to type into.
- Email and name can also come from `FIRST_SUPERADMIN_EMAIL` and `FIRST_SUPERADMIN_FULL_NAME`.
- With no terminal at all (a script, a remote shell without a tty) you must also pass `--yes`, because there is nobody to type the confirmation. Only do that after you have run `--dry-run` and read the database line.

## If it refuses

It always says why and writes nothing (exit code 1).

| Message starts | Meaning | What to do |
|---|---|---|
| `A superadmin account already exists` | A superadmin is already in this database, in any state (even a deactivated one). | Sign in with it, or use the recovery document if you are locked out: `docs/admin-two-factor-recovery.md`. Do not run this again. |
| `An admin account with this email already exists` | That email is already an admin (any role). | Use a different email, or sign in with that account. |
| `Another run changed the admin accounts at the same moment` | Two runs overlapped. | Check the database for the new row, then run again only if there is none. |
| `Invalid input: ...` | The email, name or password broke a rule (all problems are listed). | Fix and run again. The rules are the same as the Admin Console's Add Role form. |
| `DATABASE_URL is not set...` | No usable database address. | Set it as above. |
| `There is no terminal to confirm on` | Run without a terminal and without `--yes`. | Add `--yes` after checking the database line, or run it in a normal terminal. |

If you did not set `DATABASE_URL` in the window, the command falls back to the one in the repository's root `.env`, which is your **local development** database. The `Database:` line and the confirmation question exist so you notice this.

## After it succeeds: set up two-factor now

1. Open the Admin Console for that environment and sign in with the new email and password.
2. Set up two-factor straight away and save the 10 backup codes in your password manager (runbook step 6.2).
3. `ADMIN_2FA_ENFORCED` is switched to `true` at the launch gate (runbook steps 6.2 and 8.6). On production, enrol the first superadmin the day-one way described in runbook step 9.5.
4. Keep `docs/admin-two-factor-recovery.md` to hand. It is the way back in if the only superadmin ever loses both the phone and the backup codes.

## What this command never does

It does not print the password or the hash, it does not change any existing admin, it has no reset or "make admin" mode, and it does not touch the schema, the Admin Console or any endpoint.
