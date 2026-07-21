import { parseAmountToCents } from "../money";
import { startOfDayUTC } from "../dates";
import type { ParseResult, ParsedTransaction } from "./types";

// Mögliche Spaltennamen deutscher Banken -> logisches Feld.
const COLUMN_ALIASES: Record<string, string[]> = {
  bookingDate: [
    "buchungstag",
    "buchungsdatum",
    "datum",
    "valuta",
    "booking date",
    "date",
  ],
  valueDate: ["wertstellung", "valutadatum", "value date", "wertstellungstag"],
  amount: ["betrag", "umsatz", "amount", "betrag (eur)", "buchungsbetrag"],
  counterparty: [
    "beguenstigter/zahlungspflichtiger",
    "beguenstigter",
    "zahlungspflichtiger",
    "name zahlungsbeteiligter",
    "auftraggeber/empfaenger",
    "empfaenger",
    "auftraggeber",
    "payee",
    "counterparty",
  ],
  purpose: [
    "verwendungszweck",
    "vwz",
    "buchungstext",
    "beschreibung",
    "purpose",
    "reference",
    "umsatztext",
  ],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .trim();
}

function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = line.split(c).length;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

// Einfacher, RFC4180-naher CSV-Zeilenparser (mit Anführungszeichen & escaped ").
function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseGermanDate(s: string): Date | null {
  const t = s.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(t); // 31.12.2025 / 31.12.25
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return startOfDayUTC(new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]))));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t); // ISO
  if (m) return startOfDayUTC(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : startOfDayUTC(d);
}

/**
 * Parst einen CSV-Kontoauszug. Erkennt Trennzeichen und Spalten automatisch.
 * Findet die Header-Zeile auch, wenn davor Metazeilen stehen (z.B. Sparkasse).
 */
export function parseCsv(content: string): ParseResult {
  const warnings: string[] = [];
  const clean = content.replace(/^﻿/, ""); // BOM entfernen
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { transactions: [], warnings: ["Leere Datei."] };

  // Header-Zeile suchen: erste Zeile, die "betrag" und ein Datumsfeld enthält.
  let headerIdx = -1;
  let delimiter = ";";
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const delim = detectDelimiter(lines[i]);
    const headers = parseLine(lines[i], delim).map(normalizeHeader);
    const hasAmount = headers.some((h) =>
      COLUMN_ALIASES.amount.some((a) => h.includes(a)),
    );
    const hasDate = headers.some((h) =>
      COLUMN_ALIASES.bookingDate.some((a) => h.includes(a)),
    );
    if (hasAmount && hasDate) {
      headerIdx = i;
      delimiter = delim;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      transactions: [],
      warnings: [
        "Konnte keine Kopfzeile mit 'Betrag' und 'Buchungstag/Datum' finden. Bitte Spaltennamen prüfen.",
      ],
    };
  }

  const headers = parseLine(lines[headerIdx], delimiter).map(normalizeHeader);
  const colIndex: Record<string, number> = {};
  // Aliase in Prioritätsreihenfolge prüfen: exakter Treffer schlägt Teiltreffer,
  // frühere Aliase schlagen spätere (z.B. "Verwendungszweck" vor "Buchungstext").
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      let idx = headers.findIndex((h) => h === alias);
      if (idx === -1) idx = headers.findIndex((h) => h.includes(alias));
      if (idx >= 0) {
        colIndex[field] = idx;
        break;
      }
    }
  }

  if (colIndex.bookingDate == null || colIndex.amount == null) {
    return { transactions: [], warnings: ["Pflichtspalten (Datum/Betrag) nicht gefunden."] };
  }

  const transactions: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], delimiter);
    const dateStr = cols[colIndex.bookingDate];
    const amountStr = cols[colIndex.amount];
    if (!dateStr || amountStr == null || amountStr === "") continue;

    const bookingDate = parseGermanDate(dateStr);
    const amount = parseAmountToCents(amountStr);
    if (!bookingDate || amount == null) {
      warnings.push(`Zeile ${i + 1} übersprungen (Datum/Betrag unlesbar).`);
      continue;
    }

    transactions.push({
      bookingDate,
      valueDate:
        colIndex.valueDate != null ? parseGermanDate(cols[colIndex.valueDate] ?? "") : null,
      amount,
      counterparty: colIndex.counterparty != null ? cols[colIndex.counterparty] ?? "" : "",
      purpose: colIndex.purpose != null ? cols[colIndex.purpose] ?? "" : "",
      raw: lines[i],
    });
  }

  if (transactions.length === 0) warnings.push("Keine Buchungszeilen erkannt.");
  return { transactions, warnings };
}
