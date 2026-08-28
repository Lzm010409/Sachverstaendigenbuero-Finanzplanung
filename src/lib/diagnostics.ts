// Selbsttest-/Diagnose-Bibliothek. Prüft Datenvalidität (DB-Invarianten),
// Belastbarkeit der Rechen-Engines und – im Deep-Modus – die Integrationen.
// Wird sowohl vom gesicherten HTTP-Endpunkt (/api/diagnostics) als auch vom
// CLI-Selbsttest (scripts/selftest.ts) genutzt. Gibt AUSSCHLIESSLICH Aggregate
// zurück (Zahlen/Status), niemals Kunden-/Lieferantennamen oder Token.

import { prisma } from "./db";
import {
  getAccountsWithBalance,
  getForecast,
  getScenarioConfig,
  getTotalBalanceCents,
} from "./queries";
import { getCashflowMatrix, getCategoryBreakdown, getKpis } from "./analytics";
import { getWeeklyForecast } from "./planning";
import { isValidTree } from "./rule-expr";
import { formatCents } from "./money";
import { getPipedriveToken, getSevdeskToken } from "./settings";
import {
  fetchCheckAccounts,
  fetchOpenInvoices,
  fetchOpenVouchers,
  fetchVoucherClassification,
} from "./sevdesk";
import { todayUTC } from "./dates";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  detail: string;
  metric?: number | string;
}

export interface SuiteResult {
  name: string;
  status: CheckStatus;
  durationMs: number;
  checks: CheckResult[];
}

