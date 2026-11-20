-- sprint-1/coppa-card-verification. Purely additive. cardVerificationRequired
-- defaults to false so every existing Guardian row keeps the email-link-only
-- flow; the rest are nullable, never backfilled.
ALTER TABLE "Guardian" ADD COLUMN "declaredCountry" TEXT;
ALTER TABLE "Guardian" ADD COLUMN "cardVerificationRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Guardian" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "Guardian" ADD COLUMN "cardVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Guardian" ADD COLUMN "cardRefundedAt" TIMESTAMP(3);
ALTER TABLE "Guardian" ADD COLUMN "consentVerificationMethod" TEXT;
ALTER TABLE "Guardian" ADD COLUMN "consentVerificationAt" TIMESTAMP(3);
ALTER TABLE "ConsentAuditRecord" ADD COLUMN "verificationMethod" TEXT;
ALTER TABLE "ConsentAuditRecord" ADD COLUMN "verificationAt" TIMESTAMP(3);
