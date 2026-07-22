"use server";

import { revalidatePath } from "next/cache";
import { recordForecastSnapshot } from "@/lib/snapshots";

export async function recordSnapshotNow(): Promise<{ message: string }> {
  const r30 = await recordForecastSnapshot(30);
  const r90 = await recordForecastSnapshot(90);
  revalidatePath("/forecast-accuracy");
  return {
    message: `Snapshot für ${r30.targetMonth} (30 T) ${r30.created ? "erstellt" : "aktualisiert"}, ${r90.targetMonth} (90 T) ${r90.created ? "erstellt" : "aktualisiert"}.`,
  };
}
