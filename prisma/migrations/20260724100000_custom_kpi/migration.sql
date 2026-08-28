-- Benutzerdefinierte Kennzahlen/Widgets
CREATE TABLE "CustomKpi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'net',
    "categoryIds" TEXT[],
    "rangeKind" TEXT NOT NULL DEFAULT 'ytd',
    "customFrom" TIMESTAMP(3),
    "customTo" TIMESTAMP(3),
    "display" TEXT NOT NULL DEFAULT 'number',
    "groupBy" TEXT NOT NULL DEFAULT 'none',
    "size" TEXT NOT NULL DEFAULT 'md',
    "compare" BOOLEAN NOT NULL DEFAULT false,
    "showOnDashboard" BOOLEAN NOT NULL DEFAULT false,
    "showOnReport" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomKpi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomKpi_sortOrder_idx" ON "CustomKpi"("sortOrder");
