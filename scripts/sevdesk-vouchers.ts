// Diagnose: wie markiert sevDesk wiederkehrende Belege (Vouchers)? Gibt Feld-
// namen, die auf Wiederholung/Intervall hindeuten, sowie Verteilung + kleine
// Stichprobe aus (keine Namen/Beträge). READ-ONLY. Gated per
// SEVDESK_VOUCHERS=true (Ausgabe über die Container-Logs).

import { getSevdeskToken } from "@/lib/settings";
import { fetchVoucherRecurringInfo } from "@/lib/sevdesk";

async function main() {
  const token = await getSevdeskToken();
  if (!token) {
    console.log("[sevdesk-vouchers] Kein sevDesk-Token hinterlegt.");
    return;
  }
  const info = await fetchVoucherRecurringInfo(token);
  console.log("\n=== SEVDESK WIEDERKEHRENDE-BELEGE-DIAGNOSE ===");
  console.log("Belege gesamt:", info.total);
  console.log("Recurring-relevante Felder:", JSON.stringify(info.recurKeys));
  console.log("Verteilung:", JSON.stringify(info.byRecurring));
  console.log("alle Beleg-Felder:", JSON.stringify(info.allKeys));
  console.log("Beispiele (mit Recurring-Wert):");
  for (const s of info.samples) {
    console.log(`  status=${s.status} voucherType=${s.voucherType} values=${JSON.stringify(s.values)}`);
  }
  console.log("=== Ende ===\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
