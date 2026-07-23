"use client";

import { useMemo, useState } from "react";
import { parseAmountToCents } from "@/lib/money";
import {
  type AccountNameMap,
  type AmountOp,
  type Condition,
  type Node,
  type TextOp,
  describeTree,
} from "@/lib/rule-expr";

export interface AccountOpt {
  id: string;
  name: string;
}

// --- Editor-interne Baumstruktur (mit stabilen Keys für React) ----------------
type CondKind =
  | "COUNTERPARTY"
  | "PURPOSE"
  | "ANY_TEXT"
  | "AMOUNT"
  | "ABS_AMOUNT"
  | "account"
  | "weekday"
  | "month"
  | "date";

interface ECond {
  _key: number;
  nodeType: "cond";
  kind: CondKind;
  op: string;
  text?: string;
  amount?: string; // EUR-Eingabe
  amount2?: string;
  accountId?: string;
  days?: number[];
  months?: number[];
  date?: string;
  date2?: string;
}
interface EGroup {
  _key: number;
  nodeType: "group";
  op: "AND" | "OR";
  not: boolean;
  children: ENode[];
}
type ENode = EGroup | ECond;

let seq = 1;
const key = () => ++seq;

const KIND_LABELS: Record<CondKind, string> = {
  COUNTERPARTY: "Gegenpartei",
  PURPOSE: "Verwendungszweck",
  ANY_TEXT: "Gegenpartei o. Zweck",
  AMOUNT: "Betrag",
  ABS_AMOUNT: "Betrag (absolut)",
  account: "Konto",
  weekday: "Wochentag",
  month: "Monat",
  date: "Datum",
};

const TEXT_OPS = [
  ["CONTAINS", "enthält"],
  ["NOT_CONTAINS", "enthält nicht"],
  ["EQUALS", "ist genau"],
  ["STARTS_WITH", "beginnt mit"],
  ["ENDS_WITH", "endet mit"],
  ["REGEX", "Regex"],
] as const;
const AMOUNT_OPS = [
  ["GT", "größer >"],
  ["GTE", "≥"],
  ["LT", "kleiner <"],
  ["LTE", "≤"],
  ["EQ", "gleich ="],
  ["BETWEEN", "zwischen"],
] as const;
const ACCOUNT_OPS = [
  ["EQ", "ist"],
  ["NEQ", "ist nicht"],
] as const;
const SET_OPS = [
  ["IN", "ist"],
  ["NOT_IN", "ist nicht"],
] as const;
const DATE_OPS = [
  ["BEFORE", "vor"],
  ["AFTER", "nach"],
  ["BETWEEN", "zwischen"],
] as const;

const WEEKDAYS = [
  [1, "Mo"],
  [2, "Di"],
  [3, "Mi"],
  [4, "Do"],
  [5, "Fr"],
  [6, "Sa"],
  [0, "So"],
] as const;
const MONTHS = [
  [1, "Jan"], [2, "Feb"], [3, "Mär"], [4, "Apr"], [5, "Mai"], [6, "Jun"],
  [7, "Jul"], [8, "Aug"], [9, "Sep"], [10, "Okt"], [11, "Nov"], [12, "Dez"],
] as const;

function defaultOpFor(kind: CondKind): string {
  if (kind === "AMOUNT" || kind === "ABS_AMOUNT") return "GTE";
  if (kind === "account") return "EQ";
  if (kind === "weekday" || kind === "month") return "IN";
  if (kind === "date") return "BEFORE";
  return "CONTAINS";
}

function newCond(kind: CondKind = "PURPOSE"): ECond {
  return { _key: key(), nodeType: "cond", kind, op: defaultOpFor(kind), text: "", days: [], months: [] };
}
function newGroup(op: "AND" | "OR" = "AND"): EGroup {
  return { _key: key(), nodeType: "group", op, not: false, children: [newCond()] };
}

// --- Umwandlung Editor -> gespeicherter Baum ----------------------------------
function condToStored(c: ECond): Condition | null {
  switch (c.kind) {
    case "COUNTERPARTY":
    case "PURPOSE":
    case "ANY_TEXT": {
      const value = (c.text ?? "").trim();
      if (!value) return null;
      return { type: "text", field: c.kind, op: c.op as TextOp, value };
    }
    case "AMOUNT":
    case "ABS_AMOUNT": {
      const value = parseAmountToCents(c.amount ?? "");
      if (value == null) return null;
      if (c.op === "BETWEEN") {
        const value2 = parseAmountToCents(c.amount2 ?? "");
        if (value2 == null) return null;
        return { type: "amount", field: c.kind, op: "BETWEEN", value, value2 };
      }
      return { type: "amount", field: c.kind, op: c.op as AmountOp, value };
    }
    case "account":
      if (!c.accountId) return null;
      return { type: "account", op: c.op as "EQ" | "NEQ", accountId: c.accountId };
    case "weekday":
      if (!c.days || c.days.length === 0) return null;
      return { type: "weekday", op: c.op as "IN" | "NOT_IN", days: c.days };
    case "month":
      if (!c.months || c.months.length === 0) return null;
      return { type: "month", op: c.op as "IN" | "NOT_IN", months: c.months };
    case "date": {
      if (!c.date) return null;
      if (c.op === "BETWEEN") {
        if (!c.date2) return null;
        return { type: "date", op: "BETWEEN", date: c.date, date2: c.date2 };
      }
      return { type: "date", op: c.op as "BEFORE" | "AFTER", date: c.date };
    }
    default:
      return null;
  }
}

