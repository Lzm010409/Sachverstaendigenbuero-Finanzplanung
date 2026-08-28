"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";
import type { FormState } from "./types";

/** Merkt das aktive Szenario für die Übersicht (persistiert). */
export async function applyScenarioToDashboard(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setSetting("scenario.activeId", id);
  revalidatePath("/scenarios");
  revalidatePath("/");
}

/** Entfernt das aktive Szenario wieder (Übersicht zeigt Basiswerte). */
export async function clearActiveScenario() {
  await setSetting("scenario.activeId", "");
  revalidatePath("/scenarios");
  revalidatePath("/");
}

/** Wendet ein Szenario an – oder hebt es auf, wenn es bereits aktiv ist (Toggle). */
export async function toggleActiveScenario(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const cur = await getSetting("scenario.activeId");
  await setSetting("scenario.activeId", cur === id ? "" : id);
  revalidatePath("/scenarios");
  revalidatePath("/");
}

const schema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  inflowFactor: z.string().optional(),
  outflowFactor: z.string().optional(),
  inflowShiftDays: z.string().optional(),
});

function toFactor(v: string | undefined, fallback: number): number {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export async function createScenario(formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const d = parsed.data;
  await prisma.scenario.create({
    data: {
      name: d.name,
      inflowFactor: toFactor(d.inflowFactor, 1),
      outflowFactor: toFactor(d.outflowFactor, 1),
      inflowShiftDays: Math.max(0, Math.round(Number(d.inflowShiftDays) || 0)),
    },
  });
  revalidatePath("/scenarios");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteScenario(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.scenario.delete({ where: { id } });
  if ((await getSetting("scenario.activeId")) === id) await setSetting("scenario.activeId", "");
  revalidatePath("/scenarios");
  revalidatePath("/");
}

/** Legt einen kategoriespezifischen Faktor an oder aktualisiert ihn (Upsert). */
export async function setScenarioAdjustment(formData: FormData): Promise<void> {
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!scenarioId || !categoryId) return;
  const factor = toFactor(String(formData.get("factor") ?? ""), 1);
  await prisma.scenarioCategoryAdjustment.upsert({
    where: { scenarioId_categoryId: { scenarioId, categoryId } },
    create: { scenarioId, categoryId, factor },
    update: { factor },
  });
  revalidatePath("/scenarios");
  revalidatePath("/");
}

export async function deleteScenarioAdjustment(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.scenarioCategoryAdjustment.delete({ where: { id } });
  revalidatePath("/scenarios");
  revalidatePath("/");
}
