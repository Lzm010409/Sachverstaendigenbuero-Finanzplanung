// Parser für finban.io-Transaktionsexporte (CSV).
// Spalten: Datum, Titel, Wert, Steuer, Kontakt, Datenquelle, Status, Szenario, Kategorie
// Datum: TT/MM/JJJJ · Wert: Dezimal mit Punkt, vorzeichenbehaftet.

import { startOfDayUTC } from "../dates";

export interface FinbanRecord {
  date: Date;
  title: string;
  amount: number; // Cent, vorzeichenbehaftet
  category: string | null;
  contact: string | null;
  source: string; // Datenquelle (Kontoname oder "Planung")
  status: string; // z.B. "Gebucht", "Budget", "Rückerstattung - Überweisung"
  planned: boolean; // Planungs-/Budgetzeile (noch nicht gebucht)
}

export interface FinbanParseResult {
  records: FinbanRecord[];
  warnings: string[];
}

// RFC4180-naher Zeilenparser (Komma-getrennt, Anführungszeichen, escaped "").
function parseLine(line: string): string[] {
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
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return startOfDayUTC(new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))));
}

function parseAmount(s: string): number | null {
  const raw = (s ?? "").trim().replace(/\s/g, "");
  if (raw === "") return null;
  // finban nutzt Punkt als Dezimaltrenner, keine Tausenderpunkte.
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// Splittet den Inhalt in Zeilen und berücksichtigt Zeilenumbrüche in Quotes.
function splitRecords(content: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      if (cur !== "") rows.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur !== "") rows.push(cur);
  return rows;
}

export function parseFinbanCsv(content: string): FinbanParseResult {
  const warnings: string[] = [];
  const clean = content.replace(/^﻿/, "");
  const lines = splitRecords(clean);
  if (lines.length < 2) return { records: [], warnings: ["Leere oder unvollständige Datei."] };

  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);
  const iDate = col("datum");
  const iTitle = col("titel");
  const iVal = col("wert");
  const iContact = col("kontakt");
  const iSource = col("datenquelle");
  const iStatus = col("status");
  const iCat = col("kategorie");

  if (iDate < 0 || iVal < 0) {
    return { records: [], warnings: ["Kopfzeile ohne 'Datum'/'Wert' – kein finban-Export?"] };
  }

  const records: FinbanRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.every((c) => c === "")) continue;
    const date = parseDate(cols[iDate] ?? "");
    const amount = parseAmount(cols[iVal] ?? "");
    if (!date || amount == null) {
      warnings.push(`Zeile ${i + 1} übersprungen (Datum/Wert unlesbar).`);
      continue;
    }
    const status = iStatus >= 0 ? cols[iStatus] ?? "" : "";
    const source = iSource >= 0 ? cols[iSource] ?? "" : "";
    const category = iCat >= 0 ? (cols[iCat] ?? "").trim() : "";
    records.push({
      date,
      title: iTitle >= 0 ? cols[iTitle] ?? "" : "",
      amount,
      category: category || null,
      contact: iContact >= 0 ? (cols[iContact] || "").trim() || null : null,
      source,
      status,
      planned: status.toLowerCase() === "budget" || source.toLowerCase() === "planung",
    });
  }

  if (records.length === 0) warnings.push("Keine Datensätze erkannt.");
  return { records, warnings };
}
