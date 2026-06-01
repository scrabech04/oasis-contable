ALTER TABLE "Purchase" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'DOP';
ALTER TABLE "Purchase" ADD COLUMN "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Purchase" ADD COLUMN "sourceSubtotal" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN "sourceTax" DOUBLE PRECISION;
ALTER TABLE "Purchase" ADD COLUMN "sourceTotal" DOUBLE PRECISION;
ALTER TABLE "Subscription" ADD COLUMN "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1;
UPDATE "Subscription" SET "currency" = 'DOP' WHERE "currency" = 'RD$';
UPDATE "Subscription" SET "exchangeRate" = 1 WHERE "exchangeRate" IS NULL;
UPDATE "Purchase" SET "currency" = 'DOP', "exchangeRate" = 1 WHERE "currency" IS NULL;
