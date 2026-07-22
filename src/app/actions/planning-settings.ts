"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";

// Speichert die Planungs-Einstellungen (Mindestliquidität, USt-Satz,
// Benachrichtigungen). Werte liegen im Setting-KV-Store.
export async function savePlanningSettings(formData: FormData): Promise<void> {
  const entries: Record<string, string> = {};

  if (formData.has("minLiquidity")) {
    const cents = parseAmountToCents(String(formData.get("minLiquidity") ?? "")) ?? 0;
    entries["liquidity.minThreshold"] = String(Math.abs(cents));
  }
  if (formData.has("vatRate")) {
    const raw = String(formData.get("vatRate") ?? "").replace(",", ".");
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 100) entries["tax.vatRate"] = String(n);
  }
  if (formData.has("vatPrepayCycle")) {
    const v = String(formData.get("vatPrepayCycle") ?? "");
    if (["monthly", "quarterly"].includes(v)) entries["tax.vatCycle"] = v;
  }
  if (formData.has("notifyEmail")) {
    entries["notify.email"] = String(formData.get("notifyEmail") ?? "").trim();
  }

  await Promise.all(
    Object.entries(entries).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/tax");
}
