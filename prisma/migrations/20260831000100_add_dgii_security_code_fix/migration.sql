-- Historial de códigos de seguridad corregidos por el buscador de variantes.
-- Es puramente aditivo: no toca ninguna tabla existente. Alimenta la fase futura en la
-- que la búsqueda se ordena según el sesgo de impresión de cada emisor.

CREATE TABLE "DgiiSecurityCodeFix" (
    "id" SERIAL NOT NULL,
    "rncEmisor" TEXT NOT NULL,
    "encf" TEXT NOT NULL,
    "codigoLeido" TEXT NOT NULL,
    "codigoCorrecto" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DgiiSecurityCodeFix_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DgiiSecurityCodeFix_rncEmisor_idx" ON "DgiiSecurityCodeFix"("rncEmisor");
