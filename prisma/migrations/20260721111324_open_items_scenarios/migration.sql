-- CreateEnum
CREATE TYPE "OpenItemKind" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateTable
CREATE TABLE "OpenItem" (
    "id" TEXT NOT NULL,
    "kind" "OpenItemKind" NOT NULL,
    "counterparty" TEXT NOT NULL DEFAULT '',
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" TIMESTAMP(3),
    "categoryId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inflowFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "outflowFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "inflowShiftDays" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpenItem_paid_dueDate_idx" ON "OpenItem"("paid", "dueDate");

-- AddForeignKey
ALTER TABLE "OpenItem" ADD CONSTRAINT "OpenItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
