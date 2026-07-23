// Bedingungs-Baum für Auto-Kategorisierungsregeln.
// Eine Regel besitzt einen verschachtelten Ausdruck aus Gruppen (UND/ODER, optional
// NICHT) und Einzelbedingungen. Bewusst framework-frei (kein React, kein Prisma,
// kein zod), damit sowohl die Server-Engine (categorize.ts) als auch der
// Client-Builder dieselbe Logik/Beschreibung nutzen können.

export type LogicOp = "AND" | "OR";

export type TextField = "COUNTERPARTY" | "PURPOSE" | "ANY_TEXT";
export type TextOp = "CONTAINS" | "NOT_CONTAINS" | "EQUALS" | "STARTS_WITH" | "ENDS_WITH" | "REGEX";
export type AmountField = "AMOUNT" | "ABS_AMOUNT";
export type AmountOp = "GT" | "LT" | "GTE" | "LTE" | "EQ" | "BETWEEN";
export type AccountOp = "EQ" | "NEQ";
export type SetOp = "IN" | "NOT_IN";
export type DateOp = "BEFORE" | "AFTER" | "BETWEEN";

export type Condition =
  | { type: "text"; field: TextField; op: TextOp; value: string }
  | { type: "amount"; field: AmountField; op: AmountOp; value: number; value2?: number } // Cent
  | { type: "account"; op: AccountOp; accountId: string }
  | { type: "weekday"; op: SetOp; days: number[] } // 0=So … 6=Sa
  | { type: "month"; op: SetOp; months: number[] } // 1 … 12
  | { type: "date"; op: DateOp; date: string; date2?: string }; // ISO yyyy-mm-dd

export interface Group {
  type: "group";
  op: LogicOp;
  not?: boolean;
  children: Node[];
}

export type Node = Group | Condition;

// Sicherheits-/Sanity-Grenzen (schützt Speicher + verhindert entartete Bäume).
export const MAX_NODES = 200;
export const MAX_DEPTH = 8;

// Auswertungs-Kontext eines Umsatzes.
export interface EvalContext {
  counterparty: string;
  purpose: string;
  amount: number; // Cent, vorzeichenbehaftet
  accountId?: string;
  bookingDate?: Date;
}

// --- Textabgleich (kompatibel zur früheren Regel-Logik) -----------------------
// CONTAINS erkennt zusätzlich das /regex/-Format (wie zuvor); Vergleiche sind
// grundsätzlich case-insensitiv.
function textContains(needleRaw: string, target: string): boolean {
  const p = needleRaw.trim();
  const re = /^\/(.+)\/([a-zA-Z]*)$/.exec(p);
  if (re) {
    try {
      const flags = Array.from(new Set((re[2].toLowerCase() + "i").split(""))).join("");
      return new RegExp(re[1], flags).test(target);
    } catch {
      /* ungültige Regex -> als Teilstring behandeln */
    }
  }
  return target.toLowerCase().includes(p.toLowerCase());
}

