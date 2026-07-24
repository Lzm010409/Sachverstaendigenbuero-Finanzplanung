"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getPipedriveDomain,
  getPipedriveToken,
  getSetting,
  getSevdeskToken,
  setSetting,
} from "@/lib/settings";
import {
  fetchAccountBalanceCents,
  fetchCheckAccounts,
  fetchOpenInvoices,
  fetchOpenVouchers,
  fetchTransactions,
} from "@/lib/sevdesk";
import { fetchOrganizations, fetchPersons } from "@/lib/pipedrive";
import { importHash } from "@/lib/import/hash";
import { categorize, toMatchableRule } from "@/lib/categorize";

export async function toggleIntegration(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!name) return;
  await setSetting(`${name}.enabled`, enabled ? "true" : "false");
  revalidatePath("/settings");
}

export async function saveIntegrationToken(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const token = String(formData.get("token") ?? "").trim();
  if (!name) return;
  await setSetting(`${name}.token`, token);
  revalidatePath("/settings");
}

export async function savePipedriveConfig(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (token) await setSetting("pipedrive.token", token);
  if (domain) await setSetting("pipedrive.domain", domain);
  revalidatePath("/settings");
}

/** Schaltet den Ausschluss wiederkehrender sevDesk-Belege beim Import um. */
export async function setExcludeRecurringVouchers(formData: FormData) {
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await setSetting("sevdesk.excludeRecurring", enabled ? "true" : "false");
  revalidatePath("/settings");
  revalidatePath("/open-items");
}

export interface SevdeskSyncResult {
  error?: string;
  accounts?: number;
  imported?: number;
  categorized?: number;
  reconciled?: number; // Konten, deren Saldo an sevDesk angeglichen wurde
  lastSync?: string;
}

export async function syncSevdesk(): Promise<SevdeskSyncResult> {
  const token = await getSevdeskToken();
  if (!token) return { error: "Kein sevDesk-Token hinterlegt (Einstellungen oder SEVDESK_API_TOKEN)." };

  let sevAccounts;
  try {
    sevAccounts = await fetchCheckAccounts(token);
  } catch (e) {
    return { error: `Verbindung zu sevDesk fehlgeschlagen: ${(e as Error).message}` };
  }

  const rules = (
    await prisma.rule.findMany({ where: { active: true, category: { deletedAt: null } } })
  ).map(toMatchableRule);
  let imported = 0;
  let categorized = 0;
  let reconciled = 0;
  const nowUnix = Math.floor(Date.now() / 1000);

  for (const sev of sevAccounts) {
    let txs;
    try {
      txs = await fetchTransactions(token, sev.id);
    } catch (e) {
      return { error: `Umsätze für Konto ${sev.name} fehlgeschlagen: ${(e as Error).message}` };
    }

    // Konto zuordnen/anlegen. Neue Konten: Stichtag = frühestes Umsatzdatum.
    let account = await prisma.account.findFirst({
      where: { externalId: sev.id, source: "sevdesk" },
    });
    if (!account) {
      const earliest = txs.reduce<Date | null>(
        (min, t) => (!min || t.date < min ? t.date : min),
        null,
      );
      account = await prisma.account.create({
        data: {
          name: sev.name,
          iban: sev.iban,
          externalId: sev.id,
          source: "sevdesk",
          openingBalance: 0,
          openingDate: earliest ?? new Date(),
        },
      });
    }

    const data = txs.map((t) => {
      const tx = {
        bookingDate: t.date,
        valueDate: t.date,
        amount: t.amountCents,
        counterparty: t.counterparty.length > 120 ? t.counterparty.slice(0, 120) : t.counterparty,
        purpose: t.purpose.length > 180 ? t.purpose.slice(0, 180) : t.purpose,
      };
      const categoryId = categorize({ ...tx, accountId: account!.id }, rules);
      if (categoryId) categorized++;
      return {
        accountId: account!.id,
        ...tx,
        categoryId,
        importHash: `sevdesk-${t.externalId}`,
      };
    });

    // In Blöcken einfügen (speicher-/WAL-schonend); Duplikate via Unique-Index.
    for (let i = 0; i < data.length; i += 500) {
      const res = await prisma.transaction.createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
      imported += res.count;
    }

    // Kontostand mit sevDesk abgleichen: Anfangssaldo so setzen, dass der
    // angezeigte Saldo exakt dem sevDesk-Kontostand entspricht.
    const balanceCents =
      sev.balance != null
        ? Math.round(sev.balance * 100)
        : await fetchAccountBalanceCents(token, sev.id, nowUnix);
    if (balanceCents != null) {
      const sum = await prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { accountId: account.id, bookingDate: { gte: account.openingDate } },
      });
      const openingBalance = balanceCents - (sum._sum.amount ?? 0);
      // Nur schreiben, wenn sich der Wert wirklich ändert (vermeidet unnötige
      // Zeilen-Neuschreibungen/DB-Bloat bei wiederholten Syncs).
      if (openingBalance !== account.openingBalance) {
        await prisma.account.update({ where: { id: account.id }, data: { openingBalance } });
      }
      reconciled++;
    }
  }

  const now = new Date().toISOString();
  await setSetting("sevdesk.lastSync", now);
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { accounts: sevAccounts.length, imported, categorized, reconciled, lastSync: now };
}

export interface SevdeskDocsResult {
  error?: string;
  receivables?: number;
  payables?: number;
  closed?: number;
  lastSync?: string;
}

/**
 * Importiert offene sevDesk-Rechnungen (Forderungen) und Belege
 * (Verbindlichkeiten) als offene Posten für die vorausschauende Vorschau.
 * Bezahlte/nicht mehr offene Posten werden als bezahlt markiert.
 */
