-- CreateEnum
CREATE TYPE "RuleAmountOp" AS ENUM ('GT', 'LT', 'GTE', 'LTE', 'EQ');

-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "amountOp" "RuleAmountOp",
ADD COLUMN     "amountValue" INTEGER,
ALTER COLUMN "pattern" DROP NOT NULL;
