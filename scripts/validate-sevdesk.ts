// Echtdaten-Abgleich: zieht die offenen Posten aus sevDesk (mit der aktuellen
// Mapping-Logik) und stellt sie den Referenzwerten gegenüber, damit die
// Validität der App-Zahlen gegen die Quelle nachvollziehbar ist.
// Läuft im Container per VALIDATE=true (Ausgabe über die Coolify-Logs) oder
// lokal via `npm run validate:sevdesk`. Enthält Eigen-/Lieferantennamen –
// nur für das eigene System gedacht.

import { fetchOpenInvoices, fetchOpenVouchers, type SevdeskOpenItem } from "@/lib/sevdesk";
import { getSevdeskToken } from "@/lib/settings";

const eur = (c: number) => (c / 100).toFixed(2);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Referenz-Ausschnitte aus dem übergebenen Screenshot (Rechnungs-/Belegnummern).
// Erwartete offene Beträge, wo im Screenshot ablesbar (in Cent), sonst null.
const REFERENCES: { ref: string; expectedOpenCents: number | null; expectedKind?: string }[] = [
  { ref: "1935TG01", expectedOpenCents: 19220, expectedKind: "RECEIVABLE" },
  { ref: "1941TG01", expectedOpenCents: 18072, expectedKind: "RECEIVABLE" },
  { ref: "1945TG01", expectedOpenCents: 89952, expectedKind: "RECEIVABLE" },
  { ref: "1948TG01", expectedOpenCents: 55110, expectedKind: "RECEIVABLE" },
  { ref: "1933TG01", expectedOpenCents: 248954, expectedKind: "RECEIVABLE" },
  { ref: "8907/005/00001", expectedOpenCents: 1480, expectedKind: "PAYABLE" }, // Shell -> Lieferant
  { ref: "00302751112/26/06", expectedOpenCents: 4999, expectedKind: "PAYABLE" }, // Vodafone -> Lieferant
];

function findByRef(items: SevdeskOpenItem[], ref: string) {
  return items.find((i) => (i.reference ?? "").includes(ref) || (i.counterparty ?? "").includes(ref));
}

async function main() {
  const token = await getSevdeskToken();
  if (!token) {
    console.log("[validate] kein sevDesk-Token");
    return;
  }

  const [inv, vou] = await Promise.all([fetchOpenInvoices(token), fetchOpenVouchers(token)]);
  const all = [...inv, ...vou];
  const recv = all.filter((i) => i.kind === "RECEIVABLE");
  const pay = all.filter((i) => i.kind === "PAYABLE");
  const openSum = (xs: SevdeskOpenItem[]) => xs.reduce((a, i) => a + (i.amountCents - i.paidAmountCents), 0);

  console.log("[validate] === Summen (offener Restbetrag) ===");
  console.log(`[validate] Rechnungen: ${inv.length} Stk (alle Forderungen)`);
  console.log(`[validate] Belege:     ${vou.length} Stk -> Forderung=${vou.filter(v=>v.kind==="RECEIVABLE").length}, Verbindlichkeit=${vou.filter(v=>v.kind==="PAYABLE").length}`);
  console.log(`[validate] Offene Forderungen gesamt:      ${eur(openSum(recv))} € (${recv.length} Posten)`);
  console.log(`[validate] Offene Verbindlichkeiten gesamt: ${eur(openSum(pay))} € (${pay.length} Posten)`);

  const partial = all.filter((i) => i.paidAmountCents > 0 && i.amountCents - i.paidAmountCents > 0);
  console.log(`[validate] Posten mit Teilzahlung: ${partial.length}`);
  const badPaid = all.filter((i) => i.paidAmountCents < 0 || i.paidAmountCents > i.amountCents);
  console.log(`[validate] Posten mit ungültigem paidAmount (soll 0): ${badPaid.length}`);

  console.log("[validate] === Zeilen-Abgleich gegen Screenshot ===");
  let ok = 0, mismatch = 0, notFound = 0;
  for (const r of REFERENCES) {
    const m = findByRef(all, r.ref);
    if (!m) {
      notFound++;
      console.log(`[validate] "${r.ref}": NICHT (mehr) offen — evtl. inzwischen bezahlt`);
      continue;
    }
    const open = m.amountCents - m.paidAmountCents;
    const kindOk = !r.expectedKind || m.kind === r.expectedKind;
    const openOk = r.expectedOpenCents == null || Math.abs(open - r.expectedOpenCents) <= 2;
    const verdict = kindOk && openOk ? "OK" : "ABWEICHUNG";
    if (kindOk && openOk) ok++; else mismatch++;
    console.log(
      `[validate] "${r.ref}": ${verdict} | kind=${m.kind}` +
        (r.expectedKind ? `(erwartet ${r.expectedKind})` : "") +
        ` brutto=${eur(m.amountCents)} bezahlt=${eur(m.paidAmountCents)} offen=${eur(open)}` +
        (r.expectedOpenCents != null ? ` (erwartet offen ${eur(r.expectedOpenCents)})` : "") +
        ` faellig=${iso(m.dueDate)}`,
    );
  }
  console.log(`[validate] Abgleich: ${ok} OK, ${mismatch} Abweichungen, ${notFound} nicht mehr offen`);
  console.log("[validate] fertig.");
}

main().catch((e) => console.log("[validate] Fehler:", (e as Error).message));
