-- Überkategorien: Kennzeichen für die reine Gliederungsebene + Index auf der
-- bereits vorhandenen Selbstreferenz parentId.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category"("parentId");
