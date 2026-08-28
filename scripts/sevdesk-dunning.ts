// Diagnose: wie bildet sevDesk Mahnungen/Mahnstufen ab? Gibt invoiceType-
// Verteilung, dunning-relevante Feldnamen und Beispielwerte aus (keine Namen/
// Beträge). READ-ONLY. Gated per SEVDESK_DUNNING=true (Ausgabe über die Logs).

import { getSevdeskToken } from "@/lib/settings";
import { fetchInvoiceDunningInfo } from "@/lib/sevdesk";

async function main() {
  const token = await getSevdeskToken();
  if (!token) {
    console.log("[sevdesk-dunning] Kein sevDesk-Token hinterlegt.");
    return;
  }
  const info = await fetchInvoiceDunningInfo(token);
  console.log("\n=== SEVDESK DUNNING/MAHNSTUFEN-DIAGNOSE ===");
  console.log("Rechnungen gesamt:", info.total);
  console.log("nach invoiceType:", JSON.stringify(info.byType));
  console.log("dunning-relevante Felder:", JSON.stringify(info.dunningKeys));
  console.log("alle Rechnungs-Felder:", JSON.stringify(info.allKeys));
  console.log("Beispiele (Nicht-RE oder mit Dunning-Wert):");
  for (const s of info.samples) {
    console.log(`  type=${s.type} status=${s.status} sendType=${s.sendType} dunning=${JSON.stringify(s.values)}`);
  }
  console.log("=== Ende ===\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
