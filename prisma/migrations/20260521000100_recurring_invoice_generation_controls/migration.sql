ALTER TABLE "RecurringInvoice" ADD COLUMN "dueDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Invoice" ADD COLUMN "recurringInvoiceId" INTEGER;

CREATE UNIQUE INDEX "Invoice_recurringInvoiceId_date_key" ON "Invoice"("recurringInvoiceId", "date");
