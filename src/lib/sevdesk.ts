import { startOfDayUTC } from "./dates";

// Client für die sevDesk-API v1. Wir lesen Bankkonten (CheckAccount) und deren
// Umsätze (CheckAccountTransaction). Auth-Header: `Authorization: <token>`.

const BASE = "https://my.sevdesk.de/api/v1";

export interface SevdeskAccount {
  id: string;
  name: string;
  type: string | null;
  currency: string | null;
  iban: string | null;
  balance: number | null; // aktueller Kontostand laut sevDesk (falls im Objekt enthalten)
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export interface MappedTransaction {
  externalId: string;
  date: Date;
  amountCents: number;
  counterparty: string;
  purpose: string;
}

interface RawSevObject {
  [k: string]: unknown;
}

async function sevGet(path: string, token: string): Promise<RawSevObject[]> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`sevDesk ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { objects?: RawSevObject[] };
  return Array.isArray(data.objects) ? data.objects : [];
}

export async function fetchCheckAccounts(token: string): Promise<SevdeskAccount[]> {
  const objs = await sevGet(`/CheckAccount?limit=1000`, token);
  return objs.map((o) => ({
    id: String(o.id),
    name: String(o.name ?? "sevDesk-Konto"),
    type: o.type != null ? String(o.type) : null,
    currency: o.currency != null ? String(o.currency) : null,
    iban: o.iban != null ? String(o.iban) : null,
    balance: toNumberOrNull(o.balance),
  }));
}

/**
 * Aktuellen Kontostand aus sevDesk holen (getBalanceAtDate, Stichtag heute).
 * Liefert Cent oder null. Robust gegenüber Zahl/String/verschachtelter Antwort.
 */
export async function fetchAccountBalanceCents(
  token: string,
  accountId: string,
  atUnixSeconds: number,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${BASE}/CheckAccount/${encodeURIComponent(accountId)}/getBalanceAtDate?date=${atUnixSeconds}`,
      { headers: { Authorization: token, Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { objects?: unknown };
    const o = data.objects;
    const num =
      typeof o === "object" && o !== null
        ? toNumberOrNull((o as Record<string, unknown>).balance ?? (o as Record<string, unknown>).value)
        : toNumberOrNull(o);
    return num == null ? null : Math.round(num * 100);
  } catch {
    return null;
  }
}

/** Wandelt einen rohen sevDesk-Umsatz in unser Zwischenformat (oder null). */
export function mapTransaction(o: RawSevObject): MappedTransaction | null {
  const id = o.id != null ? String(o.id) : "";
  if (!id) return null;
  const amountRaw = o.amount != null ? String(o.amount) : "";
  const amount = Number(amountRaw.replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const dateStr = String(o.valueDate ?? o.entryDate ?? "");
  // Kalenderdatum direkt aus dem ISO-String übernehmen, damit ein
  // Zeitzonen-Offset (z.B. +02:00) das Datum nicht auf den Vortag verschiebt.
  let date: Date;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (ymd) {
    date = startOfDayUTC(new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))));
  } else {
    const parsed = dateStr ? new Date(dateStr) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return null;
    date = startOfDayUTC(parsed);
  }
  return {
    externalId: id,
    date,
    amountCents: Math.round(amount * 100),
    counterparty: String(o.payeePayerName ?? "").trim(),
    purpose: String(o.paymtPurpose ?? o.paymentPurpose ?? "").trim(),
  };
}

export interface SevdeskOpenItem {
  externalId: string;
  source: string;
  kind: "RECEIVABLE" | "PAYABLE";
  counterparty: string;
  reference: string | null;
  amountCents: number; // Bruttobetrag, positiv
  paidAmountCents: number; // bereits bezahlter Anteil
  dueDate: Date;
  // Mahnstufe aus sevDesk (Rechnungsfeld dunningLevel: 1=Zahlungserinnerung,
  // 2=1. Mahnung, 3=2. Mahnung; null=keine). Belege haben keine -> 0.
  reminderLevel: number;
}

