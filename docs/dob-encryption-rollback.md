# DOB encryption — rollback path

Forward: migration `20261005140000_encrypt_user_date_of_birth` (column -> TEXT, plaintext ISO transient), then
`node services/api/dist/scripts/backfill-dob-encryption.js` (encrypts every row; idempotent).

Rollback (deliberate, documented — not silent):
1. Keep the same `DOB_ENCRYPTION_KEY` (and, if a rotation has happened, `DOB_ENCRYPTION_KEY_VERSION` and any `DOB_ENCRYPTION_KEY_PREVIOUS`) available.
2. `node services/api/dist/scripts/backfill-dob-encryption.js --rollback` — decrypts every row back to plaintext ISO strings (idempotent).
3. `ALTER TABLE "User" ALTER COLUMN "dateOfBirth" TYPE TIMESTAMP(3) USING "dateOfBirth"::timestamp;`
4. Redeploy the previous application version.

Rolling back leaves DOBs unprotected at rest. Losing the key without a rollback makes DOBs unrecoverable — back it up with the other secrets.

## The same key also protects the two-factor secrets (B-086, B-270; Decision Log #405 item 8, #446)

`DOB_ENCRYPTION_KEY` encrypts two things now, with the same code (`DobEncryptionService`) and the same stored format
(`v1:<iv>:<tag>:<ciphertext>`):

- `User.dateOfBirth`, and
- the authenticator-app (TOTP) secret in `User.totpSecretEncrypted` and `AdminUser.totpSecretEncrypted`.

Consequences, so nobody has to rediscover them:

- **If the key is lost, or replaced with a different value, every stored two-factor secret becomes unreadable** (the
  authentication tag fails). A six-digit authenticator code is checked against the decrypted secret, so for every enrolled
  account that check **errors** (the server answers with an error and logs it, rather than quietly refusing, so the problem
  is loud). Backup codes are stored as separate hashes, not encrypted with this key, so they still verify and are the
  only way in until the accounts are reset. Recovery is a **reset and re-enrol of
  every enrolled account**: users turn two-factor off and on again (or an admin does it for them in the database by
  clearing the three `totp*` columns and the `UserBackupCode` rows), and every enrolled admin needs the peer reset or
  `docs/admin-two-factor-recovery.md`.
- **There is no rollback script for the two-factor secrets**, unlike date of birth above: a secret is never stored in
  plaintext, so there is nothing safe to "decrypt back". To remove two-factor entirely, run the migration's rollback note
  (`20261105090000_add_two_factor`), which drops the columns and tables and puts every account back to password-only.
- A boot check (B-252) already refuses to start in production when the key is unset or not exactly 32 bytes. It cannot
  tell a wrong key from a right one, so a wrong-but-valid key boots and then fails at the first read.

## Rotating the key

Why you would: the key is thought to have leaked, a person who had it has left, or a routine yearly change. This is a
deliberate, planned operation, not something to do casually. **These are the defaults the work was built on; the founder
can change them.**

### How it works (so the steps make sense)

- Every stored value looks like `v<N>:<iv>:<tag>:<ciphertext>`. **`N` says which key made it.** Today every value is `v1`.
- Three settings describe the keys. Two are optional and **unset means "one key, version 1"**, so nothing changes for a
  deployment that never rotates:
  - `DOB_ENCRYPTION_KEY` — the **current** key. New values are always written with this one.
  - `DOB_ENCRYPTION_KEY_VERSION` — the current key's number `N` (default 1; a positive whole number).
  - `DOB_ENCRYPTION_KEY_PREVIOUS` — the key of version `N-1`, set **only during a rotation**.
- While both keys are live, **nothing has to stop and nothing races with writes**: a value is read with the key its own
  `v<N>` names (current or previous), and every write uses the current key. A value at any other version, or at the previous
  version when no previous key is set, **fails loudly** (it is never guessed at with the wrong key).
- The re-encrypt script rewrites everything still at the old version, in **all three columns together**:
  `User.dateOfBirth`, `User.totpSecretEncrypted`, `AdminUser.totpSecretEncrypted`. Do not rotate only some of them.
- **There is no automatic undo.** A rollback is another rotation (see the end).

### Procedure (do staging first, then production; each has its own key)

0. **Before you start.** Take a database backup or snapshot (in Neon: a branch or a point-in-time restore point). Note the
   current key somewhere safe: it stays needed until step 6. Pick a quiet time: during the deploy in step 2 the old and new
   server run side by side for a minute or two, and the old one cannot read a value the new one has just written.
   Check where you are with the dry run (see "Running the script" below): it should show every value at the current version.
1. **Generate the new key** (a different one from the old key, never reused):
   `openssl rand -base64 32`. Save it in the password manager as, for example, "DOB key v2 (staging)", next to the old one.
   Do not delete the old key.
