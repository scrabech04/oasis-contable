-- CreateTable
CREATE TABLE "AccountProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BUSINESS',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "logoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "Project" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "Quotation" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "Purchase" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "NumberingSequence" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "CompanySettings" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "CompanyIdentity" ADD COLUMN "profileId" INTEGER;
ALTER TABLE "RecurringInvoice" ADD COLUMN "profileId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "CompanySettings_profileId_key" ON "CompanySettings"("profileId");
