import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { INCLUDED_ACCOUNT, getAccountsWithBalance, getTotalBalanceCents } from "@/lib/queries";
import { getKpis } from "@/lib/analytics";
import { occurrencesBetween } from "@/lib/recurrence";
import { getAnomalyDetail } from "@/lib/anomalies";
import { addMonths, isoDate, startOfDayUTC, todayUTC } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Pagination, clampPageSize } from "@/components/pagination";

export const dynamic = "force-dynamic";

type Metric =
  | "balance"
  | "income3m"
  | "expense3m"
  | "runway"
  | "workingCapital"
  | "receivables"
  | "payables"
  | "range"
  | "anomaly";

const TITLES: Record<Metric, string> = {
  balance: "Verfügbare Liquidität",
  income3m: "Ø Einnahmen / Monat — Einzahlungen der letzten 3 Monate",
  expense3m: "Ø Ausgaben / Monat — Auszahlungen der letzten 3 Monate",
  runway: "Reichweite",
  workingCapital: "Working Capital",
  receivables: "Offene Forderungen",
  payables: "Offene Verbindlichkeiten",
  range: "Bewegungen im Zeitraum",
  anomaly: "Auffälligkeit",
};

function Header({ title, total, sub }: { title: string; total?: number; sub?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Übersicht
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {total != null && (
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">Summe</div>
          <div className="text-2xl font-bold text-slate-900">{formatCents(total)}</div>
        </div>
      )}
    </div>
  );
}

