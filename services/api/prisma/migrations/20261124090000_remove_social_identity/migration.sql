-- Decision Log #479 (founder, 2026-11-08): social sign-in (Google / Facebook, B-084 / B-085) is removed completely.
-- This drops the SocialIdentity table that migration 20261111090000_add_social_identity created.
--
-- SAFETY: the table holds sign-in links between accounts and a provider identity. Dropping it silently would cut
-- those accounts off from a sign-in method, and a social-only account has no password it knows. So this migration
-- REFUSES to run (RAISE EXCEPTION, the whole migration rolls back) if the table has ANY row. The platform is not live
-- and social sign-in was never switched on (it needed OAuth keys nobody added), so the table is expected to be empty.
-- If it is not, stop and decide what to do with those accounts before running this migration again.
--
-- ROLLBACK (manual; only restores the empty table, never the data): re-run the CREATE TABLE / CREATE INDEX / ALTER
-- TABLE statements of 20261111090000_add_social_identity/migration.sql.

DO $$
DECLARE
  linked_rows bigint;
BEGIN
  SELECT count(*) INTO linked_rows FROM "SocialIdentity";
  IF linked_rows > 0 THEN
    RAISE EXCEPTION 'Refusing to drop "SocialIdentity": it still has % row(s). Decision Log #479 removes social sign-in, but these accounts would lose a sign-in method. Resolve them first.', linked_rows;
  END IF;
END
$$;

-- DropTable (its unique index, plain index and foreign key to "User" go with it)
DROP TABLE "SocialIdentity";