function textMatches(op: TextOp, value: string, target: string): boolean {
  const t = target ?? "";
  const v = value ?? "";
  switch (op) {
    case "CONTAINS":
      return textContains(v, t);
    case "NOT_CONTAINS":
      return !textContains(v, t);
    case "EQUALS":
      return t.trim().toLowerCase() === v.trim().toLowerCase();
    case "STARTS_WITH":
      return t.trim().toLowerCase().startsWith(v.trim().toLowerCase());
    case "ENDS_WITH":
      return t.trim().toLowerCase().endsWith(v.trim().toLowerCase());
    case "REGEX": {
      const body = v.replace(/^\/(.*)\/[a-zA-Z]*$/, "$1");
      try {
        return new RegExp(body, "i").test(t);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function evalText(c: Extract<Condition, { type: "text" }>, ctx: EvalContext): boolean {
  if (c.field === "COUNTERPARTY") return textMatches(c.op, c.value, ctx.counterparty);
  if (c.field === "PURPOSE") return textMatches(c.op, c.value, ctx.purpose);
  // ANY_TEXT: in Gegenpartei ODER Zweck. Bei NOT_CONTAINS heißt „trifft zu",
  // dass der Text in KEINEM der beiden Felder vorkommt.
  if (c.op === "NOT_CONTAINS") {
    return !textContains(c.value, ctx.counterparty) && !textContains(c.value, ctx.purpose);
  }
  return textMatches(c.op, c.value, ctx.counterparty) || textMatches(c.op, c.value, ctx.purpose);
}

function evalAmount(c: Extract<Condition, { type: "amount" }>, ctx: EvalContext): boolean {
  const v = c.field === "ABS_AMOUNT" ? Math.abs(ctx.amount) : ctx.amount;
  switch (c.op) {
    case "GT":
      return v > c.value;
    case "LT":
      return v < c.value;
    case "GTE":
      return v >= c.value;
    case "LTE":
      return v <= c.value;
    case "EQ":
      return v === c.value;
    case "BETWEEN": {
      const a = c.value;
      const b = c.value2 ?? c.value;
      return v >= Math.min(a, b) && v <= Math.max(a, b);
    }
    default:
      return false;
  }
}

function evalCondition(c: Condition, ctx: EvalContext): boolean {
  switch (c.type) {
    case "text":
      return evalText(c, ctx);
    case "amount":
      return evalAmount(c, ctx);
    case "account":
      if (!ctx.accountId) return false;
      return c.op === "EQ" ? ctx.accountId === c.accountId : ctx.accountId !== c.accountId;
    case "weekday": {
      if (!ctx.bookingDate) return false;
      const d = ctx.bookingDate.getUTCDay();
      const inSet = c.days.includes(d);
      return c.op === "IN" ? inSet : !inSet;
    }
    case "month": {
      if (!ctx.bookingDate) return false;
      const m = ctx.bookingDate.getUTCMonth() + 1;
      const inSet = c.months.includes(m);
      return c.op === "IN" ? inSet : !inSet;
    }
    case "date": {
      if (!ctx.bookingDate) return false;
      const day = ctx.bookingDate.toISOString().slice(0, 10);
      if (c.op === "BEFORE") return day < c.date;
      if (c.op === "AFTER") return day > c.date;
      const a = c.date;
      const b = c.date2 ?? c.date;
      return day >= (a < b ? a : b) && day <= (a < b ? b : a);
    }
    default:
      return false;
  }
}

/** Wertet einen Bedingungs-Baum gegen einen Umsatz aus. */
export function evalNode(node: Node, ctx: EvalContext): boolean {
  if (node.type !== "group") return evalCondition(node, ctx);
  // Leere Gruppe trifft NIE zu (verhindert versehentliches „matcht alles").
  if (!node.children || node.children.length === 0) return false;
  const res =
    node.op === "AND"
      ? node.children.every((ch) => evalNode(ch, ctx))
      : node.children.some((ch) => evalNode(ch, ctx));
  return node.not ? !res : res;
}

// --- Validierung (ohne zod, damit client-tauglich) ----------------------------

const TEXT_FIELDS: TextField[] = ["COUNTERPARTY", "PURPOSE", "ANY_TEXT"];
const TEXT_OPS: TextOp[] = ["CONTAINS", "NOT_CONTAINS", "EQUALS", "STARTS_WITH", "ENDS_WITH", "REGEX"];
const AMOUNT_FIELDS: AmountField[] = ["AMOUNT", "ABS_AMOUNT"];
const AMOUNT_OPS: AmountOp[] = ["GT", "LT", "GTE", "LTE", "EQ", "BETWEEN"];

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function validateCondition(c: Record<string, unknown>): boolean {
  switch (c.type) {
    case "text":
      return (
        TEXT_FIELDS.includes(c.field as TextField) &&
        TEXT_OPS.includes(c.op as TextOp) &&
        typeof c.value === "string" &&
        c.value.trim() !== ""
      );
    case "amount":
      return (
        AMOUNT_FIELDS.includes(c.field as AmountField) &&
        AMOUNT_OPS.includes(c.op as AmountOp) &&
        isFiniteInt(c.value) &&
        (c.op !== "BETWEEN" || isFiniteInt(c.value2))
      );
    case "account":
      return (c.op === "EQ" || c.op === "NEQ") && typeof c.accountId === "string" && c.accountId !== "";
    case "weekday":
      return (
        (c.op === "IN" || c.op === "NOT_IN") &&
        Array.isArray(c.days) &&
        c.days.length > 0 &&
        c.days.every((d) => isFiniteInt(d) && d >= 0 && d <= 6)
      );
    case "month":
      return (
        (c.op === "IN" || c.op === "NOT_IN") &&
        Array.isArray(c.months) &&
        c.months.length > 0 &&
        c.months.every((m) => isFiniteInt(m) && m >= 1 && m <= 12)
      );
    case "date": {
      const okDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (!(c.op === "BEFORE" || c.op === "AFTER" || c.op === "BETWEEN")) return false;
      if (!okDate(c.date)) return false;
      return c.op !== "BETWEEN" || okDate(c.date2);
    }
    default:
      return false;
  }
}

function validateNode(node: unknown, depth: number, counter: { n: number }): boolean {
  if (depth > MAX_DEPTH) return false;
  if (++counter.n > MAX_NODES) return false;
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  if (o.type === "group") {
    if (o.op !== "AND" && o.op !== "OR") return false;
    if (o.not !== undefined && typeof o.not !== "boolean") return false;
    if (!Array.isArray(o.children)) return false;
    return o.children.every((ch) => validateNode(ch, depth + 1, counter));
  }
  return validateCondition(o);
}

/** Prüft, ob ein (bereits geparster) Baum strukturell gültig ist. */
export function isValidTree(node: unknown): node is Node {
  return validateNode(node, 0, { n: 0 });
}

/** Parst + validiert JSON zu einem Baum. Gibt null bei ungültiger Eingabe. */
export function parseTree(json: string | null | undefined): Node | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return isValidTree(parsed) ? (parsed as Node) : null;
}

/** Baut einen einfachen Wurzelbaum mit genau einer Textbedingung (für Seeds). */
export function textTree(field: TextField, op: TextOp, value: string): Group {
  return { type: "group", op: "AND", not: false, children: [{ type: "text", field, op, value }] };
}

/** Extrahiert – wenn vorhanden – den Textwert einer Regel mit genau einer
 *  Textbedingung (für Idempotenz/Deduplizierung in Seeds). */
export function singleTextValue(node: Node | null): { field: TextField; value: string } | null {
  if (!node) return null;
  let cond: Node | null = node;
  if (cond.type === "group") {
    if (cond.children.length !== 1) return null;
    cond = cond.children[0];
  }
  if (cond && cond.type === "text") return { field: cond.field, value: cond.value };
  return null;
}

// --- Labels + Klartext-Beschreibung (Deutsch) ---------------------------------

export const FIELD_LABELS: Record<string, string> = {
  COUNTERPARTY: "Gegenpartei",
  PURPOSE: "Verwendungszweck",
  ANY_TEXT: "Gegenpartei o. Zweck",
  AMOUNT: "Betrag",
  ABS_AMOUNT: "Betrag (absolut)",
};

const TEXT_OP_LABELS: Record<TextOp, string> = {
  CONTAINS: "enthält",
  NOT_CONTAINS: "enthält nicht",
  EQUALS: "ist genau",
  STARTS_WITH: "beginnt mit",
  ENDS_WITH: "endet mit",
  REGEX: "Regex",
};

const AMOUNT_OP_LABELS: Record<AmountOp, string> = {
  GT: ">",
  GTE: "≥",
  LT: "<",
  LTE: "≤",
  EQ: "=",
  BETWEEN: "zwischen",
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_LABELS = ["", "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function euro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/** Optionale Namensauflösung für Konten (id -> Name) für die Beschreibung. */
export type AccountNameMap = Record<string, string>;

export function describeCondition(c: Condition, accounts?: AccountNameMap): string {
  switch (c.type) {
    case "text":
      return `${FIELD_LABELS[c.field]} ${TEXT_OP_LABELS[c.op]} „${c.value}"`;
    case "amount":
      return c.op === "BETWEEN"
        ? `${FIELD_LABELS[c.field]} zwischen ${euro(c.value)} und ${euro(c.value2 ?? c.value)}`
        : `${FIELD_LABELS[c.field]} ${AMOUNT_OP_LABELS[c.op]} ${euro(c.value)}`;
    case "account": {
      const name = accounts?.[c.accountId] ?? c.accountId;
      return `Konto ${c.op === "EQ" ? "ist" : "ist nicht"} ${name}`;
    }
    case "weekday":
      return `Wochentag ${c.op === "IN" ? "" : "nicht "}${c.days.map((d) => WEEKDAY_LABELS[d]).join(", ")}`;
    case "month":
      return `Monat ${c.op === "IN" ? "" : "nicht "}${c.months.map((m) => MONTH_LABELS[m]).join(", ")}`;
    case "date":
      if (c.op === "BEFORE") return `Datum vor ${c.date}`;
      if (c.op === "AFTER") return `Datum nach ${c.date}`;
      return `Datum zwischen ${c.date} und ${c.date2 ?? c.date}`;
    default:
      return "?";
  }
}

/** Erzeugt eine lesbare Kurzbeschreibung des gesamten Baums. */
export function describeTree(node: Node, accounts?: AccountNameMap, top = true): string {
  if (node.type !== "group") return describeCondition(node, accounts);
  if (!node.children || node.children.length === 0) return "(leer)";
  const joiner = node.op === "AND" ? " UND " : " ODER ";
  const inner = node.children.map((ch) => describeTree(ch, accounts, false)).join(joiner);
  const body = node.children.length > 1 && !top ? `(${inner})` : inner;
  return node.not ? `NICHT (${node.children.length > 1 ? inner : inner})` : body;
}
