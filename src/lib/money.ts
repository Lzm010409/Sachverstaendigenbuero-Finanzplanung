// Geldbeträge werden intern als Ganzzahl in Cent geführt. Diese Helfer
// kapseln Umrechnung und Formatierung, damit nie mit Floats gerechnet wird.

const eurFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/** Formatiert Cent als "1.234,56 €". */
export function formatCents(cents: number): string {
  return eurFormatter.format(cents / 100);
}

/** Parst eine deutsche/englische Betragseingabe (z.B. "1.234,56" oder "-1234.56") zu Cent. */
export function parseAmountToCents(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === "") return null;

  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\s€$]/g, "").replace(/^-/, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Das letzte Trennzeichen ist das Dezimaltrennzeichen.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // deutsches Format
    } else {
      s = s.replace(/,/g, ""); // englisches Format
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }

  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Cent -> Dezimalzahl (nur für Anzeige/Charts, nie für Rechnungen). */
export function centsToNumber(cents: number): number {
  return cents / 100;
}
