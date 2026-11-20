-- B-023 (Decision Log #368): country storage on User -- declared code, derived
-- code, derivation method, timestamp. Purely additive on "User"; the IP used to
-- derive the country is never stored. "Guardian"."declaredCountry" is NOT
-- dropped here (expand/contract): it is copied across below, no longer written
-- by the application, and removed by a later migration.

ALTER TABLE "User"
  ADD COLUMN "declaredCountry" TEXT,
  ADD COLUMN "derivedCountry" TEXT,
  ADD COLUMN "countryDerivationMethod" TEXT,
  ADD COLUMN "countryDerivedAt" TIMESTAMP(3);

-- Carry existing self-declared values over to the new home. Guardian rows only
-- exist for minors, so this is the only place a legacy declared country lives.
UPDATE "User" u
SET "declaredCountry" = g."declaredCountry"
FROM "Guardian" g
WHERE g."minorUserId" = u."id"
  AND g."declaredCountry" IS NOT NULL
  AND g."declaredCountry" ~ '^[A-Z]{2}$';

ALTER TABLE "User" ADD CONSTRAINT "User_declaredCountry_format_check"
  CHECK ("declaredCountry" IS NULL OR "declaredCountry" ~ '^[A-Z]{2}$');
ALTER TABLE "User" ADD CONSTRAINT "User_derivedCountry_format_check"
  CHECK ("derivedCountry" IS NULL OR "derivedCountry" ~ '^[A-Z]{2}$');

-- The three derivation columns move together: all NULL (never derived),
-- resolved (method + code + time), or unresolved (method + time, no code).
ALTER TABLE "User" ADD CONSTRAINT "User_country_derivation_coherent_check"
  CHECK (
    ("countryDerivationMethod" IS NULL AND "derivedCountry" IS NULL AND "countryDerivedAt" IS NULL)
    OR ("countryDerivationMethod" = 'geolite2_local' AND "derivedCountry" IS NOT NULL AND "countryDerivedAt" IS NOT NULL)
    OR ("countryDerivationMethod" = 'unresolved' AND "derivedCountry" IS NULL AND "countryDerivedAt" IS NOT NULL)
  );