export interface DiagnosticReport {
  ok: boolean;
  status: CheckStatus;
  startedAt: string;
  durationMs: number;
  deep: boolean;
  counts: { pass: number; warn: number; fail: number; total: number };
  suites: SuiteResult[];
  // Roh-Aggregat der Beleg-Klassifikation (nur Deep) – hilft, die Zuordnung
  // Forderung/Verbindlichkeit zu prüfen. Enthält keine Namen.
  voucherClassification?: Record<string, unknown>;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MONOTONIC = (a: CheckStatus, b: CheckStatus): CheckStatus => {
  const rank = { pass: 0, warn: 1, fail: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};

function worst(checks: CheckResult[]): CheckStatus {
  return checks.reduce<CheckStatus>((acc, c) => MONOTONIC(acc, c.status), "pass");
}

// Kleiner Helfer: baut ein CheckResult, der Status ergibt sich aus einer
// Bedingung (ok) plus optionaler Warn-Bedingung.
function check(
  id: string,
  name: string,
  status: CheckStatus,
  detail: string,
  metric?: number | string,
): CheckResult {
  return { id, name, status, detail, metric };
}

async function runSuite(
  name: string,
  fn: () => Promise<CheckResult[]>,
): Promise<SuiteResult> {
  const t0 = Date.now();
  let checks: CheckResult[];
  try {
    checks = await fn();
  } catch (e) {
    checks = [check(`${name}.crash`, `${name} abgebrochen`, "fail", (e as Error).message)];
  }
  return { name, status: worst(checks), durationMs: Date.now() - t0, checks };
}

// ---------------------------------------------------------------------------
// Suite 1: Datenintegrität
// ---------------------------------------------------------------------------
async function dataIntegrity(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const today = todayUTC();

  // Konten
  const accounts = await prisma.account.findMany({
    select: { id: true, currency: true, externalId: true, source: true, openingDate: true },
  });
  out.push(check("acc.count", "Konten vorhanden", accounts.length > 0 ? "pass" : "warn",
    `${accounts.length} Konten`, accounts.length));
  const noCurrency = accounts.filter((a) => !a.currency).length;
  out.push(check("acc.currency", "Konten haben Währung", noCurrency === 0 ? "pass" : "warn",
    noCurrency === 0 ? "alle gesetzt" : `${noCurrency} ohne Währung`, noCurrency));
  const extKeys = accounts.filter((a) => a.externalId).map((a) => `${a.source}:${a.externalId}`);
  const dupExt = extKeys.length - new Set(extKeys).size;
  out.push(check("acc.dupExternal", "Keine doppelten externen Konto-IDs", dupExt === 0 ? "pass" : "fail",
    dupExt === 0 ? "eindeutig" : `${dupExt} Duplikate`, dupExt));

  // Transaktionen
  const [txCount, txZero, txAgg] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { amount: 0 } }),
    prisma.transaction.aggregate({ _min: { bookingDate: true }, _max: { bookingDate: true } }),
  ]);
  out.push(check("tx.count", "Transaktionen vorhanden", txCount > 0 ? "pass" : "warn",
    `${txCount} Umsätze`, txCount));
  out.push(check("tx.zeroAmount", "Keine 0-Betrag-Umsätze", txZero === 0 ? "pass" : "warn",
    txZero === 0 ? "keine" : `${txZero} mit Betrag 0`, txZero));
  const minD = txAgg._min.bookingDate;
  const maxD = txAgg._max.bookingDate;
  const farFuture = new Date(today);
  farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 2);
  const tooOld = minD ? minD < new Date("2000-01-01") : false;
  const tooNew = maxD ? maxD > farFuture : false;
  out.push(check("tx.dateRange", "Buchungsdaten plausibel", !tooOld && !tooNew ? "pass" : "warn",
    minD && maxD ? `${minD.toISOString().slice(0, 10)} … ${maxD.toISOString().slice(0, 10)}` : "keine Daten"));

  // Kategorien
  const categories = await prisma.category.findMany({ select: { id: true, color: true } });
  const negBudget = await prisma.budget.count({ where: { deletedAt: null, amount: { lt: 0 } } });
  out.push(check("cat.budget", "Keine negativen Budgets", negBudget === 0 ? "pass" : "fail",
    negBudget === 0 ? "ok" : `${negBudget} negativ`, negBudget));
  const badColor = categories.filter((c) => !HEX_COLOR.test(c.color)).length;
  out.push(check("cat.color", "Kategoriefarben gültig", badColor === 0 ? "pass" : "warn",
    badColor === 0 ? "ok" : `${badColor} ungültig`, badColor));

  // Regeln: Bedingungs-Baum strukturell gültig?
  const rules = await prisma.rule.findMany({ select: { conditions: true } });
  const invalidRule = rules.filter((r) => !isValidTree(r.conditions)).length;
  out.push(check("rule.valid", "Regel-Bedingungen gültig", invalidRule === 0 ? "pass" : "warn",
    invalidRule === 0 ? "ok" : `${invalidRule} ungültig/leer`, invalidRule));

  // Offene Posten
  const openItems = await prisma.openItem.findMany({
    select: { kind: true, amount: true, paidAmount: true, dueDate: true, paid: true, source: true },
  });
  const badAmount = openItems.filter((o) => o.amount <= 0).length;
  out.push(check("oi.amount", "Offene Posten mit positivem Betrag", badAmount === 0 ? "pass" : "fail",
    badAmount === 0 ? "ok" : `${badAmount} <= 0`, badAmount));
  const badPaid = openItems.filter((o) => o.paidAmount < 0 || o.paidAmount > o.amount).length;
  out.push(check("oi.paid", "Bezahlter Anteil im gültigen Bereich", badPaid === 0 ? "pass" : "fail",
    badPaid === 0 ? "ok" : `${badPaid} außerhalb 0…Betrag`, badPaid));
  const openWithNoRemainder = openItems.filter((o) => !o.paid && o.amount - o.paidAmount <= 2).length;
  out.push(check("oi.settledButOpen", "Keine (fast) beglichenen offenen Posten", openWithNoRemainder === 0 ? "pass" : "warn",
    openWithNoRemainder === 0 ? "ok" : `${openWithNoRemainder} mit Rest <= 2ct offen`, openWithNoRemainder));

  const open = openItems.filter((o) => !o.paid);
  const recv = open.filter((o) => o.kind === "RECEIVABLE").length;
  const pay = open.filter((o) => o.kind === "PAYABLE").length;
  const overdue = open.filter((o) => o.dueDate < today).length;
  out.push(check("oi.kindSplit", "Forderungen/Verbindlichkeiten getrennt",
    // Wenn sevDesk-Belege existieren, aber KEINE Verbindlichkeit klassifiziert
    // wurde, deutet das auf einen Klassifizierungsfehler hin.
    (open.some((o) => o.source === "sevdesk-voucher") && pay === 0) ? "warn" : "pass",
    `Forderungen=${recv}, Verbindlichkeiten=${pay}`, `${recv}/${pay}`));
  out.push(check("oi.overdue", "Überfällige offene Posten (Info)", "pass",
    `${overdue} überfällig`, overdue));

  // Szenarien
  const scenarios = await prisma.scenario.findMany();
  const badFactor = scenarios.filter(
    (s) => s.inflowFactor <= 0 || s.inflowFactor > 10 || s.outflowFactor <= 0 || s.outflowFactor > 10,
  ).length;
  out.push(check("scn.factor", "Szenario-Faktoren plausibel", badFactor === 0 ? "pass" : "warn",
    badFactor === 0 ? "ok" : `${badFactor} außerhalb 0…10`, badFactor));

  // Planposten
  const planned = await prisma.plannedItem.findMany({ select: { amount: true, startDate: true, endDate: true } });
  const badRange = planned.filter((p) => p.endDate && p.endDate < p.startDate).length;
  out.push(check("plan.range", "Planposten-Zeiträume gültig", badRange === 0 ? "pass" : "fail",
    badRange === 0 ? "ok" : `${badRange} Ende vor Start`, badRange));

  return out;
}

