-- AlterTable
ALTER TABLE "OpenItem" ADD COLUMN     "reminderLevel" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ForecastSnapshot" (
    "id" TEXT NOT NULL,
    "takenOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetMonth" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "projectedLiquidity" INTEGER NOT NULL,
    "actualLiquidity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForecastSnapshot_targetMonth_horizonDays_key" ON "ForecastSnapshot"("targetMonth", "horizonDays");

-- CreateIndex
CREATE INDEX "ForecastSnapshot_takenOn_idx" ON "ForecastSnapshot"("takenOn");