// Restbetrag bis zu dem ein Beleg als "abgeschlossen" gilt. sevDesk rundet
// intern teils auf den Cent, sodass vollständig bezahlte Belege einen Rest von
// 0,01 € zeigen können – dieser darf nicht als offener Posten auftauchen.
const SETTLED_TOLERANCE_CENTS = 2;

// Status 1000 = von sevDesk als vollständig bezahlt markiert (sowohl Rechnung
// als auch Beleg). Solche Belege sind nie offen.
const STATUS_PAID = 1000;

// Bereits bezahlter Anteil eines Belegs/Rechnung. sevDesk liefert dies in
// `paidAmount` (ggf. auch sumGrossPaid/sumPaid).
function paidCents(o: RawSevObject, gross: number): number {
  const paid = toNumberOrNull(o.paidAmount ?? o.sumGrossPaid ?? o.sumPaid);
  if (paid == null) return 0;
  return Math.min(Math.round(Math.abs(paid) * 100), Math.round(Math.abs(gross) * 100));
}

function firstStr(o: RawSevObject, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "object" && v !== null) {
      const nm = (v as RawSevObject).name;
      if (typeof nm === "string" && nm.trim()) return nm.trim();
    }
  }
  return "";
}

function firstDate(o: RawSevObject, keys: string[]): Date | null {
  for (const k of keys) {
    const s = o[k] != null ? String(o[k]) : "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return startOfDayUTC(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  }
  return null;
}

// Rechnungen (Ausgangsrechnungen) -> offene Forderungen (nur unbezahlte).
export async function fetchOpenInvoices(token: string): Promise<SevdeskOpenItem[]> {
  const objs = await sevGet(`/Invoice?limit=1000&embed=contact`, token);
  const out: SevdeskOpenItem[] = [];
  for (const o of objs) {
    const status = Number(o.status ?? 0);
    if (status < 200) continue; // Entwürfe überspringen
    if (status >= STATUS_PAID) continue; // von sevDesk als bezahlt markiert
    const amount = toNumberOrNull(o.sumGross ?? o.sumgross);
    if (amount == null || amount === 0) continue;
    const grossCents = Math.round(Math.abs(amount) * 100);
    const paid = paidCents(o, amount);
    if (grossCents - paid <= SETTLED_TOLERANCE_CENTS) continue; // (nahezu) vollständig bezahlt
    const date = firstDate(o, ["invoiceDate", "deliveryDate", "createDate"]) ?? startOfDayUTC(new Date());
    // Fälligkeit = Rechnungsdatum + Zahlungsziel (timeToPay). `payDate` ist das
    // tatsächliche Zahldatum (bei offenen Rechnungen null) – nicht die Fälligkeit.
    const timeToPay = Number(o.timeToPay ?? 0);
    const due = addDaysLocal(date, Number.isFinite(timeToPay) ? timeToPay : 0);
    out.push({
      externalId: String(o.id),
      source: "sevdesk-invoice",
      kind: "RECEIVABLE",
      counterparty: firstStr(o, ["contact", "contactName", "header"]) || "Rechnung",
      reference: firstStr(o, ["invoiceNumber", "header"]) || null,
      amountCents: grossCents,
      paidAmountCents: paid,
      dueDate: due,
      reminderLevel: Math.min(3, Math.max(0, Math.floor(Number(o.dunningLevel) || 0))),
    });
  }
  return out;
}

// Belege (Eingangsrechnungen/Ausgaben) -> offene Verbindlichkeiten (unbezahlt).
export async function fetchOpenVouchers(
  token: string,
  opts?: { excludeRecurring?: boolean },
): Promise<SevdeskOpenItem[]> {
  const excludeRecurring = opts?.excludeRecurring ?? true;
  const objs = await sevGet(`/Voucher?limit=1000&embed=supplier`, token);
  const out: SevdeskOpenItem[] = [];
  for (const o of objs) {
    const status = Number(o.status ?? 0);
    if (status < 100) continue; // Entwürfe überspringen
    if (status >= STATUS_PAID) continue; // von sevDesk als bezahlt markiert
    // Wiederkehrende Beleg-Vorlagen (voucherType "RV") sind keine echten
    // Fälligkeiten – sevDesk erzeugt daraus periodisch die tatsächlichen Belege.
    // Der Nutzer deckt diese Liquidität i.d.R. bereits über Planposten ab, daher
    // standardmäßig ausschließen (per Einstellung abschaltbar).
    const isRecurringTemplate =
      String(o.voucherType ?? "").toUpperCase() === "RV" ||
      o.recurringInterval != null ||
      o.recurringNextVoucher != null;
    if (excludeRecurring && isRecurringTemplate) continue;
    const amount = toNumberOrNull(o.sumGross ?? o.sumgross);
    if (amount == null || amount === 0) continue;
    const grossCents = Math.round(Math.abs(amount) * 100);
    const paid = paidCents(o, amount);
    if (grossCents - paid <= SETTLED_TOLERANCE_CENTS) continue; // (nahezu) vollständig bezahlt
    // sevDesk-Konvention: creditDebit "C" = Credit = Ausgabe (Verbindlichkeit),
    // "D" = Debit = Einnahme (Forderung). Standard für einen Beleg ist die
    // Ausgabe. Siehe API-Doku: "credit (expense) or debit (revenue) document".
    const isIncome = String(o.creditDebit ?? "C").toUpperCase() === "D";
    const date = firstDate(o, ["voucherDate", "createDate"]) ?? startOfDayUTC(new Date());
    // Fälligkeit = paymentDeadline (Zahlungsziel des Belegs). `payDate` ist das
    // tatsächliche Zahldatum – für offene Belege irreführend.
    const due = firstDate(o, ["paymentDeadline"]) ?? date;
    out.push({
      externalId: String(o.id),
      source: "sevdesk-voucher",
      kind: isIncome ? "RECEIVABLE" : "PAYABLE",
      counterparty: firstStr(o, ["supplier", "supplierName", "description"]) || "Beleg",
      reference: firstStr(o, ["voucherNumber", "description"]) || null,
      amountCents: grossCents,
      paidAmountCents: paid,
      dueDate: due,
      reminderLevel: 0,
    });
  }
  return out;
}

export interface VoucherClassification {
  total: number;
  byCreditDebit: Record<string, number>;
  byVoucherType: Record<string, number>;
  byStatus: Record<string, number>;
  // Kreuztabelle creditDebit -> Anzahl, aufgeteilt nach Netto-Vorzeichen.
  byCreditDebitAndSign: Record<string, { positive: number; negative: number; zero: number }>;
  // Kleine Stichprobe zur manuellen Zuordnung (enthält Lieferantennamen –
  // nur für die Diagnose im eigenen System gedacht, nicht für das HTTP-JSON).
  samples: {
    reference: string;
    creditDebit: string;
    voucherType: string;
    status: number;
    grossCents: number;
    netCents: number;
    supplier: string;
  }[];
}

/**
 * Diagnose: aggregiert, wie Belege (Vouchers) in sevDesk klassifiziert sind,
 * damit die Zuordnung Forderung/Verbindlichkeit aus Echtdaten abgeleitet werden
 * kann (statt geraten). Liefert Verteilungen + eine kleine Stichprobe.
 */
export async function fetchVoucherClassification(
  token: string,
  sampleSize = 12,
): Promise<VoucherClassification> {
  const objs = await sevGet(`/Voucher?limit=1000`, token);
  const byCreditDebit: Record<string, number> = {};
  const byVoucherType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byCreditDebitAndSign: Record<string, { positive: number; negative: number; zero: number }> = {};
  const samples: VoucherClassification["samples"] = [];

  for (const o of objs) {
    const cd = String(o.creditDebit ?? "?").toUpperCase();
    const vt = String(o.voucherType ?? "?");
    const st = String(o.status ?? "?");
    byCreditDebit[cd] = (byCreditDebit[cd] ?? 0) + 1;
    byVoucherType[vt] = (byVoucherType[vt] ?? 0) + 1;
    byStatus[st] = (byStatus[st] ?? 0) + 1;

    const net = toNumberOrNull(o.sumNet) ?? 0;
    const bucket = (byCreditDebitAndSign[cd] ??= { positive: 0, negative: 0, zero: 0 });
    if (net > 0) bucket.positive++;
    else if (net < 0) bucket.negative++;
    else bucket.zero++;

    if (samples.length < sampleSize) {
      samples.push({
        reference: firstStr(o, ["voucherNumber", "description"]).slice(0, 40),
        creditDebit: cd,
        voucherType: vt,
        status: Number(o.status ?? 0),
        grossCents: Math.round((toNumberOrNull(o.sumGross) ?? 0) * 100),
        netCents: Math.round(net * 100),
        supplier: firstStr(o, ["supplierName", "supplier"]).slice(0, 40),
      });
    }
  }

  return {
    total: objs.length,
    byCreditDebit,
    byVoucherType,
    byStatus,
    byCreditDebitAndSign,
    samples,
  };
}

export interface VatEntries {
  outputByMonth: Record<string, number>; // USt aus Rechnungen (Cent) je "YYYY-MM"
  inputByMonth: Record<string, number>; // Vorsteuer aus Belegen (Cent) je "YYYY-MM"
  invoiceCount: number;
  voucherCount: number;
}

function ym(dateStr: unknown): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr ?? ""));
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * USt-/Vorsteuer-Beträge aus sevDesk – ausschließlich Belege/Rechnungen in EUR
 * mit ausgewiesener Steuer (sumTax > 0). Rechnungen = USt (Ausgang), Belege mit
 * creditDebit "C" (Ausgabe) = Vorsteuer (Eingang), "D" (Einnahme) = USt.
 *
 * basis „soll": Zuordnung nach Rechnungs-/Belegdatum (Sollversteuerung).
 * basis „ist": Zuordnung nach Zahldatum (payDate); noch nicht bezahlte
 * Dokumente entstehen erst mit der Zahlung und werden bis dahin ausgelassen.
 */
