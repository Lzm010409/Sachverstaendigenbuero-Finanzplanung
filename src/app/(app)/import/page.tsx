import Link from "next/link";
import { prisma } from "@/lib/db";
import { ImportForm } from "./import-form";
import { FinbanForm } from "./finban-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Umsätze importieren</h1>

      {accounts.length === 0 ? (
        <div className="card border-brand/30 bg-brand/5 text-sm text-slate-700">
          Bitte zuerst ein{" "}
          <Link href="/accounts" className="font-semibold text-brand underline">
            Konto anlegen
          </Link>
          .
        </div>
      ) : (
        <div className="card">
          <ImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      )}

      <div className="card">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">finban.io-Import</h2>
        <p className="mb-4 text-xs text-slate-400">
          Direkter Import eines finban-Transaktionsexports – legt Konten, Kategorien und geplante
          Posten automatisch an. Ideal für den Umstieg von finban.
        </p>
        <FinbanForm />
      </div>

      <div className="card text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-700">Unterstützte Formate</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>CSV</strong> – Standard-Export aus dem Online-Banking (Sparkasse, VR-Bank, DKB,
            Commerzbank, ING …). Spalten werden automatisch erkannt.
          </li>
          <li>
            <strong>CAMT.053 (XML)</strong> – ISO-20022-Kontoauszug, den jede Geschäftsbank anbietet.
          </li>
          <li>
            <strong>MT940 (.sta)</strong> – klassisches SWIFT-Kontoauszugsformat.
          </li>
        </ul>
      </div>
    </div>
  );
}
