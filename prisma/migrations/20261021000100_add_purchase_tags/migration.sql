-- Etiquetas libres en compras, independientes de proyectos
ALTER TABLE "Purchase" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