export async function fetchVatEntries(token: string, basis: "soll" | "ist" = "soll"): Promise<VatEntries> {
  const [invoices, vouchers] = await Promise.all([
    sevGet(`/Invoice?limit=1000`, token),
    sevGet(`/Voucher?limit=1000`, token),
  ]);
  const outputByMonth: Record<string, number> = {};
  const inputByMonth: Record<string, number> = {};
  const add = (bucket: Record<string, number>, key: string, cents: number) => {
    bucket[key] = (bucket[key] ?? 0) + cents;
  };
  const isIst = basis === "ist";

  let invoiceCount = 0;
  for (const o of invoices) {
    if (String(o.currency ?? "EUR") !== "EUR") continue; // nur EUR
    if (Number(o.status ?? 0) < 200) continue; // keine Entwürfe
    const tax = toNumberOrNull(o.sumTax);
    if (tax == null || tax <= 0) continue; // nur mit MwSt > 0
    const key = isIst ? ym(o.payDate) : (ym(o.invoiceDate) ?? ym(o.deliveryDate));
    if (!key) continue; // Ist: unbezahlt -> (noch) keine USt
    add(outputByMonth, key, Math.round(tax * 100));
    invoiceCount++;
  }

  let voucherCount = 0;
  for (const o of vouchers) {
    if (String(o.currency ?? "EUR") !== "EUR") continue;
    if (Number(o.status ?? 0) < 100) continue; // keine Entwürfe
    const tax = toNumberOrNull(o.sumTax);
    if (tax == null || tax <= 0) continue;
    const key = isIst ? ym(o.payDate) : ym(o.voucherDate);
    if (!key) continue; // Ist: unbezahlt -> (noch) keine Vorsteuer
    const isRevenue = String(o.creditDebit ?? "C").toUpperCase() === "D";
    add(isRevenue ? outputByMonth : inputByMonth, key, Math.round(tax * 100));
    voucherCount++;
  }

  return { outputByMonth, inputByMonth, invoiceCount, voucherCount };
}

