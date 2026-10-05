-- security/dob-field-encryption.
-- Step 1 of 2: User.dateOfBirth becomes TEXT so it can hold AES-256-GCM
-- ciphertext. Existing values are converted to UTC ISO-8601 plaintext
-- strings here ONLY as a transient state: the application cannot encrypt
-- inside SQL (the key never enters the database), so step 2 --
-- `node dist/scripts/backfill-dob-encryption.js`, run by Render's
-- preDeployCommand immediately after this migration -- encrypts every row
-- that does not yet start with "v1:". The app's decrypt is strict and
-- refuses plaintext, so no plaintext DOB is ever served.
-- Rollback: see docs/dob-encryption-rollback.md (script --rollback, then
-- the reverse ALTER).
ALTER TABLE "User"
  ALTER COLUMN "dateOfBirth" TYPE TEXT
  USING to_char("dateOfBirth" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
