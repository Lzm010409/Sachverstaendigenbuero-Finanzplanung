import { getAccountsWithBalance } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import {
  archiveAccount,
  deleteAccount,
  deleteAccountTransactions,
  restoreAccount,
  toggleAccountExcluded,
  updateAccountOpening,
} from "@/app/actions/accounts";
import { AccountForm } from "./account-form";
import { DangerButton } from "./danger-button";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CHECKING: "Girokonto",
  SAVINGS: "Sparkonto",
  CASH: "Kasse",
  CREDIT: "Kreditkarte",
};

function toAmountInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
function toDateInput(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export default async function AccountsPage() {
  const accounts = await getAccountsWithBalance();
  const total = accounts
    .filter((a) => !a.excludedFromCalc)
    .reduce((s, a) => s + a.currentBalance, 0);

  // Archivierte Konten separat (mit Umsatzanzahl) – bleiben aus allen
  // Berechnungen ausgeschlossen.
  const archived = await prisma.account.findMany({
    where: { archived: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { transactions: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Konten</h1>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Neues Konto</h2>
        <AccountForm />
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Bestehende Konten</h2>
          <span className="text-sm text-slate-500">
            Gesamt: <strong className="text-slate-800">{formatCents(total)}</strong>
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-400">
          Der Saldo ergibt sich aus dem <strong>Anfangssaldo zum Stichtag</strong> plus allen
          Umsätzen <strong>ab</strong> diesem Stichtag. Setze den Stichtag auf den Beginn deiner
          importierten Daten und den Anfangssaldo auf den echten Kontostand an diesem Tag.
        </p>
        {accounts.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Konten.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Name</th>
                  <th className="th">Umsätze</th>
                  <th className="th">Anfangssaldo &amp; Stichtag</th>
                  <th className="th text-right">Aktueller Saldo</th>
                  <th className="th text-center">In Berechnung</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-slate-50 ${a.excludedFromCalc ? "opacity-50" : ""}`}
                  >
                    <td className="td font-medium">
                      {a.name}
                      <div className="text-xs text-slate-400">
                        {TYPE_LABEL[a.type] ?? a.type}
                        {a.iban ? ` · ${a.iban}` : ""}
                      </div>
                    </td>
                    <td className="td">{a.txCount}</td>
                    <td className="td">
                      <form action={updateAccountOpening} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={a.id} />
                        <input
                          name="openingBalance"
                          defaultValue={toAmountInput(a.openingBalance)}
                          inputMode="decimal"
                          className="input w-28 py-1 text-right text-sm"
                          aria-label="Anfangssaldo"
                        />
                        <input
                          name="openingDate"
                          type="date"
                          defaultValue={toDateInput(a.openingDate)}
                          className="input w-36 py-1 text-sm"
                          aria-label="Stichtag"
                        />
                        <button type="submit" className="btn-secondary px-2 py-1 text-xs" title="Speichern">
                          ✓
                        </button>
                      </form>
                    </td>
                    <td
                      className={`td text-right font-semibold ${a.currentBalance < 0 ? "text-red-600" : ""}`}
                    >
                      {formatCents(a.currentBalance)}
                      {a.excludedFromCalc && (
                        <div className="text-xs font-normal text-amber-600">ausgeschlossen</div>
                      )}
                    </td>
                    <td className="td text-center">
                      <form action={toggleAccountExcluded}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${a.excludedFromCalc ? "bg-slate-300" : "bg-brand"}`}
                          title={a.excludedFromCalc ? "Wird NICHT einbezogen – klicken zum Einbeziehen" : "Wird einbezogen – klicken zum Ausschließen"}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${a.excludedFromCalc ? "translate-x-1" : "translate-x-5"}`}
                          />
                        </button>
                      </form>
                    </td>
                    <td className="td text-right">
                      <div className="flex flex-col items-end gap-1">
                        <form action={archiveAccount}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="text-xs text-slate-400 hover:text-amber-600">
                            archivieren
                          </button>
                        </form>
                        {a.txCount > 0 && (
                          <DangerButton
                            action={deleteAccountTransactions}
                            id={a.id}
                            confirm={`Wirklich alle ${a.txCount} Umsätze von „${a.name}" löschen? Das Konto bleibt bestehen.`}
                          >
                            Umsätze löschen
                          </DangerButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Archivierte Konten</h2>
          <p className="mb-3 text-xs text-slate-400">
            Archivierte Konten zählen nicht in Saldo, Vorschau oder Auswertung. Ihre Umsätze bleiben
            gespeichert, bis das Konto endgültig gelöscht wird.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="th">Name</th>
                  <th className="th">Umsätze</th>
                  <th className="th text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {archived.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 opacity-70">
                    <td className="td font-medium">
                      {a.name}
                      <span className="ml-2 badge bg-slate-100 text-slate-500">archiviert</span>
                    </td>
                    <td className="td">{a._count.transactions}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-4">
                        <form action={restoreAccount}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="text-xs text-brand hover:underline">wiederherstellen</button>
                        </form>
                        <DangerButton
                          action={deleteAccount}
                          id={a.id}
                          confirm={`Konto „${a.name}" endgültig löschen — inklusive ${a._count.transactions} Umsätzen? Das kann nicht rückgängig gemacht werden.`}
                        >
                          endgültig löschen (inkl. Umsätze)
                        </DangerButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