2. **Set the three settings in Render and redeploy** (all in the service's Environment tab):
   - `DOB_ENCRYPTION_KEY_PREVIOUS` = the **old** key value,
   - `DOB_ENCRYPTION_KEY` = the **new** key value,
   - `DOB_ENCRYPTION_KEY_VERSION` = `2` (the next whole number for each later rotation: 3, 4, ...).

   Set all three in the **same save** and deploy once. *What to check:* the deploy goes live (the app refuses to start if a
   setting is malformed, if the previous key is the same as the new one, or if a previous key is set while the version is
   still 1 — the log says which setting; it never prints a key); the pre-deploy line `DOB encryption backfill: scanned=...
   changed=0` shows nothing was changed (it must not touch the `v1` values); signing in as an existing test account and
   opening its profile still works (it reads a `v1` value with the previous key); if you have an account with two-factor,
   sign in with a code. A new sign-up now stores a `v2` value.
3. **Run the dry run, then the real run** (next section). The dry run prints how many values are at each version and writes
   nothing. *What to check:* the three columns show `v1=<n>` (to do) and possibly `v2=<n>` (already new), with
   `unrecognised=0 no-key-for-version=0 cannot-decrypt=0`. If any of those three is not 0 the script will refuse to write
   and exits with a non-zero code; fix the key settings first (the output says what it found).
4. **Verify.** The real run ends by reading every value again **and decrypting it**. *What to check:* the last line is
   `OK: every value is at the current key version and readable.` and the command's exit code is 0; the "After" counts show
   only `v2=...`. If it says `NOT DONE`, run it again (it picks up where it stopped); values the application changed while
   the script was running are counted as "skipped" and are picked up by the re-run. Then spot-check again: sign in, open a
   profile, sign in with a two-factor code, start a new two-factor enrolment and confirm it.
5. **Remove `DOB_ENCRYPTION_KEY_PREVIOUS`** from the Environment tab and redeploy. Leave `DOB_ENCRYPTION_KEY` and
   `DOB_ENCRYPTION_KEY_VERSION` (still `2`) exactly as they are — **never lower or delete the version number** after a
   rotation, or the app will not be able to read its own values. *What to check:* it deploys, and the same spot-checks work.
   (If the previous key was removed too early the app still starts, because it cannot know what is in the database; reads of
   old values then fail loudly. Put the previous key back and redeploy.)
6. **Keep a copy of the old key** until step 4 has been checked, and **as long as you keep any database backup taken before
   the rotation**: a restored old backup holds `v1` values that only the old key can open. Only then retire the old key.

### Running the script

The script needs the database address and the same key settings, and uses nothing else.

- *On a machine of yours* (works for the free staging plan, which has no Render shell): `npm install`, then
  `npm run build --workspace=services/api`, then, in the same terminal, set `DATABASE_URL`, `DOB_ENCRYPTION_KEY`,
  `DOB_ENCRYPTION_KEY_VERSION` and `DOB_ENCRYPTION_KEY_PREVIOUS` to the values from step 2 and run
  `node services/api/dist/scripts/rotate-dob-encryption-key.js --dry-run` and then the same command without `--dry-run`.
- *In Render's Shell tab* (a paid service): the settings are already there; run the same two `node ...` commands.

Neither route has been run against a real Render or Neon account (none exists yet): the first time, run the dry run on
staging and read its output before anything else.

What the script guarantees: it checks **every** value before writing anything and stops with **no writes** and a non-zero
exit if any value cannot be read with the keys you gave it; it can be run again at any point; it writes each value only if
it is still the value it read; it prints **counts only**, never a date, a secret or a key. (Rewriting an admin's row also updates `AdminUser.updatedAt`, like any other update.)

### Two-factor enrolments in progress

A two-factor enrolment that is half done is held in Redis for 10 minutes, encrypted with the key of that moment, and the
script does not rewrite it. If a rotation finishes in the middle of someone's enrolment and that value can no longer be read,
it is treated exactly like an expired enrolment ("Start enrolment first, or it has expired"): they start again. No error,
and it does not count as a wrong code.

### Undoing a rotation

There is no undo command. To go back to the old key, do another rotation: set `DOB_ENCRYPTION_KEY` to the old key's value
with the **next** version number (3 after a first rotation), `DOB_ENCRYPTION_KEY_PREVIOUS` to the current key, redeploy, run
the script, verify, remove the previous key.

### Other places that assumed a key version

For whoever touches this later: the `v1`-only assumption existed in the stored-format check (`isEncryptedDob`), in
`decryptDobString`, and in the pre-deploy backfill (which would have encrypted a `v2` value a second time as if it were
plaintext). All now accept any `v<digits>:` prefix. The two-factor secrets and the date of birth go through the same
functions, so one change covers both.
