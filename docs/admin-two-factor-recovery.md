# Admin two-factor: the last-superadmin recovery

**Status:** written with the build of admin two-factor (build-register rows B-086 and B-270, Decision Log #446). The SQL below is run by an automated test (`services/api/test/two-factor.e2e-spec.ts`, "the last-superadmin database recovery") against a real database, so the block as written is the block that was proven. It has **not** been run against a real Neon database, and it is not part of the launch runbook yet (B-180 will fold it in).

## What this is for

Every admin must sign in with a password **and** a code from an authenticator app (when `ADMIN_2FA_ENFORCED` is `true`). If an admin loses their phone, they use one of their 10 backup codes. If they have lost those too, **another superadmin** resets their two-factor (the API route `POST /admin/staff/:id/two-factor/reset`; the Admin Console button for it is the screen work of B-271, not built yet); nobody can reset their own.

That leaves one case the app cannot fix by itself: **the only superadmin has lost both the phone and the backup codes**, so there is no one left to do the reset. This document is the way out. It is a direct change to the database, done by the person who owns the database.

## When you may use it

Use it **only when all of these are true**:

1. The admin who is locked out is a **superadmin**.
2. **No other active superadmin** can sign in to do the normal reset. (If one can, use that reset instead. It also ends the locked-out admin's sessions and leaves a proper audit entry. Run Step 0 below to see who the active superadmins are.)
3. The admin has lost **both** their authenticator device and their backup codes.
4. You are certain the person asking really is that admin. For a company with one founder-superadmin this is usually you, asking for yourself. If someone else is asking for it, confirm it with them by a channel you already trust (a phone call), not by email alone.

## Who may run it

**Only the person who owns the production database** (today: the founder, through the Neon dashboard). Nobody else should have this access. Do not hand the connection string to anyone for this.

## Before you start

- Open the **Neon dashboard > your production project > SQL Editor**. Check the database name at the top says production, not staging. (Staging has the same table names.)
- Have the locked-out superadmin's **sign-in email address** ready, in **lower case**.

### Step 0: look before you change anything (read-only)

Paste this and run it. It only reads.

```sql
SELECT "email", "role", "accountStatus",
       "totpEnabledAt" IS NOT NULL AS "hasTwoFactor",
       (SELECT COUNT(*) FROM "AdminBackupCode" b WHERE b."adminId" = a."id" AND b."usedAt" IS NULL) AS "unusedBackupCodes"
FROM "AdminUser" a
WHERE "role" = 'superadmin'
ORDER BY "email";
```

Read the result:

- If **another** row has `accountStatus` = `active` and that person can sign in, **stop** and use the Admin Console reset instead.
- If the only `active` superadmin is the locked-out one, carry on.

### Step 1: the recovery (this changes the database)

Replace `REPLACE-WITH-THE-SUPERADMIN-EMAIL` with the email, **in all three places**, keeping the single quotes. Then run the whole block at once. It runs as one transaction: either all of it happens or none of it does.

```sql
-- RECOVERY-SQL-BEGIN
BEGIN;
DELETE FROM "AdminBackupCode"
 WHERE "adminId" IN (SELECT "id" FROM "AdminUser" WHERE "email" = 'REPLACE-WITH-THE-SUPERADMIN-EMAIL' AND "role" = 'superadmin');
UPDATE "AdminUser"
   SET "totpSecretEncrypted" = NULL, "totpEnabledAt" = NULL, "totpLastUsedStep" = NULL
 WHERE "email" = 'REPLACE-WITH-THE-SUPERADMIN-EMAIL' AND "role" = 'superadmin';
INSERT INTO "AdminActionLog" ("id", "adminId", "action", "targetType", "targetId", "notes")
SELECT gen_random_uuid()::text, "id", 'admin_user.two_factor_reset', 'admin_user', "id", 'database_recovery'
  FROM "AdminUser"
 WHERE "email" = 'REPLACE-WITH-THE-SUPERADMIN-EMAIL' AND "role" = 'superadmin';
COMMIT;
-- RECOVERY-SQL-END
```

What each statement does:

1. Deletes that superadmin's backup codes.
2. Clears their authenticator secret, so they are no longer enrolled. (Their password is **not** touched.)
3. Writes the audit entry the app would have written (`admin_user.two_factor_reset`, note `database_recovery`), so the reset shows up in the audit log like any other. The "who did it" column shows the superadmin themselves, because no other admin account was involved; the note `database_recovery` is what tells a reader it was done in the database.

If you typed the email wrongly (or the role is not `superadmin`), the statements simply match nothing and change nothing, and no audit entry is written. Run Step 2 to confirm it worked.

### Step 2: check that it worked (read-only)

```sql
SELECT "email", "totpEnabledAt" IS NULL AS "twoFactorCleared"
FROM "AdminUser" WHERE "email" = 'REPLACE-WITH-THE-SUPERADMIN-EMAIL';

SELECT COUNT(*) AS "backupCodesLeft" FROM "AdminBackupCode"
WHERE "adminId" IN (SELECT "id" FROM "AdminUser" WHERE "email" = 'REPLACE-WITH-THE-SUPERADMIN-EMAIL');

SELECT "createdAt", "action", "notes" FROM "AdminActionLog"
WHERE "action" = 'admin_user.two_factor_reset' ORDER BY "createdAt" DESC LIMIT 3;
```

You should see: `twoFactorCleared` = `true`, `backupCodesLeft` = `0`, and a fresh row with note `database_recovery`.

Also glance at the other admins' state with the Step 0 query (change `"role" = 'superadmin'` to remove the filter): **no other admin's two-factor should have changed.**

### Step 3 (optional): end the old sessions

The SQL above **cannot** end the admin's existing sign-ins (those live in Redis, not in the database). The admin's access token lasts up to 15 minutes, and their refresh sign-in lasts up to 7 days. Do this step **only if you think the lost device is in someone else's hands**.

In the Upstash console (the CLI / Data Browser for the production Redis database), with the admin's id from Step 0 (`SELECT "id" FROM "AdminUser" WHERE "email" = '...'`):

```
SMEMBERS admin:refresh:admin:<the-admin-id>
```

For each id it lists, run `DEL admin:refresh:token:<that-id>`; then `DEL admin:refresh:admin:<the-admin-id>`.

If a stolen device is the worry, also change the admin's password once they are back in (Admin Console > Profile > Change password): that ends all their other sessions.

### Step 4: the admin signs back in

With `ADMIN_2FA_ENFORCED` = `true` (it must be in production), the next sign-in with the **password** shows the enrolment screen instead of letting them in: they scan a new QR code with an authenticator app, type the first code, and are shown **10 new backup codes once**. Tell them to save the codes somewhere safe and separate from their phone (a password manager). The old codes and old secret are gone for good.

## What this does not do

- It does not reset the **password**. If the password is lost too, this document does not help.
- It does not email anyone and does not tell the admin anything.
- It does not end existing sessions (Step 3 does, by hand).
- It is a **database change made outside the app**. Treat the connection to production like any other privileged access: make the change, check it, close the window.

## If the encryption key is ever lost or changed

The authenticator secrets are stored encrypted with `DOB_ENCRYPTION_KEY` (the same key as dates of birth). If that key is lost or replaced, **every** stored secret becomes unreadable and no one can sign in with a code. That case needs this recovery run for **every** enrolled superadmin, and a reset of every other enrolled account. See `docs/dob-encryption-rollback.md`.
