# DOB encryption — rollback path

Forward: migration `20261005140000_encrypt_user_date_of_birth` (column -> TEXT, plaintext ISO transient), then
`node services/api/dist/scripts/backfill-dob-encryption.js` (encrypts every row; idempotent).

Rollback (deliberate, documented — not silent):
1. Keep the same `DOB_ENCRYPTION_KEY` available.
2. `node services/api/dist/scripts/backfill-dob-encryption.js --rollback` — decrypts every row back to plaintext ISO strings (idempotent).
3. `ALTER TABLE "User" ALTER COLUMN "dateOfBirth" TYPE TIMESTAMP(3) USING "dateOfBirth"::timestamp;`
4. Redeploy the previous application version.

Rolling back leaves DOBs unprotected at rest. Losing the key without a rollback makes DOBs unrecoverable — back it up with the other secrets.
