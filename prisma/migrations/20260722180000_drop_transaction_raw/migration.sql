-- Spalte "raw" entfernen: sie speicherte pro Umsatz die komplette Rohzeile
-- (bzw. Importquelle) und verbraucht unnötig Speicher. Nicht mehr benötigt.
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "raw";
