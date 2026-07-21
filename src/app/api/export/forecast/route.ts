import { type NextRequest } from "next/server";
import { getForecast } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Formatiert Cent als deutschen Dezimalwert ("1234,56") ohne Tausenderpunkt,
// damit Excel/LibreOffice die Werte sauber als Zahl einliest.
function de(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export async function GET(req: NextRequest) {
  const horizon = Math.min(Math.max(Number(req.nextUrl.searchParams.get("h")) || 90, 7), 365);
  const scenarioId = req.nextUrl.searchParams.get("s") || undefined;
  const forecast = await getForecast(horizon, scenarioId);

  const header = ["Datum", "Zufluss", "Abfluss", "Saldo"].join(";");
  const rows = forecast.points.map((p) =>
    [p.date, de(p.inflow), de(p.outflow), de(p.balance)].join(";"),
  );
  const csv = "﻿" + [header, ...rows].join("\r\n"); // BOM für Excel

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="liquiditaetsplan_${horizon}tage.csv"`,
    },
  });
}
