-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PERSON', 'ORG');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'pipedrive',
    "externalId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "orgName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_source_externalId_key" ON "Contact"("source", "externalId");