function nodeToStored(n: ENode): Node | null {
  if (n.nodeType === "cond") return condToStored(n);
  const children = n.children.map(nodeToStored).filter((x): x is Node => x != null);
  if (children.length === 0) return null;
  return { type: "group", op: n.op, not: n.not, children };
}

// --- Umwandlung gespeicherter Baum -> Editor (für Bearbeiten) -----------------
function centsToEuro(c: number): string {
  return (c / 100).toString().replace(".", ",");
}
function storedToNode(n: Node): ENode {
  if (n.type === "group") {
    return { _key: key(), nodeType: "group", op: n.op, not: !!n.not, children: n.children.map(storedToNode) };
  }
  const base = { _key: key(), nodeType: "cond" as const, days: [] as number[], months: [] as number[] };
  switch (n.type) {
    case "text":
      return { ...base, kind: n.field, op: n.op, text: n.value };
    case "amount":
      return { ...base, kind: n.field, op: n.op, amount: centsToEuro(n.value), amount2: n.value2 != null ? centsToEuro(n.value2) : "" };
    case "account":
      return { ...base, kind: "account", op: n.op, accountId: n.accountId };
    case "weekday":
      return { ...base, kind: "weekday", op: n.op, days: n.days };
    case "month":
      return { ...base, kind: "month", op: n.op, months: n.months };
    case "date":
      return { ...base, kind: "date", op: n.op, date: n.date, date2: n.date2 ?? "" };
  }
}

