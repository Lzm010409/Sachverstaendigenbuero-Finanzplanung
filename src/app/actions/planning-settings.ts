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
  // Wöchentlicher Versand (nur wenn dieses Formular gesendet wurde).
  if (formData.has("notifyWeeklySection")) {
    entries["notify.weekly"] = formData.get("notifyWeekly") === "on" ? "true" : "false";
    const day = Number(formData.get("notifyWeeklyDay"));
    if (Number.isInteger(day) && day >= 0 && day <= 6) entries["notify.weeklyDay"] = String(day);
    const hour = Number(formData.get("notifyWeeklyHour"));
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) entries["notify.weeklyHour"] = String(hour);
  }
  // Täglicher Datenabgleich (Umsätze/Belege/Kontakte).
  if (formData.has("syncDailySection")) {
    entries["sync.dailyEnabled"] = formData.get("syncDaily") === "on" ? "true" : "false";
    const hour = Number(formData.get("syncDailyHour"));
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) entries["sync.dailyHour"] = String(hour);
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
