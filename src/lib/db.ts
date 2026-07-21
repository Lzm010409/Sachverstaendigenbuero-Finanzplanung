import { PrismaClient } from "@prisma/client";

// Prisma-Client als Singleton, damit im Dev-Modus (Hot Reload) nicht
// bei jedem Reload eine neue Verbindung aufgebaut wird.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
