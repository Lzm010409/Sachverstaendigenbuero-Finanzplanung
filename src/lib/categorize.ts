export type AmountOp = "GT" | "LT" | "GTE" | "LTE" | "EQ";

export interface MatchableRule {
  id: string;
  categoryId: string;
  field: "COUNTERPARTY" | "PURPOSE";
  pattern: string | null;
  amountOp: AmountOp | null;
  amountValue: number | null; // Cent, vorzeichenbehaftet
  priority: number;
  active: boolean;
}

export interface Categorizable {
  counterparty: string;
  purpose: string;
  amount: number; // Cent, vorzeichenbehaftet
}

function toMatcher(pattern: string): (value: string) => boolean {
  const p = pattern.trim();
  const re = /^\/(.+)\/([a-zA-Z]*)$/.exec(p);
  if (re) {
    try {
      // Flags normalisieren (klein) und "i" immer erzwingen -> Regeln sind
      // grundsätzlich case-insensitiv; doppelte Flags werden entfernt.
      const flags = Array.from(new Set((re[2].toLowerCase() + "i").split(""))).join("");
      const rx = new RegExp(re[1], flags);
      return (value) => rx.test(value);
    } catch {
      // ungültige Regex -> als Teilstring behandeln
    }
  }
  const needle = p.toLowerCase();
  return (value) => value.toLowerCase().includes(needle);
}

function amountMatches(amount: number, op: AmountOp, value: number): boolean {
  switch (op) {
    case "GT":
      return amount > value;
    case "LT":
      return amount < value;
    case "GTE":
      return amount >= value;
    case "LTE":
      return amount <= value;
    case "EQ":
      return amount === value;
    default:
      return false;
  }
}

/**
 * Findet die passende Kategorie für einen Umsatz. Regeln werden nach priority
 * (aufsteigend) geprüft; die erste passende gewinnt. Eine Regel kann eine
 * Text-Bedingung (Feld enthält Muster) und/oder eine Betrags-Bedingung haben;
 * gesetzte Bedingungen müssen alle zutreffen.
 */
export function categorize(tx: Categorizable, rules: MatchableRule[]): string | null {
  const active = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  for (const rule of active) {
    const hasText = !!rule.pattern && rule.pattern.trim() !== "";
    const hasAmount = rule.amountOp != null && rule.amountValue != null;
    if (!hasText && !hasAmount) continue; // leere Regel ignorieren

    if (hasText) {
      const value = rule.field === "COUNTERPARTY" ? tx.counterparty : tx.purpose;
      if (!value || !toMatcher(rule.pattern!)(value)) continue;
    }
    if (hasAmount && !amountMatches(tx.amount, rule.amountOp!, rule.amountValue!)) continue;

    return rule.categoryId;
  }
  return null;
}
