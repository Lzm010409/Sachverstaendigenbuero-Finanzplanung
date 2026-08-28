-- Im Tool gelöschte sevDesk-Posten dauerhaft vom Re-Import ausschließen.
CREATE TABLE "IgnoredSevItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "reference" TEXT,
    "counterparty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IgnoredSevItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IgnoredSevItem_source_externalId_key" ON "IgnoredSevItem"("source", "externalId");
