-- Soft-Delete für Kategorien: gelöschte Kategorien bleiben 30 Tage wiederherstellbar.
ALTER TABLE "Category" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Category_deletedAt_idx" ON "Category"("deletedAt");