// --- UI-Komponenten -----------------------------------------------------------
function Toggle({ options, value, onChange }: { options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input w-auto py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

function ChipMulti({ options, values, onChange }: { options: readonly (readonly [number, string])[]; values: number[]; onChange: (v: number[]) => void }) {
  const toggle = (n: number) => onChange(values.includes(n) ? values.filter((x) => x !== n) : [...values, n]);
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([n, l]) => (
        <button
          key={n}
          type="button"
          onClick={() => toggle(n)}
          className={`rounded border px-2 py-1 text-xs ${values.includes(n) ? "border-brand bg-brand/10 text-brand" : "border-slate-300 text-slate-500"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function CondEditor({ node, onChange, onRemove, accounts }: { node: ECond; onChange: (n: ECond) => void; onRemove: () => void; accounts: AccountOpt[] }) {
  const set = (patch: Partial<ECond>) => onChange({ ...node, ...patch });
  const isText = node.kind === "COUNTERPARTY" || node.kind === "PURPOSE" || node.kind === "ANY_TEXT";
  const isAmount = node.kind === "AMOUNT" || node.kind === "ABS_AMOUNT";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
      {/* Art der Bedingung */}
      <select
        className="input w-auto py-1 text-sm"
        value={node.kind}
        onChange={(e) => {
          const kind = e.target.value as CondKind;
          set({ kind, op: defaultOpFor(kind) });
        }}
      >
        <optgroup label="Text">
          <option value="COUNTERPARTY">{KIND_LABELS.COUNTERPARTY}</option>
          <option value="PURPOSE">{KIND_LABELS.PURPOSE}</option>
          <option value="ANY_TEXT">{KIND_LABELS.ANY_TEXT}</option>
        </optgroup>
        <optgroup label="Betrag">
          <option value="AMOUNT">{KIND_LABELS.AMOUNT}</option>
          <option value="ABS_AMOUNT">{KIND_LABELS.ABS_AMOUNT}</option>
        </optgroup>
        <optgroup label="Weitere">
          <option value="account">{KIND_LABELS.account}</option>
          <option value="weekday">{KIND_LABELS.weekday}</option>
          <option value="month">{KIND_LABELS.month}</option>
          <option value="date">{KIND_LABELS.date}</option>
        </optgroup>
      </select>

      {/* Operator */}
      {isText && <Toggle options={TEXT_OPS} value={node.op} onChange={(op) => set({ op })} />}
      {isAmount && <Toggle options={AMOUNT_OPS} value={node.op} onChange={(op) => set({ op })} />}
      {node.kind === "account" && <Toggle options={ACCOUNT_OPS} value={node.op} onChange={(op) => set({ op })} />}
      {(node.kind === "weekday" || node.kind === "month") && <Toggle options={SET_OPS} value={node.op} onChange={(op) => set({ op })} />}
      {node.kind === "date" && <Toggle options={DATE_OPS} value={node.op} onChange={(op) => set({ op })} />}

      {/* Wert(e) */}
      {isText && (
        <input
          className="input min-w-[160px] flex-1 py-1 text-sm"
          placeholder={node.op === "REGEX" ? "regex" : "Text…"}
          value={node.text ?? ""}
          onChange={(e) => set({ text: e.target.value })}
        />
      )}
      {isAmount && (
        <>
          <input className="input w-24 py-1 text-sm" inputMode="decimal" placeholder="0,00" value={node.amount ?? ""} onChange={(e) => set({ amount: e.target.value })} />
          {node.op === "BETWEEN" && (
            <>
              <span className="text-xs text-slate-400">und</span>
              <input className="input w-24 py-1 text-sm" inputMode="decimal" placeholder="0,00" value={node.amount2 ?? ""} onChange={(e) => set({ amount2: e.target.value })} />
            </>
          )}
          <span className="text-xs text-slate-400">€</span>
        </>
      )}
      {node.kind === "account" && (
        <select className="input w-auto py-1 text-sm" value={node.accountId ?? ""} onChange={(e) => set({ accountId: e.target.value })}>
          <option value="" disabled>Konto…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
      {node.kind === "weekday" && <ChipMulti options={WEEKDAYS} values={node.days ?? []} onChange={(days) => set({ days })} />}
      {node.kind === "month" && <ChipMulti options={MONTHS} values={node.months ?? []} onChange={(months) => set({ months })} />}
      {node.kind === "date" && (
        <>
          <input type="date" className="input w-auto py-1 text-sm" value={node.date ?? ""} onChange={(e) => set({ date: e.target.value })} />
          {node.op === "BETWEEN" && (
            <>
              <span className="text-xs text-slate-400">bis</span>
              <input type="date" className="input w-auto py-1 text-sm" value={node.date2 ?? ""} onChange={(e) => set({ date2: e.target.value })} />
            </>
          )}
        </>
      )}

      <button type="button" onClick={onRemove} className="ml-auto text-xs text-slate-400 hover:text-red-600" title="Bedingung entfernen">
        ✕
      </button>
    </div>
  );
}

function GroupEditor({ node, onChange, onRemove, depth, accounts }: { node: EGroup; onChange: (n: EGroup) => void; onRemove?: () => void; depth: number; accounts: AccountOpt[] }) {
  const setChild = (i: number, child: ENode) => onChange({ ...node, children: node.children.map((c, j) => (j === i ? child : c)) });
  const removeChild = (i: number) => onChange({ ...node, children: node.children.filter((_, j) => j !== i) });

  return (
    <div className={`rounded-lg border p-2 ${depth === 0 ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-slate-100/60"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Erfülle</span>
        <select className="input w-auto py-1 text-sm" value={node.op} onChange={(e) => onChange({ ...node, op: e.target.value as "AND" | "OR" })}>
          <option value="AND">ALLE (UND)</option>
          <option value="OR">MINDESTENS EINE (ODER)</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={node.not} onChange={(e) => onChange({ ...node, not: e.target.checked })} />
          negieren (NICHT)
        </label>
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-xs text-slate-400 hover:text-red-600" title="Gruppe entfernen">
            Gruppe ✕
          </button>
        )}
      </div>

      <div className="space-y-2">
        {node.children.map((child, i) =>
          child.nodeType === "group" ? (
            <GroupEditor key={child._key} node={child} onChange={(c) => setChild(i, c)} onRemove={() => removeChild(i)} depth={depth + 1} accounts={accounts} />
          ) : (
            <CondEditor key={child._key} node={child} onChange={(c) => setChild(i, c)} onRemove={() => removeChild(i)} accounts={accounts} />
          ),
        )}
      </div>

      <div className="mt-2 flex gap-3">
        <button type="button" onClick={() => onChange({ ...node, children: [...node.children, newCond()] })} className="text-xs text-brand hover:underline">
          + Bedingung
        </button>
        {depth < 5 && (
          <button type="button" onClick={() => onChange({ ...node, children: [...node.children, newGroup(node.op === "AND" ? "OR" : "AND")] })} className="text-xs text-brand hover:underline">
            + Gruppe (Klammer)
          </button>
        )}
      </div>
    </div>
  );
}

// --- Öffentlicher Builder -----------------------------------------------------
export function RuleBuilder({ name, initial, accounts }: { name: string; initial?: Node | null; accounts: AccountOpt[] }) {
  const [root, setRoot] = useState<EGroup>(() => {
    if (initial && initial.type === "group") return storedToNode(initial) as EGroup;
    if (initial) return { _key: key(), nodeType: "group", op: "AND", not: false, children: [storedToNode(initial)] };
    return newGroup("AND");
  });

  const accMap: AccountNameMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const stored = useMemo(() => nodeToStored(root), [root]);
  const json = stored ? JSON.stringify(stored) : "";
  const preview = stored ? describeTree(stored, accMap) : "— unvollständig —";

  return (
    <div className="space-y-2">
      <GroupEditor node={root} onChange={setRoot} depth={0} accounts={accounts} />
      <input type="hidden" name={name} value={json} />
      <p className="text-xs text-slate-500">
        <span className="font-medium">Vorschau:</span> {preview}
      </p>
    </div>
  );
}
