-- Rhythmus fürs Kategorie-Budget (intern bleibt annualBudget der Jahreswert).
CREATE TYPE "BudgetPeriod" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
ALTER TABLE "Category" ADD COLUMN "budgetPeriod" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY';
-- Bestehende Budgets wurden als Jahreswert erfasst -> als jährlich markieren,
-- damit sich angezeigte Beträge nicht ändern. Neue Kategorien: monatlich.
UPDATE "Category" SET "budgetPeriod" = 'YEARLY' WHERE "annualBudget" > 0;
