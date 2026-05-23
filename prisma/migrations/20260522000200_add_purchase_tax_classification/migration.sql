ALTER TABLE "Purchase" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "Purchase" ADD COLUMN "taxTreatment" TEXT NOT NULL DEFAULT 'LOCAL_CREDIT';
ALTER TABLE "Purchase" ADD COLUMN "hasFiscalCredit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Purchase" ADD COLUMN "report606" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Purchase" ADD COLUMN "report609" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Purchase" ADD COLUMN "affectsISR" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Purchase"
SET
  "origin" = CASE WHEN "type" = 'INFORMAL' THEN 'LOCAL' ELSE 'LOCAL' END,
  "taxTreatment" = CASE WHEN "type" = 'INFORMAL' THEN 'LOCAL_NO_CREDIT' ELSE 'LOCAL_CREDIT' END,
  "hasFiscalCredit" = CASE WHEN "type" = 'INFORMAL' THEN false ELSE true END,
  "report606" = CASE WHEN "type" = 'INFORMAL' THEN false ELSE true END,
  "report609" = false,
  "affectsISR" = true;