export async function syncSevdeskDocuments(): Promise<SevdeskDocsResult> {
  const token = await getSevdeskToken();
  if (!token) return { error: "Kein sevDesk-Token hinterlegt." };

  // Standardmäßig wiederkehrende Beleg-Vorlagen ausschließen (per Einstellung
  // abschaltbar) – deren Liquidität ist meist über Planposten abgedeckt.
  const excludeRecurring = (await getSetting("sevdesk.excludeRecurring")) !== "false";

  let items;
  try {
    const [invoices, vouchers] = await Promise.all([
      fetchOpenInvoices(token),
      fetchOpenVouchers(token, { excludeRecurring }),
    ]);
    items = [...invoices, ...vouchers];
  } catch (e) {
    return { error: `Beleg-Sync fehlgeschlagen: ${(e as Error).message}` };
  }

  // Vorhandene sevDesk-Posten einmal laden, um nur GEÄNDERTE Zeilen zu
  // schreiben (vermeidet unnötige Zeilen-Neuschreibungen/DB-Bloat bei
  // wiederholten Syncs).
  const existingItems = await prisma.openItem.findMany({
    where: { source: { in: ["sevdesk-invoice", "sevdesk-voucher"] } },
    select: { id: true, source: true, externalId: true, kind: true, counterparty: true, reference: true, amount: true, paidAmount: true, dueDate: true, reminderLevel: true, paid: true },
  });
  const byKey = new Map(existingItems.map((e) => [`${e.source}:${e.externalId}`, e]));

  // Im Tool gelöschte sevDesk-Posten dauerhaft überspringen (nicht neu anlegen).
  const ignoredRows = await prisma.ignoredSevItem.findMany({ select: { source: true, externalId: true } });
  const ignoredKeys = new Set(ignoredRows.map((r) => `${r.source}:${r.externalId}`));

  const seen = new Set<string>();
  let receivables = 0;
  let payables = 0;
  let skippedIgnored = 0;
  for (const it of items) {
    const key = `${it.source}:${it.externalId}`;
    if (ignoredKeys.has(key)) {
      skippedIgnored++;
      continue;
    }
    seen.add(key);
    const clipped = it.counterparty.length > 160 ? it.counterparty.slice(0, 160) : it.counterparty;
    const cur = byKey.get(key);
    if (!cur) {
      await prisma.openItem.create({
        data: {
          kind: it.kind, counterparty: clipped, reference: it.reference,
          amount: it.amountCents, paidAmount: it.paidAmountCents, dueDate: it.dueDate,
          reminderLevel: it.reminderLevel,
          externalId: it.externalId, source: it.source, note: "sevDesk",
        },
      });
    } else {
      const changed =
        cur.kind !== it.kind || cur.counterparty !== clipped || cur.reference !== it.reference ||
        cur.amount !== it.amountCents || cur.paidAmount !== it.paidAmountCents ||
        cur.dueDate.getTime() !== it.dueDate.getTime() || cur.reminderLevel !== it.reminderLevel || cur.paid;
      if (changed) {
        await prisma.openItem.update({
          where: { id: cur.id },
          data: {
            kind: it.kind, counterparty: clipped, reference: it.reference,
            amount: it.amountCents, paidAmount: it.paidAmountCents, dueDate: it.dueDate,
            reminderLevel: it.reminderLevel, paid: false,
          },
        });
      }
    }
    if (it.kind === "RECEIVABLE") receivables++;
    else payables++;
  }

  // Nicht mehr offene sevDesk-Posten als bezahlt markieren.
  const existing = existingItems.filter((e) => !e.paid);
  const toClose = existing
    .filter((e) => !seen.has(`${e.source}:${e.externalId}`))
    .map((e) => e.id);
  let closed = 0;
  if (toClose.length) {
    const r = await prisma.openItem.updateMany({
      where: { id: { in: toClose } },
      data: { paid: true, paidDate: new Date() },
    });
    closed = r.count;
  }

  const now = new Date().toISOString();
  await setSetting("sevdesk.docsLastSync", now);
  revalidatePath("/settings");
  revalidatePath("/open-items");
  revalidatePath("/");
  return { receivables, payables, closed, lastSync: now };
}

export interface PipedriveSyncResult {
  error?: string;
  persons?: number;
  organizations?: number;
  total?: number;
  lastSync?: string;
}

export async function syncPipedrive(): Promise<PipedriveSyncResult> {
  const token = await getPipedriveToken();
  const domain = await getPipedriveDomain();
  if (!token || !domain) {
    return { error: "Pipedrive-Token oder -Domain fehlt (Einstellungen oder Umgebungsvariablen)." };
  }

  let persons, organizations;
  try {
    persons = await fetchPersons(token, domain);
    organizations = await fetchOrganizations(token, domain);
  } catch (e) {
    return { error: `Verbindung zu Pipedrive fehlgeschlagen: ${(e as Error).message}` };
  }

  for (const c of [...persons, ...organizations]) {
    await prisma.contact.upsert({
      where: { source_externalId: { source: "pipedrive", externalId: c.externalId } },
      create: {
        source: "pipedrive",
        externalId: c.externalId,
        type: c.type,
        name: c.name,
        email: c.email,
        orgName: c.orgName,
      },
      update: { type: c.type, name: c.name, email: c.email, orgName: c.orgName },
    });
  }

  const now = new Date().toISOString();
  await setSetting("pipedrive.lastSync", now);
  revalidatePath("/settings");
  revalidatePath("/contacts");
  return {
    persons: persons.length,
    organizations: organizations.length,
    total: persons.length + organizations.length,
    lastSync: now,
  };
}