async function TransactionDrill({
  title,
  direction,
  page,
  metric,
  pageSize,
}: {
  title: string;
  direction: "in" | "out";
  page: number;
  metric: Metric;
  pageSize: number;
}) {
  const PAGE_SIZE = pageSize;
  const today = todayUTC();
  const from = addMonths(today, -3);
  const where: Prisma.TransactionWhereInput = {
    account: INCLUDED_ACCOUNT,
    bookingDate: { gte: from, lt: today },
    amount: direction === "in" ? { gt: 0 } : { lt: 0 },
  };
  const [rows, count, agg] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { bookingDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { account: true, category: true },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
  ]);
  const sum = agg._sum.amount ?? 0;
  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <Header title={title} total={sum} sub={`${count} Buchungen · Monatsdurchschnitt ${formatCents(Math.round(sum / 3))}`} />
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Datum</th>
                <th className="th">Gegenpartei / Zweck</th>
                <th className="th">Konto</th>
                <th className="th">Kategorie</th>
                <th className="th text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 align-top">
                  <td className="td whitespace-nowrap">{new Date(t.bookingDate).toLocaleDateString("de-DE")}</td>
                  <td className="td max-w-sm">
                    <div className="font-medium text-slate-800">{t.counterparty || "—"}</div>
                    <div className="truncate text-xs text-slate-400">{t.purpose}</div>
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{t.account.name}</td>
                  <td className="td text-xs text-slate-500">{t.category?.name ?? "—"}</td>
                  <td className={`td whitespace-nowrap text-right font-semibold ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatCents(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} totalItems={count} pageSize={PAGE_SIZE} basePath="/drilldown" params={{ metric, size: PAGE_SIZE !== 50 ? String(PAGE_SIZE) : undefined }} />
      </div>
    </div>
  );
}

async function BalanceDrill() {
  const accounts = (await getAccountsWithBalance()).filter((a) => !a.excludedFromCalc);
  const total = accounts.reduce((s, a) => s + a.currentBalance, 0);
  return (
    <div className="space-y-6">
      <Header title={TITLES.balance} total={total} sub={`${accounts.length} Konten (ausgeschlossene Konten nicht enthalten)`} />
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Konto</th>
                <th className="th text-right">Anfangssaldo</th>
                <th className="th">Stichtag</th>
                <th className="th text-right">Umsätze</th>
                <th className="th text-right">Aktueller Saldo</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-slate-50">
                  <td className="td font-medium">{a.name}</td>
                  <td className="td text-right">{formatCents(a.openingBalance)}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">
                    {new Date(a.openingDate).toLocaleDateString("de-DE")}
                  </td>
                  <td className="td text-right text-slate-500">{a.txCount}</td>
                  <td className={`td text-right font-semibold ${a.currentBalance < 0 ? "text-red-600" : "text-slate-900"}`}>
                    {formatCents(a.currentBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function OpenItemDrill({ kind }: { kind: "RECEIVABLE" | "PAYABLE" }) {
  const items = await prisma.openItem.findMany({
    where: { paid: false, kind },
    orderBy: { dueDate: "asc" },
  });
  const today = todayUTC();
  const openOf = (i: { amount: number; paidAmount: number }) => Math.max(0, i.amount - i.paidAmount);
  const withOpen = items.filter((i) => openOf(i) > 0);
  const total = withOpen.reduce((s, i) => s + openOf(i), 0) * (kind === "PAYABLE" ? -1 : 1);
  return (
    <div className="space-y-6">
      <Header
        title={kind === "RECEIVABLE" ? TITLES.receivables : TITLES.payables}
        total={total}
        sub={`${withOpen.length} offene Posten · zur vollständigen Verwaltung: `}
      />
      <p className="-mt-3 text-sm">
        <Link href={`/open-items?kind=${kind}`} className="text-brand underline">
          Offene Posten öffnen →
        </Link>
      </p>
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Gegenpartei / Referenz</th>
                <th className="th">Fällig</th>
                <th className="th text-right">Offen</th>
              </tr>
            </thead>
            <tbody>
              {withOpen.map((i) => {
                const overdue = new Date(i.dueDate) < today;
                return (
                  <tr key={i.id} className="border-b border-slate-50">
                    <td className="td">
                      <div className="font-medium">{i.counterparty || "—"}</div>
                      {i.reference && <div className="text-xs text-slate-400">{i.reference}</div>}
                    </td>
                    <td className={`td whitespace-nowrap ${overdue ? "font-semibold text-amber-600" : ""}`}>
                      {new Date(i.dueDate).toLocaleDateString("de-DE")}
                      {overdue && " ⚠"}
                    </td>
                    <td className="td text-right font-semibold">{formatCents(openOf(i))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

async function WorkingCapitalDrill() {
  const k = await getKpis();
  const rows = [
    { label: "Verfügbare Liquidität", value: k.currentBalance, href: "/drilldown?metric=balance" },
    { label: "+ Offene Forderungen", value: k.openReceivables, href: "/drilldown?metric=receivables" },
    { label: "− Offene Verbindlichkeiten", value: -k.openPayables, href: "/drilldown?metric=payables" },
  ];
  return (
    <div className="space-y-6">
      <Header title={TITLES.workingCapital} total={k.workingCapital} sub="Saldo + offene Forderungen − offene Verbindlichkeiten" />
      <div className="card">
        <table className="w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-50">
                <td className="td">
                  <Link href={r.href} className="text-brand hover:underline">
                    {r.label}
                  </Link>
                </td>
                <td className={`td text-right font-semibold ${r.value < 0 ? "text-red-600" : "text-slate-900"}`}>
                  {formatCents(r.value)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="td font-semibold">= Working Capital</td>
              <td className={`td text-right font-bold ${k.workingCapital < 0 ? "text-red-600" : "text-slate-900"}`}>
                {formatCents(k.workingCapital)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function RunwayDrill() {
  const [k, balance] = await Promise.all([getKpis(), getTotalBalanceCents()]);
  const burn = k.netMonthly < 0 ? -k.netMonthly : 0;
  return (
    <div className="space-y-6">
      <Header title={TITLES.runway} />
      <div className="card space-y-3 text-sm text-slate-700">
        <p>
          Die Reichweite schätzt, wie lange die verfügbare Liquidität bei der aktuellen
          Netto-Verbrennung reicht (Basis: letzte 3 Monate).
        </p>
        <table className="w-full">
          <tbody>
            <tr className="border-b border-slate-50">
              <td className="td">Verfügbare Liquidität</td>
              <td className="td text-right font-semibold">{formatCents(balance)}</td>
            </tr>
            <tr className="border-b border-slate-50">
              <td className="td">Ø Netto / Monat</td>
              <td className={`td text-right font-semibold ${k.netMonthly < 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatCents(k.netMonthly)}
              </td>
            </tr>
            <tr className="bg-slate-50">
              <td className="td font-semibold">Reichweite</td>
              <td className="td text-right font-bold">
                {burn === 0 ? "∞ (kein Netto-Verlust)" : `${k.runwayMonths} Monate`}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-slate-400">
          Detaillierte Vorschau unter <Link href="/scenarios" className="text-brand underline">Szenarien</Link> und{" "}
          <Link href="/planning" className="text-brand underline">Planung</Link>.
        </p>
      </div>
    </div>
  );
}

