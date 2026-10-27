-- Facturacion electronica (e-CF) de la DGII.
-- Es aditiva: solo agrega columnas opcionales o con valor por defecto y tablas nuevas, asi
-- que la app actual sigue funcionando igual antes y despues de aplicarla.

-- Datos del emisor y ambiente de la DGII por perfil.
ALTER TABLE "AccountProfile" ADD COLUMN "ecfEnvironment" TEXT;
ALTER TABLE "AccountProfile" ADD COLUMN "ecfCommercialName" TEXT;
ALTER TABLE "AccountProfile" ADD COLUMN "ecfMunicipality" TEXT;
ALTER TABLE "AccountProfile" ADD COLUMN "ecfProvince" TEXT;

-- Forma de pago y referencia (notas de credito/debito) en la factura.
ALTER TABLE "Invoice" ADD COLUMN "ecfPaymentForm" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "referenceNcf" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "referenceDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "modificationCode" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "modificationReason" TEXT;

-- Bien (1) o servicio (2) por linea; las existentes quedan como servicio.
ALTER TABLE "InvoiceItem" ADD COLUMN "goodOrService" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE "EcfCertificate" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "encryptedP12" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "serialNumber" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcfCertificate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EcfCertificate_profileId_key" ON "EcfCertificate"("profileId");
ALTER TABLE "EcfCertificate" ADD CONSTRAINT "EcfCertificate_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EcfEmission" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "profileId" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "ecfType" INTEGER NOT NULL,
    "encf" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isSummary" BOOLEAN NOT NULL DEFAULT false,
    "trackId" TEXT,
    "securityCode" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signedXml" TEXT NOT NULL,
    "summaryXml" TEXT,
    "sequenceUsed" BOOLEAN,
    "dgiiMessages" JSONB,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "itbisAmount" DOUBLE PRECISION NOT NULL,
    "receiverStatus" TEXT,
    "receiverMessage" TEXT,
    "receiverAckXml" TEXT,
    "commercialStatus" TEXT,
    "commercialReason" TEXT,
    "commercialAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcfEmission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EcfEmission_invoiceId_key" ON "EcfEmission"("invoiceId");
CREATE INDEX "EcfEmission_profileId_environment_encf_idx" ON "EcfEmission"("profileId", "environment", "encf");
ALTER TABLE "EcfEmission" ADD CONSTRAINT "EcfEmission_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EcfEmission" ADD CONSTRAINT "EcfEmission_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EcfReceivedDocument" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER,
    "environment" TEXT NOT NULL,
    "rncEmisor" TEXT NOT NULL,
    "razonSocialEmisor" TEXT,
    "rncComprador" TEXT NOT NULL,
    "encf" TEXT NOT NULL,
    "ecfType" INTEGER,
    "issueDate" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION,
    "itbisAmount" DOUBLE PRECISION,
    "xml" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "ackStatus" INTEGER NOT NULL,
    "ackReason" INTEGER,
    "ackXml" TEXT NOT NULL,
    "commercialStatus" TEXT,
    "commercialReason" TEXT,
    "commercialXml" TEXT,
    "commercialSentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcfReceivedDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EcfReceivedDocument_environment_rncEmisor_encf_key" ON "EcfReceivedDocument"("environment", "rncEmisor", "encf");
CREATE INDEX "EcfReceivedDocument_profileId_idx" ON "EcfReceivedDocument"("profileId");
ALTER TABLE "EcfReceivedDocument" ADD CONSTRAINT "EcfReceivedDocument_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EcfEvent" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER,
    "environment" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "encf" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcfEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EcfEvent_profileId_createdAt_idx" ON "EcfEvent"("profileId", "createdAt");
ALTER TABLE "EcfEvent" ADD CONSTRAINT "EcfEvent_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "AccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
