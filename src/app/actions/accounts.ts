"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import { startOfDayUTC } from "@/lib/dates";
import type { FormState } from "./types";

const schema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  type: z.enum(["CHECKING", "SAVINGS", "CASH", "CREDIT"]),
  iban: z.string().optional(),
  openingBalance: z.string().optional(),
  openingDate: z.string().optional(),
});

export async function createAccount(formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { name, type, iban, openingBalance, openingDate } = parsed.data;
  await prisma.account.create({
    data: {
      name,
      type,
      iban: iban || null,
      openingBalance: parseAmountToCents(openingBalance ?? "0") ?? 0,
      openingDate: openingDate ? startOfDayUTC(new Date(openingDate)) : new Date(),
    },
  });
  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true };
}

export async function archiveAccount(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.account.update({ where: { id }, data: { archived: true } });
  revalidatePath("/accounts");
  revalidatePath("/");
}
