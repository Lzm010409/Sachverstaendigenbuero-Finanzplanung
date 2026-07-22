// Verifiziert, dass der Wochenbericht mit Echtdaten fehlerfrei berechnet wird
// (ohne E-Mail-Versand). Läuft im Container per DIGEST_TEST=true.

import { buildDigest } from "@/lib/notifications";
import { formatCents } from "@/lib/money";

async function main() {
  const t0 = Date.now();
  const d = await buildDigest();
  console.log(`[digest-test] Bericht in ${Date.now() - t0} ms erstellt.`);
  console.log(`[digest-test] Verfügbar=${formatCents(d.balance)} · WorkingCapital=${formatCents(d.workingCapital)} · Reichweite=${d.runwayMonths ?? "∞"}`);
  console.log(`[digest-test] Offen: Ford=${formatCents(d.openReceivables)} (überfällig ${formatCents(d.overdueReceivablesAmount)}/${d.overdueReceivablesCount}, DSO ${d.dsoDays ?? "—"}) · Verb=${formatCents(d.openPayables)}`);
  console.log(`[digest-test] Ausblick: 4Wo Ein=${formatCents(d.week4In)} Aus=${formatCents(-d.week4Out)} Ende=${formatCents(d.week4End)} · 13Wo Ende=${formatCents(d.week13End)} · Tief=${formatCents(d.weekLowest.balance)} (${d.weekLowest.label})`);
  console.log(`[digest-test] Steuer: ${d.nextVat ? `${formatCents(d.nextVat.amount)} zum ${new Date(d.nextVat.dueDate).toLocaleDateString("de-DE")}` : "—"}`);
  console.log(`[digest-test] Meldungen: ${d.alerts.length} (${d.alerts.map((a) => a.level).join(",")})`);
  console.log("[digest-test] fertig.");
}

main().catch((e) => console.log("[digest-test] Fehler:", (e as Error).message)).finally(() => process.exit(0));