function addDaysLocal(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + (Number.isFinite(days) ? days : 0));
  return startOfDayUTC(r);
}

/** Lädt alle Umsätze eines Kontos (paginiert). */
export async function fetchTransactions(
  token: string,
  accountId: string,
): Promise<MappedTransaction[]> {
  const out: MappedTransaction[] = [];
  const limit = 1000;
  for (let offset = 0; offset < 100_000; offset += limit) {
    const path =
      `/CheckAccountTransaction?checkAccount[id]=${encodeURIComponent(accountId)}` +
      `&checkAccount[objectName]=CheckAccount&limit=${limit}&offset=${offset}`;
    const objs = await sevGet(path, token);
    for (const o of objs) {
      const m = mapTransaction(o);
      if (m) out.push(m);
    }
    if (objs.length < limit) break;
  }
  return out;
}

// Diagnose: liest aus, wie sevDesk Mahnungen/Mahnstufen in Rechnungsobjekten
// abbildet (Feldnamen + Verteilung nach invoiceType). Ausgabe nur in die Logs
// (keine Namen/Beträge). Grundlage, um die Mahnstufe automatisch zu übernehmen.
export async function fetchInvoiceDunningInfo(token: string): Promise<{
  total: number;
  byType: Record<string, number>;
  dunningKeys: string[];
  allKeys: string[];
  samples: { type: string; status: string; sendType: string; values: Record<string, unknown> }[];
}> {
  const objs = await sevGet(`/Invoice?limit=1000`, token);
  const byType: Record<string, number> = {};
  const dunningKeysSeen = new Set<string>();
  const samples: { type: string; status: string; sendType: string; values: Record<string, unknown> }[] = [];
  let allKeys: string[] = [];
  for (const o of objs) {
    const type = String(o.invoiceType ?? "?");
    byType[type] = (byType[type] ?? 0) + 1;
    if (!allKeys.length) allKeys = Object.keys(o).sort();
    const dk = Object.keys(o).filter((k) => /dunn|mahn|reminder/i.test(k));
    for (const k of dk) dunningKeysSeen.add(k);
    const hasDunn = dk.some((k) => {
      const v = o[k];
      return v != null && v !== 0 && v !== "0" && v !== "";
    });
    if ((type !== "RE" && type !== "?") || hasDunn) {
      if (samples.length < 40) {
        samples.push({
          type,
          status: String(o.status ?? ""),
          sendType: String(o.sendType ?? ""),
          values: Object.fromEntries(dk.map((k) => [k, o[k]])),
        });
      }
    }
  }
  return { total: objs.length, byType, dunningKeys: [...dunningKeysSeen], allKeys, samples };
}

