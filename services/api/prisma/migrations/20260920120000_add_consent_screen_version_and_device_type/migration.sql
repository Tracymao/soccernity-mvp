-- Decision Log #348: UK GDPR Art. 7(1) evidentiary record. Purely additive,
-- nullable, no backfill (existing rows genuinely have neither value).
ALTER TABLE "Guardian" ADD COLUMN "consentScreenVersion" TEXT;
ALTER TABLE "Guardian" ADD COLUMN "consentDeviceType" TEXT;
ALTER TABLE "ConsentAuditRecord" ADD COLUMN "consentScreenVersion" TEXT;
ALTER TABLE "ConsentAuditRecord" ADD COLUMN "deviceType" TEXT;
