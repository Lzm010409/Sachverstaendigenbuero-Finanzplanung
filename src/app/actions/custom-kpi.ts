"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { startOfDayUTC } from "@/lib/dates";
import type { FormState } from "./types";

const METRICS = ["net", "income", "expense", "volume", "count", "avg"];
const RANGES = ["mtd", "last_month", "ytd", "last_year", "last_30d", "last_90d", "rolling_12m", "custom"];
const DISPLAYS = ["number", "bar", "line", "pie"];
const GROUPS = ["none", "month", "week", "category"];
const SIZES = ["sm", "md", "lg", "xl"];

function parse(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const metric = String(formData.get("metric") ?? "net");
  const rangeKind = String(formData.get("rangeKind") ?? "ytd");
  const display = String(formData.get("display") ?? "number");
  let groupBy = String(formData.get("groupBy") ?? "none");
  const size = String(formData.get("size") ?? "md");
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const compare = formData.get("compare") === "on" || formData.get("compare") === "true";
  const showOnDashboard = formData.get("showOnDashboard") === "on" || formData.get("showOnDashboard") === "true";
  const showOnReport = formData.get("showOnReport") === "on" || formData.get("showOnReport") === "true";
  const fromStr = String(formData.get("customFrom") ?? "");
  const toStr = String(formData.get("customTo") ?? "");

  // Konsistenz erzwingen: Zahl => keine Gruppierung; Kreis => nach Kategorie.
  if (display === "number") groupBy = "none";
  else if (display === "pie") groupBy = "category";
  else if (groupBy === "none") groupBy = "month";

  return {
    name,
    metric: METRICS.includes(metric) ? metric : "net",
    rangeKind: RANGES.includes(rangeKind) ? rangeKind : "ytd",
    display: DISPLAYS.includes(display) ? display : "number",
    groupBy: GROUPS.includes(groupBy) ? groupBy : "none",
    size: SIZES.includes(size) ? size : "md",
    categoryIds,
    compare,
    showOnDashboard,
    showOnReport,
    customFrom: rangeKind === "custom" && fromStr ? startOfDayUTC(new Date(fromStr)) : null,
    customTo: rangeKind === "custom" && toStr ? startOfDayUTC(new Date(toStr)) : null,
  };
}

export async function createCustomKpi(formData: FormData): Promise<FormState> {
  const d = parse(formData);
  if (!d.name) return { error: "Name erforderlich." };
  const max = await prisma.customKpi.aggregate({ _max: { sortOrder: true } });
  await prisma.customKpi.create({ data: { ...d, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  revalidatePath("/custom-kpis");
  revalidatePath("/");
  revalidatePath("/report");
  return { ok: true };
}

export async function updateCustomKpi(formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Ungültig." };
  const d = parse(formData);
  if (!d.name) return { error: "Name erforderlich." };
  await prisma.customKpi.update({ where: { id }, data: d });
  revalidatePath("/custom-kpis");
  revalidatePath("/");
  revalidatePath("/report");
  return { ok: true };
}

export async function deleteCustomKpi(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.customKpi.delete({ where: { id } }).catch(() => {});
  revalidatePath("/custom-kpis");
  revalidatePath("/");
  revalidatePath("/report");
}

/** Schnelles Umschalten der Sichtbarkeit (Übersicht/Bericht) bzw. Größe. */
export async function setCustomKpiFlag(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? "");
  if (!id || !["showOnDashboard", "showOnReport"].includes(field)) return;
  const cur = await prisma.customKpi.findUnique({ where: { id }, select: { showOnDashboard: true, showOnReport: true } });
  if (!cur) return;
  const value = field === "showOnDashboard" ? !cur.showOnDashboard : !cur.showOnReport;
  await prisma.customKpi.update({ where: { id }, data: { [field]: value } });
  revalidatePath("/custom-kpis");
  revalidatePath("/");
  revalidatePath("/report");
}

export async function setCustomKpiSize(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const size = String(formData.get("size") ?? "md");
  if (!id || !SIZES.includes(size)) return;
  await prisma.customKpi.update({ where: { id }, data: { size } });
  revalidatePath("/custom-kpis");
  revalidatePath("/");
  revalidatePath("/report");
}
