-- Budget vom Kategorie-Datensatz entkoppeln: eigene Tabelle "Budget".

CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "period" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "categoryId" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Budget_kind_idx" ON "Budget"("kind");
CREATE INDEX "Budget_categoryId_idx" ON "Budget"("categoryId");
CREATE INDEX "Budget_active_idx" ON "Budget"("active");
CREATE INDEX "Budget_deletedAt_idx" ON "Budget"("deletedAt");

ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bestehende Kategorie-Budgets in eigene Budget-Zeilen überführen (nichts geht
-- verloren). Betrag = Jahreswert zurück auf den gewählten Rhythmus gerechnet.
INSERT INTO "Budget" ("id", "title", "kind", "amount", "period", "categoryId", "active", "createdAt")
SELECT
    'bud_' || "id",
    "name",
    "kind",
    CASE "budgetPeriod"
        WHEN 'WEEKLY' THEN ROUND("annualBudget" / 52.0)::INTEGER
        WHEN 'MONTHLY' THEN ROUND("annualBudget" / 12.0)::INTEGER
        WHEN 'QUARTERLY' THEN ROUND("annualBudget" / 4.0)::INTEGER
        ELSE "annualBudget"
    END,
    "budgetPeriod",
    "id",
    true,
    CURRENT_TIMESTAMP
FROM "Category"
WHERE "annualBudget" > 0 AND "deletedAt" IS NULL;

-- Budget-Felder von der Kategorie entfernen.
ALTER TABLE "Category" DROP COLUMN "annualBudget";
ALTER TABLE "Category" DROP COLUMN "budgetPeriod";
