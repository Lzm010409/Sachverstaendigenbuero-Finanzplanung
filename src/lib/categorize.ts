export interface MatchableRule {
  id: string;
  categoryId: string;
  field: "COUNTERPARTY" | "PURPOSE";
  pattern: string;
  priority: number;
  active: boolean;
}

export interface Categorizable {
  counterparty: string;
  purpose: string;
}

function toMatcher(pattern: string): (value: string) => boolean {
  const p = pattern.trim();
  // /regex/flags-Syntax unterstützen, sonst case-insensitive Teilstring.
  const re = /^\/(.+)\/([a-z]*)$/i.exec(p);
  if (re) {
    try {
      const rx = new RegExp(re[1], re[2].includes("i") ? re[2] : re[2] + "i");
      return (value) => rx.test(value);
    } catch {
      // ungültige Regex -> als Teilstring behandeln
    }
  }
  const needle = p.toLowerCase();
  return (value) => value.toLowerCase().includes(needle);
}

/**
 * Findet die passende Kategorie für einen Umsatz. Regeln werden nach
 * priority (aufsteigend) geprüft; die erste passende gewinnt.
 * Gibt categoryId oder null zurück.
 */
export function categorize(tx: Categorizable, rules: MatchableRule[]): string | null {
  const active = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  for (const rule of active) {
    const value = rule.field === "COUNTERPARTY" ? tx.counterparty : tx.purpose;
    if (value && toMatcher(rule.pattern)(value)) {
      return rule.categoryId;
    }
  }
  return null;
}
