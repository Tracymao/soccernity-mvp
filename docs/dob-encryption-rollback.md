# DOB encryption — rollback path

Forward: migration `20261005140000_encrypt_user_date_of_birth` (column -> TEXT, plaintext ISO transient), then
`node services/api/dist/scripts/backfill-dob-encryption.js` (encrypts every row; idempotent).

Rollback (deliberate, documented — not silent):
1. Keep the same `DOB_ENCRYPTION_KEY` available.
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
- **Rotating the key** has no procedure yet (the `v1` prefix exists so one can be written). Rotation would have to
  re-encrypt both the dates of birth and these secrets in one step; doing only one would break the other. Do not rotate
  casually.
- A boot check (B-252) already refuses to start in production when the key is unset or not exactly 32 bytes. It cannot
  tell a wrong key from a right one, so a wrong-but-valid key boots and then fails at the first read.
