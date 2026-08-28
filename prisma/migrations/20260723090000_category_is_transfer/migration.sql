-- Neutrale/durchlaufende Kategorien (Geldtransfer): zählen nicht als Ein-/Ausgabe.
ALTER TABLE "Category" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;
