-- CreateTable
CREATE TABLE "ScenarioCategoryAdjustment" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "ScenarioCategoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioCategoryAdjustment_scenarioId_categoryId_key" ON "ScenarioCategoryAdjustment"("scenarioId", "categoryId");

-- AddForeignKey
ALTER TABLE "ScenarioCategoryAdjustment" ADD CONSTRAINT "ScenarioCategoryAdjustment_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioCategoryAdjustment" ADD CONSTRAINT "ScenarioCategoryAdjustment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
