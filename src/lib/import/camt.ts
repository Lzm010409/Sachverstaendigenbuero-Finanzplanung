import { XMLParser } from "fast-xml-parser";
import { startOfDayUTC } from "../dates";
import type { ParseResult, ParsedTransaction } from "./types";

// CAMT.053 (Kontoauszug) und in weiten Teilen CAMT.052/.054 kompatibel.
// Wir lesen die <Ntry>-Einträge (Buchungen) mit Betrag, Datum, CdtDbtInd und
// – wenn vorhanden – die Detailfelder aus <NtryDtls>/<TxDtls>.

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "");
  }
  return String(v);
}

function parseDate(v: unknown): Date | null {
  const s = text(v).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return startOfDayUTC(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : startOfDayUTC(d);
}

function amountToCents(amtNode: unknown): number | null {
  const raw = text(amtNode).replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function parseCamt(content: string): ParseResult {
  const warnings: string[] = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(content) as Record<string, unknown>;
  } catch (e) {
    return { transactions: [], warnings: [`XML nicht lesbar: ${(e as Error).message}`] };
  }

  // Pfad zu den Statements robust auflösen (Document > BkToCstmrStmt > Stmt > Ntry).
  const document = (doc.Document ?? doc) as Record<string, unknown>;
  const bkToCstmr = (document.BkToCstmrStmt ?? document.BkToCstmrAcctRpt) as
    | Record<string, unknown>
    | undefined;
  if (!bkToCstmr) {
    return { transactions: [], warnings: ["Kein CAMT-Statement gefunden (BkToCstmrStmt)."] };
  }
  const statements = toArray(bkToCstmr.Stmt ?? bkToCstmr.Rpt) as Record<string, unknown>[];

  const transactions: ParsedTransaction[] = [];
  for (const stmt of statements) {
    for (const entry of toArray(stmt.Ntry) as Record<string, unknown>[]) {
      const cents = amountToCents(entry.Amt);
      if (cents == null) {
        warnings.push("Buchung ohne lesbaren Betrag übersprungen.");
        continue;
      }
      const isDebit = text(entry.CdtDbtInd).toUpperCase() === "DBIT";
      const amount = isDebit ? -Math.abs(cents) : Math.abs(cents);

      const bookingDate =
        parseDate((entry.BookgDt as Record<string, unknown>)?.Dt) ??
        parseDate((entry.BookgDt as Record<string, unknown>)?.DtTm) ??
        parseDate((entry.ValDt as Record<string, unknown>)?.Dt);
      const valueDate = parseDate((entry.ValDt as Record<string, unknown>)?.Dt);
      if (!bookingDate) {
        warnings.push("Buchung ohne lesbares Datum übersprungen.");
        continue;
      }

      // Detailfelder (Gegenpartei, Verwendungszweck) bestmöglich extrahieren.
      let counterparty = "";
      let purpose = "";
      const dtls = toArray(entry.NtryDtls) as Record<string, unknown>[];
      for (const d of dtls) {
        for (const tx of toArray(d.TxDtls) as Record<string, unknown>[]) {
          const rmtInf = tx.RmtInf as Record<string, unknown> | undefined;
          if (rmtInf) {
            const ustrd = toArray(rmtInf.Ustrd).map(text).join(" ").trim();
            if (ustrd) purpose = purpose ? `${purpose} ${ustrd}` : ustrd;
          }
          const rltdPties = tx.RltdPties as Record<string, unknown> | undefined;
          if (rltdPties && !counterparty) {
            const party = (isDebit ? rltdPties.Cdtr : rltdPties.Dbtr) as
              | Record<string, unknown>
              | undefined;
            const name = text((party as Record<string, unknown>)?.Nm ?? party);
            if (name) counterparty = name;
          }
        }
      }
      if (!purpose) purpose = text(entry.AddtlNtryInf);

      transactions.push({
        bookingDate,
        valueDate,
        amount,
        counterparty,
        purpose,
        raw: undefined,
      });
    }
  }

  if (transactions.length === 0 && warnings.length === 0) {
    warnings.push("Keine Buchungen (Ntry) im CAMT-Dokument gefunden.");
  }
  return { transactions, warnings };
}
