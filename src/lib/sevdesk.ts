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
