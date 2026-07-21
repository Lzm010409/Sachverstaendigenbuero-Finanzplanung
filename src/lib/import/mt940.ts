import { startOfDayUTC } from "../dates";
import type { ParseResult, ParsedTransaction } from "./types";

// MT940 (SWIFT-Kontoauszug). Wir werten :61: (Umsatzzeile) und :86:
// (Detailfeld mit ?-Subfeldern der deutschen Banken) aus.

function parseYYMMDD(s: string): Date | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  return startOfDayUTC(new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]))));
}

function amountToCents(raw: string): number | null {
  const value = Number(raw.replace(".", "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// :86: der deutschen Banken: ?20..?29 = Verwendungszweck, ?32/?33 = Name.
function parse86(field: string): { counterparty: string; purpose: string } {
  const purposeParts: string[] = [];
  const nameParts: string[] = [];
  const re = /\?(\d{2})([^?]*)/g;
  let m: RegExpExecArray | null;
  let matchedAny = false;
  while ((m = re.exec(field))) {
    matchedAny = true;
    const code = Number(m[1]);
    const val = m[2].trim();
    if (code >= 20 && code <= 29) purposeParts.push(val);
    else if (code === 32 || code === 33) nameParts.push(val);
  }
  if (!matchedAny) {
    // Unstrukturiertes :86: -> alles als Verwendungszweck
    return { counterparty: "", purpose: field.replace(/^\d{3}/, "").trim() };
  }
  return {
    counterparty: nameParts.join(" ").trim(),
    purpose: purposeParts.join(" ").replace(/\s+/g, " ").trim(),
  };
}

export function parseMt940(content: string): ParseResult {
  const warnings: string[] = [];
  // Zeilenumbrüche innerhalb eines Feldes zusammenführen: neue Felder beginnen mit ":".
  const rawLines = content.replace(/\r/g, "").split("\n");
  const fields: string[] = [];
  for (const line of rawLines) {
    if (/^:\d{2}[A-Z]?:/.test(line) || /^:86:/.test(line)) {
      fields.push(line);
    } else if (fields.length > 0 && line !== "-") {
      fields[fields.length - 1] += line;
    }
  }

  const transactions: ParsedTransaction[] = [];
  let pending: ParsedTransaction | null = null;

  const push = () => {
    if (pending) {
      transactions.push(pending);
      pending = null;
    }
  };

  for (const field of fields) {
    if (field.startsWith(":61:")) {
      push();
      const body = field.slice(4);
      // 6!n valuedate, [4!n] entrydate, 2a mark (C/D/RC/RD), [1a] funds, 15d amount
      const m = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Za-z])?([0-9.,]+)/.exec(body);
      if (!m) {
        warnings.push("Umsatzzeile :61: nicht lesbar, übersprungen.");
        continue;
      }
      const valueDate = parseYYMMDD(m[1]);
      const cents = amountToCents(m[5]);
      if (!valueDate || cents == null) {
        warnings.push("Datum/Betrag in :61: unlesbar, übersprungen.");
        continue;
      }
      const isDebit = m[3] === "D" || m[3] === "RD";
      pending = {
        bookingDate: valueDate,
        valueDate,
        amount: isDebit ? -Math.abs(cents) : Math.abs(cents),
        counterparty: "",
        purpose: "",
        raw: field,
      };
    } else if (field.startsWith(":86:") && pending) {
      const parsed = parse86(field.slice(4));
      pending.counterparty = parsed.counterparty;
      pending.purpose = parsed.purpose;
    }
  }
  push();

  if (transactions.length === 0) warnings.push("Keine :61:-Umsätze gefunden.");
  return { transactions, warnings };
}
