ALTER TABLE "CompanySettings" ADD COLUMN "incomeTaxRegime" TEXT NOT NULL DEFAULT 'LEGAL_ENTITY';
ALTER TABLE "CompanySettings" ADD COLUMN "incomeTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.27;

UPDATE "CompanySettings"
SET "incomeTaxRegime" = 'PERSON_PROGRESSIVE',
    "incomeTaxRate" = 0.25
WHERE "profileId" IN (
  SELECT "id"
  FROM "AccountProfile"
  WHERE "type" = 'PERSON'
);
