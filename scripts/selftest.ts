// CLI-Selbsttest. Läuft im Container (per SELFTEST=true|deep in der Dockerfile-
// CMD) oder lokal via `npm run selftest [-- --deep]`. Gibt eine kompakte
// Zusammenfassung auf stdout aus (in Coolify über die Logs lesbar).
//
// SELFTEST=deep bzw. --deep schaltet die Live-Integrationsprüfungen an und gibt
// zusätzlich eine kleine Beleg-Stichprobe aus, um die Zuordnung
// Forderung/Verbindlichkeit gegen Echtdaten zu prüfen.

import { runDiagnostics, formatReport } from "@/lib/diagnostics";
import { getSevdeskToken } from "@/lib/settings";
import { fetchVoucherClassification } from "@/lib/sevdesk";

async function main() {
  const deep = process.env.SELFTEST === "deep" || process.argv.includes("--deep");
  const report = await runDiagnostics({ deep });
  console.log("[selftest] " + formatReport(report).split("\n").join("\n[selftest] "));

  if (deep) {
    const token = await getSevdeskToken();
    if (token) {
      const cls = await fetchVoucherClassification(token);
      console.log(`[selftest] Beleg-Stichprobe (${cls.samples.length}/${cls.total}):`);
      for (const s of cls.samples) {
        console.log(
          `[selftest]   cd=${s.creditDebit} type=${s.voucherType} status=${s.status} ` +
            `gross=${(s.grossCents / 100).toFixed(2)} net=${(s.netCents / 100).toFixed(2)} ` +
            `ref="${s.reference}" supplier="${s.supplier}"`,
        );
      }
    }
  }

  // Exit-Code spiegelt das Ergebnis: 0 = ok (pass/warn), 1 = fail.
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.log("[selftest] Fehler:", (e as Error).message);
  process.exit(1);
});
