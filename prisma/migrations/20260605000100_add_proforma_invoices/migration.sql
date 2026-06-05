CREATE TABLE "ProformaInvoice" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contactId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "title" TEXT,
    "subtitle" TEXT,
    "notes" TEXT,
    "termsAndConditions" TEXT,
    "includeCoverPage" BOOLEAN NOT NULL DEFAULT false,
    "includeTermsPage" BOOLEAN NOT NULL DEFAULT false,
    "profileId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProformaInvoiceItem" (
    "id" SERIAL NOT NULL,
    "proformaInvoiceId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProformaInvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProformaInvoice_number_key" ON "ProformaInvoice"("number");
CREATE INDEX "ProformaInvoice_profileId_idx" ON "ProformaInvoice"("profileId");
CREATE INDEX "ProformaInvoice_contactId_idx" ON "ProformaInvoice"("contactId");
CREATE INDEX "ProformaInvoice_projectId_idx" ON "ProformaInvoice"("projectId");
CREATE INDEX "ProformaInvoiceItem_proformaInvoiceId_idx" ON "ProformaInvoiceItem"("proformaInvoiceId");

ALTER TABLE "Invoice" ADD COLUMN "proformaInvoiceId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "proformaInvoiceId" INTEGER;

ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoiceItem" ADD CONSTRAINT "ProformaInvoiceItem_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