// ---------------------------------------------------------------------------
// Suite 2: Belastbarkeit der Rechen-Engines
// ---------------------------------------------------------------------------
function isFiniteInt(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

async function engineRobustness(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];

  const balance = await getTotalBalanceCents();
  out.push(check("eng.balance", "Gesamtsaldo berechenbar", isFiniteInt(balance) ? "pass" : "fail",
    `${(balance / 100).toFixed(2)} €`, balance));

  const accts = await getAccountsWithBalance();
  const badBal = accts.filter((a) => !isFiniteInt(a.currentBalance)).length;
  out.push(check("eng.accountBalances", "Konto-Salden berechenbar", badBal === 0 ? "pass" : "fail",
    badBal === 0 ? `${accts.length} Konten ok` : `${badBal} ungültig`, accts.length));

  for (const h of [90, 365]) {
    const f = await getForecast(h);
    const bad = f.points.filter((p) => !isFiniteInt(p.balance) || !isFiniteInt(p.inflow) || !isFiniteInt(p.outflow)).length;
    out.push(check(`eng.forecast${h}`, `Forecast ${h} Tage stabil`, f.points.length > 0 && bad === 0 ? "pass" : "fail",
      `${f.points.length} Punkte, ${bad} ungültig`, f.points.length));
  }

  // Forecast-Rekonziliation: Endsaldo = Startsaldo + Zuflüsse - Abflüsse; und
  // jeder Tagespunkt = Vortag + Zufluss - Abfluss.
  {
    const f = await getForecast(120);
    const start = f.points[0] ? f.points[0].balance - f.points[0].inflow + f.points[0].outflow : balance;
    const reconEnd = start + f.totalInflow - f.totalOutflow;
    let stepErr = 0;
    for (let i = 1; i < f.points.length; i++) {
      if (Math.abs((f.points[i - 1].balance + f.points[i].inflow - f.points[i].outflow) - f.points[i].balance) > 1) stepErr++;
    }
    const ok = Math.abs(reconEnd - f.endBalance) <= 1 && stepErr === 0;
    out.push(check("eng.forecastRecon", "Forecast rekonziliert (Saldo = Start + Zu − Ab)", ok ? "pass" : "fail",
      ok ? "schlüssig" : `Endabweichung ${formatCents(reconEnd - f.endBalance)}, ${stepErr} Tagesfehler`));
  }

  // Cashflow-Matrix: Liquiditäts-Walk + realisiert/geplant = Gesamt.
  const m = await getCashflowMatrix(6, 6);
  let walkErrors = 0;
  let splitErrors = 0;
  for (const mo of m.months) {
    if (Math.abs(mo.startLiquidity + mo.net - mo.endLiquidity) > 1) walkErrors++;
    if (Math.abs(mo.inflowRealized + mo.inflowPlanned - mo.inflow) > 1) splitErrors++;
    if (Math.abs(mo.outflowRealized + mo.outflowPlanned - mo.outflow) > 1) splitErrors++;
  }
  for (let i = 0; i + 1 < m.months.length; i++) {
    if (Math.abs(m.months[i].endLiquidity - m.months[i + 1].startLiquidity) > 1) walkErrors++;
  }
  out.push(check("eng.cashflowWalk", "Liquiditäts-Walk konsistent", walkErrors === 0 ? "pass" : "fail",
    walkErrors === 0 ? `${m.months.length} Monate schlüssig` : `${walkErrors} Inkonsistenzen`, walkErrors));

  // Anker-Rekonziliation: Der Walk MUSS am heutigen echten Kontostand hängen.
  // Vom Start des laufenden Monats bis heute sind nur die realisierten Bewegungen
  // geflossen – also: startLiquidität(akt. Monat) + realisiert-bisher = Saldo.
  // (Fängt Anker-Fehler, die die reine Start+Netto=Ende-Prüfung NICHT sieht.)
  const cur = m.months.find((mo) => mo.isCurrent);
  if (cur) {
    const realizedToToday = cur.inflowRealized - cur.outflowRealized;
    const anchorDiff = cur.startLiquidity + realizedToToday - balance;
    const anchorOk = Math.abs(anchorDiff) <= 2;
    out.push(check("eng.cashflowAnchor", "Liquiditäts-Walk am Kontostand verankert", anchorOk ? "pass" : "fail",
      anchorOk ? "Start akt. Monat + realisiert = Saldo" : `Abweichung ${formatCents(anchorDiff)}`, Math.abs(anchorDiff)));
  }
  out.push(check("eng.cashflowSplit", "Realisiert + geplant = Gesamt", splitErrors === 0 ? "pass" : "fail",
    splitErrors === 0 ? "stimmig" : `${splitErrors} Abweichungen`, splitErrors));

  // Historisches Fenster (12 Monate zurück): Walk muss ebenso konsistent sein.
  {
    const hm = await getCashflowMatrix(6, 6, 12);
    let e = 0;
    for (const mo of hm.months) if (Math.abs(mo.startLiquidity + mo.net - mo.endLiquidity) > 1) e++;
    for (let i = 0; i + 1 < hm.months.length; i++) if (Math.abs(hm.months[i].endLiquidity - hm.months[i + 1].startLiquidity) > 1) e++;
    out.push(check("eng.cashflowHistory", "Historisches Fenster konsistent", e === 0 ? "pass" : "fail",
      e === 0 ? "12 Monate zurück schlüssig" : `${e} Inkonsistenzen`, e));
  }

  // 13-Wochen-Vorschau: Start + Netto = Ende und lückenlose Verkettung.
  {
    const { weeks } = await getWeeklyForecast(13, undefined, 0);
    let weekErr = 0;
    for (const w of weeks) if (Math.abs(w.startLiquidity + w.net - w.endLiquidity) > 1) weekErr++;
    for (let i = 0; i + 1 < weeks.length; i++) {
      if (Math.abs(weeks[i].endLiquidity - weeks[i + 1].startLiquidity) > 1) weekErr++;
    }
    for (const w of weeks) if (Math.abs(w.inflowRealized + w.inflowPlanned - w.inflow) > 1) weekErr++;
    out.push(check("eng.weeklyWalk", "13-Wochen-Walk konsistent (Start+Netto=Ende)", weekErr === 0 ? "pass" : "fail",
      weekErr === 0 ? `${weeks.length} Wochen schlüssig` : `${weekErr} Inkonsistenzen`, weekErr));
  }

  // KPIs: Working Capital muss aus Saldo + Forderungen - Verbindlichkeiten folgen.
  const k = await getKpis();
  const wcExpected = k.currentBalance + k.openReceivables - k.openPayables;
  const wcOk = Math.abs(wcExpected - k.workingCapital) <= 1;
  const kpisFinite = [k.currentBalance, k.avgMonthlyIncome, k.avgMonthlyExpense, k.netMonthly,
    k.openReceivables, k.openPayables, k.workingCapital].every(isFiniteInt);
  out.push(check("eng.kpis", "Kennzahlen konsistent", wcOk && kpisFinite ? "pass" : "fail",
    wcOk && kpisFinite ? "Working Capital stimmig" : "Inkonsistenz in KPIs"));

  for (const g of ["week", "month", "year"] as const) {
    const b = await getCategoryBreakdown(g);
    const rows = [...b.incomeRows, ...b.expenseRows];
    const bad = rows.filter((r) => r.values.some((v) => !isFiniteInt(v))).length;
    out.push(check(`eng.breakdown.${g}`, `Auswertung (${g}) stabil`, bad === 0 ? "pass" : "fail",
      `${rows.length} Zeilen, ${bad} ungültig`, rows.length));
  }

  await getScenarioConfig(); // wirft nicht -> ok
  out.push(check("eng.scenario", "Szenario-Konfiguration ladbar", "pass", "ok"));

  return out;
}