async function RangeDrill({ from, to }: { from: string; to: string }) {
  const today = todayUTC();
  const fromD = startOfDayUTC(new Date(from + "T00:00:00Z"));
  const toD = startOfDayUTC(new Date(to + "T00:00:00Z"));
  const toExcl = new Date(toD.getTime() + 86_400_000);

  const [txs, openItems, planned] = await Promise.all([
    prisma.transaction.findMany({
      where: { bookingDate: { gte: fromD, lt: toExcl }, account: INCLUDED_ACCOUNT },
      orderBy: { bookingDate: "asc" },
      include: { account: true, category: true },
    }),
    prisma.openItem.findMany({ where: { paid: false }, select: { kind: true, amount: true, paidAmount: true, dueDate: true, counterparty: true, reference: true } }),
    prisma.plannedItem.findMany({ where: { active: true } }),
  ]);

  type Row = { date: string; label: string; sub?: string | null; amount: number; type: string };
  const rows: Row[] = [];
  for (const t of txs) rows.push({ date: isoDate(t.bookingDate), label: t.counterparty || t.purpose || "Umsatz", sub: t.category?.name ?? t.account.name, amount: t.amount, type: "realisiert" });
  for (const oi of openItems) {
    const remaining = Math.max(0, oi.amount - oi.paidAmount);
    if (remaining <= 0) continue;
    const eff = oi.dueDate.getTime() < today.getTime() ? today : startOfDayUTC(oi.dueDate);
    if (eff.getTime() < fromD.getTime() || eff.getTime() >= toExcl.getTime()) continue;
    rows.push({ date: isoDate(eff), label: oi.counterparty || (oi.kind === "RECEIVABLE" ? "Forderung" : "Verbindlichkeit"), sub: oi.reference, amount: oi.kind === "RECEIVABLE" ? remaining : -remaining, type: oi.dueDate.getTime() < today.getTime() ? "überfällig" : "geplant" });
  }
  for (const p of planned) {
    for (const occ of occurrencesBetween(p, fromD, toD)) {
      rows.push({ date: isoDate(occ), label: p.name, sub: "Planposten", amount: p.amount, type: "geplant" });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <Header title={`Bewegungen ${new Date(from).toLocaleDateString("de-DE")} – ${new Date(to).toLocaleDateString("de-DE")}`} total={total} sub={`${rows.length} Positionen`} />
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Bewegungen in diesem Zeitraum.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="th">Datum</th><th className="th">Position</th><th className="th">Art</th><th className="th text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="td whitespace-nowrap">{new Date(r.date).toLocaleDateString("de-DE")}</td>
                  <td className="td"><div className="font-medium text-slate-700">{r.label}</div>{r.sub && <div className="text-xs text-slate-400">{r.sub}</div>}</td>
                  <td className="td"><span className={`badge ${r.type === "realisiert" ? "bg-slate-100 text-slate-600" : r.type === "überfällig" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{r.type}</span></td>
                  <td className={`td text-right font-semibold tabular-nums ${r.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>{formatCents(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

async function AnomalyDrill({ dkey }: { dkey: string }) {
  const detail = await getAnomalyDetail(dkey);
  const total = detail.rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const hasAmounts = detail.rows.some((r) => r.amount != null);
  return (
    <div className="space-y-6">
      <Header title={detail.title} total={hasAmounts ? total : undefined} sub={`${detail.rows.length} betroffene Positionen`} />
      {detail.note && <p className="-mt-3 text-sm text-slate-500">{detail.note}</p>}
      {detail.pageHref && (
        <p className="-mt-3 text-sm">
          <Link href={detail.pageHref} className="text-brand underline">{detail.pageLabel ?? "Seite öffnen"} →</Link>
        </p>
      )}
      <div className="card overflow-x-auto">
        {detail.rows.length === 0 ? (
          <p className="text-sm text-slate-400">Aktuell keine betroffenen Objekte.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="th">Position</th>
                <th className="th">Datum</th>
                <th className="th text-right">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="td">
                    <div className="font-medium text-slate-700">{r.label}</div>
                    {r.sub && <div className="text-xs text-slate-400">{r.sub}</div>}
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">
                    {r.date ? new Date(r.date).toLocaleDateString("de-DE") : "—"}
                    {r.badge && <span className="ml-2 badge bg-amber-100 text-amber-700">{r.badge}</span>}
                  </td>
                  <td className={`td text-right font-semibold tabular-nums ${r.amount != null && r.amount < 0 ? "text-red-600" : "text-slate-800"}`}>
                    {r.amount != null ? formatCents(r.amount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default async function DrilldownPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; page?: string; from?: string; to?: string; key?: string; size?: string }>;
}) {
  const sp = await searchParams;
  const metric = (sp.metric ?? "balance") as Metric;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = clampPageSize(sp.size);

  switch (metric) {
    case "range":
      if (sp.from && sp.to) return <RangeDrill from={sp.from} to={sp.to} />;
      break;
    case "anomaly":
      if (sp.key) return <AnomalyDrill dkey={sp.key} />;
      break;
  }

  switch (metric) {
    case "income3m":
      return <TransactionDrill title={TITLES.income3m} direction="in" page={page} metric={metric} pageSize={pageSize} />;
    case "expense3m":
      return <TransactionDrill title={TITLES.expense3m} direction="out" page={page} metric={metric} pageSize={pageSize} />;
    case "receivables":
      return <OpenItemDrill kind="RECEIVABLE" />;
    case "payables":
      return <OpenItemDrill kind="PAYABLE" />;
    case "workingCapital":
      return <WorkingCapitalDrill />;
    case "runway":
      return <RunwayDrill />;
    case "balance":
    default:
      return <BalanceDrill />;
  }
}