// Diagnose: wie kennzeichnet sevDesk WIEDERKEHRENDE Belege? Gibt Feldnamen +
// Verteilung + Beispielwerte aus (nur zur Analyse in den Logs, keine Namen).
export async function fetchVoucherRecurringInfo(token: string): Promise<{
  total: number;
  recurKeys: string[];
  allKeys: string[];
  byRecurring: Record<string, number>;
  samples: { status: string; voucherType: string; values: Record<string, unknown> }[];
}> {
  const objs = await sevGet(`/Voucher?limit=1000`, token);
  const recurKeysSeen = new Set<string>();
  const byRecurring: Record<string, number> = {};
  const samples: { status: string; voucherType: string; values: Record<string, unknown> }[] = [];
  let allKeys: string[] = [];
  for (const o of objs) {
    if (!allKeys.length) allKeys = Object.keys(o).sort();
    const rk = Object.keys(o).filter((k) => /recur|interval|wiederk|cycle|repeat/i.test(k));
    for (const k of rk) recurKeysSeen.add(k);
    const hasRecur = rk.some((k) => {
      const v = o[k];
      return v != null && v !== "" && v !== "0" && v !== 0;
    });
    byRecurring[hasRecur ? "recurring" : "single"] = (byRecurring[hasRecur ? "recurring" : "single"] ?? 0) + 1;
    if (hasRecur && samples.length < 25) {
      samples.push({
        status: String(o.status ?? ""),
        voucherType: String(o.voucherType ?? ""),
        values: Object.fromEntries(rk.map((k) => [k, o[k]])),
      });
    }
  }
  return { total: objs.length, recurKeys: [...recurKeysSeen], allKeys, byRecurring, samples };
}