// ---------------------------------------------------------------------------
// Suite 3: Integrationen (nur Deep-Modus, macht Live-Netzwerkaufrufe)
// ---------------------------------------------------------------------------
async function integrationHealth(report: DiagnosticReport): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const today = todayUTC();

  const sevToken = await getSevdeskToken();
  if (!sevToken) {
    out.push(check("sev.token", "sevDesk-Token vorhanden", "warn", "kein Token hinterlegt"));
  } else {
    try {
      const accs = await fetchCheckAccounts(sevToken);
      out.push(check("sev.accounts", "sevDesk erreichbar (Konten)", "pass", `${accs.length} Konten`, accs.length));
    } catch (e) {
      out.push(check("sev.accounts", "sevDesk erreichbar (Konten)", "fail", (e as Error).message));
    }

    try {
      const [inv, vou] = await Promise.all([fetchOpenInvoices(sevToken), fetchOpenVouchers(sevToken)]);
      const items = [...inv, ...vou];
      out.push(check("sev.openInvoices", "Offene Rechnungen abrufbar", "pass", `${inv.length} Rechnungen`, inv.length));
      const vr = vou.filter((v) => v.kind === "RECEIVABLE").length;
      const vp = vou.filter((v) => v.kind === "PAYABLE").length;
      out.push(check("sev.openVouchers", "Offene Belege abrufbar", "pass",
        `${vou.length} Belege (Forderung=${vr}, Verbindlichkeit=${vp})`, vou.length));

      // Regressions-Wächter: kein (fast) bezahlter Posten darf offen auftauchen.
      const leak = items.filter((i) => i.amountCents - i.paidAmountCents <= 2).length;
      out.push(check("sev.paidLeak", "Keine bezahlten Posten als offen", leak === 0 ? "pass" : "fail",
        leak === 0 ? "ok" : `${leak} Mini-Restbeträge offen`, leak));

      // Fälligkeiten plausibel (kein Jahr < 2000 oder > 2100).
      const badDue = items.filter((i) => {
        const y = i.dueDate.getUTCFullYear();
        return y < 2000 || y > 2100;
      }).length;
      out.push(check("sev.dueDates", "Fälligkeiten plausibel", badDue === 0 ? "pass" : "warn",
        badDue === 0 ? "ok" : `${badDue} unplausibel`, badDue));

      const overdueP = vou.filter((v) => v.kind === "PAYABLE" && v.dueDate < today).length;
      out.push(check("sev.overduePayables", "Überfällige Verbindlichkeiten (Info)", "pass",
        `${overdueP} überfällig`, overdueP));
    } catch (e) {
      out.push(check("sev.openItems", "Offene Posten abrufbar", "fail", (e as Error).message));
    }

    // Beleg-Klassifikation als Aggregat in den Report legen (Diagnosehilfe).
    try {
      const cls = await fetchVoucherClassification(sevToken);
      report.voucherClassification = {
        total: cls.total,
        byCreditDebit: cls.byCreditDebit,
        byVoucherType: cls.byVoucherType,
        byCreditDebitAndSign: cls.byCreditDebitAndSign,
      };
      out.push(check("sev.voucherClass", "Beleg-Klassifikation erhoben", "pass",
        `creditDebit=${JSON.stringify(cls.byCreditDebit)} voucherType=${JSON.stringify(cls.byVoucherType)}`));
    } catch {
      /* nicht kritisch */
    }
  }

  const pipeToken = await getPipedriveToken();
  if (!pipeToken) {
    out.push(check("pipe.token", "Pipedrive-Token vorhanden", "warn", "kein Token hinterlegt"));
  } else {
    const contacts = await prisma.contact.count();
    out.push(check("pipe.contacts", "Pipedrive-Kontakte in DB", "pass", `${contacts} Kontakte`, contacts));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Orchestrierung
// ---------------------------------------------------------------------------
export async function runDiagnostics(opts: { deep?: boolean } = {}): Promise<DiagnosticReport> {
  const deep = !!opts.deep;
  const t0 = Date.now();
  const report: DiagnosticReport = {
    ok: true,
    status: "pass",
    startedAt: new Date().toISOString(),
    durationMs: 0,
    deep,
    counts: { pass: 0, warn: 0, fail: 0, total: 0 },
    suites: [],
  };

  report.suites.push(await runSuite("Datenintegrität", dataIntegrity));
  report.suites.push(await runSuite("Rechen-Engines", engineRobustness));
  if (deep) {
    report.suites.push(await runSuite("Integrationen", () => integrationHealth(report)));
  }

  for (const s of report.suites) {
    for (const c of s.checks) {
      report.counts[c.status]++;
      report.counts.total++;
    }
  }
  report.status = report.suites.reduce<CheckStatus>((acc, s) => MONOTONIC(acc, s.status), "pass");
  report.ok = report.status !== "fail";
  report.durationMs = Date.now() - t0;
  return report;
}

/** Kompakte Textzusammenfassung (für CLI-Logs / ?format=text). */
export function formatReport(r: DiagnosticReport): string {
  const icon = { pass: "✓", warn: "!", fail: "✗" } as const;
  const lines: string[] = [];
  lines.push(
    `Selbsttest: ${r.status.toUpperCase()} — ${r.counts.pass}✓ ${r.counts.warn}! ${r.counts.fail}✗ ` +
      `(${r.counts.total} Checks, ${r.durationMs}ms, deep=${r.deep})`,
  );
  for (const s of r.suites) {
    lines.push(`\n[${icon[s.status]}] ${s.name} (${s.durationMs}ms)`);
    for (const c of s.checks) {
      lines.push(`   ${icon[c.status]} ${c.name}: ${c.detail}`);
    }
  }
  if (r.voucherClassification) {
    lines.push(`\nBeleg-Klassifikation: ${JSON.stringify(r.voucherClassification)}`);
  }
  return lines.join("\n");
}
