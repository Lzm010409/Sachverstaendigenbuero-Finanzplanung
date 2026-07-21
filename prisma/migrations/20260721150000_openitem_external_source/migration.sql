-- AlterTable
ALTER TABLE "OpenItem" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OpenItem_source_externalId_key" ON "OpenItem"("source", "externalId");

