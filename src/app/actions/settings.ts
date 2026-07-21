"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getPipedriveDomain,
  getPipedriveToken,
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
import { categorize } from "@/lib/categorize";

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

  const rules = await prisma.rule.findMany({ where: { active: true } });
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
        counterparty: t.counterparty,
        purpose: t.purpose,
      };
      const categoryId = categorize(tx, rules);
      if (categoryId) categorized++;
      return {
        accountId: account!.id,
        ...tx,
        categoryId,
        importHash: `sevdesk-${t.externalId}`,
        raw: "sevDesk-Sync",
      };
    });

    const res = await prisma.transaction.createMany({ data, skipDuplicates: true });
    imported += res.count;

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
      await prisma.account.update({ where: { id: account.id }, data: { openingBalance } });
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

  let items;
  try {
    const [invoices, vouchers] = await Promise.all([
      fetchOpenInvoices(token),
      fetchOpenVouchers(token),
    ]);
    items = [...invoices, ...vouchers];
  } catch (e) {
    return { error: `Beleg-Sync fehlgeschlagen: ${(e as Error).message}` };
  }

  const seen = new Set<string>();
  let receivables = 0;
  let payables = 0;
  for (const it of items) {
    seen.add(`${it.source}:${it.externalId}`);
    await prisma.openItem.upsert({
      where: { source_externalId: { source: it.source, externalId: it.externalId } },
      create: {
        kind: it.kind,
        counterparty: it.counterparty,
        reference: it.reference,
        amount: it.amountCents,
        dueDate: it.dueDate,
        externalId: it.externalId,
        source: it.source,
        note: "sevDesk",
      },
      update: {
        kind: it.kind,
        counterparty: it.counterparty,
        reference: it.reference,
        amount: it.amountCents,
        dueDate: it.dueDate,
        paid: false,
      },
    });
    if (it.kind === "RECEIVABLE") receivables++;
    else payables++;
  }

  // Nicht mehr offene sevDesk-Posten als bezahlt markieren.
  const existing = await prisma.openItem.findMany({
    where: { source: { in: ["sevdesk-invoice", "sevdesk-voucher"] }, paid: false },
    select: { id: true, source: true, externalId: true },
  });
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
