ALTER TABLE "Quotation" ADD COLUMN "termsAndConditions" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "includeCoverPage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quotation" ADD COLUMN "includeTermsPage" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invoice" ADD COLUMN "termsAndConditions" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "includeCoverPage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD COLUMN "includeTermsPage" BOOLEAN NOT NULL DEFAULT false;
