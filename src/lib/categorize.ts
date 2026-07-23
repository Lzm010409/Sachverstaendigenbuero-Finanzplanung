import { type EvalContext, type Node, evalNode, isValidTree } from "./rule-expr";

export interface MatchableRule {
  id: string;
  categoryId: string;
  conditions: Node | null; // Bedingungs-Baum (siehe rule-expr.ts)
  priority: number;
  active: boolean;
}

// Wandelt eine Prisma-Regel (conditions als JsonValue) in eine MatchableRule um.
// Ungültige/leere Bäume werden zu null (Regel greift dann nie).
export function toMatchableRule(r: {
  id: string;
  categoryId: string;
  conditions: unknown;
  priority: number;
  active: boolean;
}): MatchableRule {
  return {
    id: r.id,
    categoryId: r.categoryId,
    conditions: isValidTree(r.conditions) ? r.conditions : null,
    priority: r.priority,
    active: r.active,
  };
}

// Ein kategorisierbarer Umsatz. accountId/bookingDate sind optional – Regeln mit
// Konto-/Datums-Bedingungen greifen nur, wenn diese Felder vorhanden sind.
export type Categorizable = EvalContext;

/**
 * Findet die passende Kategorie für einen Umsatz. Regeln werden nach priority
 * (aufsteigend) geprüft; die erste Regel, deren Bedingungs-Baum zutrifft, gewinnt.
 */
export function categorize(tx: Categorizable, rules: MatchableRule[]): string | null {
  const active = rules.filter((r) => r.active && r.conditions).sort((a, b) => a.priority - b.priority);
  for (const rule of active) {
    if (evalNode(rule.conditions as Node, tx)) return rule.categoryId;
  }
  return null;
}
