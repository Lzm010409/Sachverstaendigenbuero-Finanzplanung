import Link from "next/link";
import { CategorySection } from "./category-section";
import { PayeeSection } from "./payee-section";

export const dynamic = "force-dynamic";

type Tab = "category" | "payees";

export default async function PlanCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "payees" ? "payees" : "category";

  const tabCls = (active: boolean) =>
    `border-b-2 px-1 pb-2 text-sm font-medium ${
      active ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Planungs-Check</h1>
        <p className="text-sm text-slate-500">
          Plandaten gegen die echten Umsätze abgleichen und als Budget/Planposten übernehmen.
        </p>
      </div>

      <div className="flex gap-6 border-b border-slate-200">
        <Link href="/plan-check?tab=category" className={tabCls(tab === "category")}>
          Nach Kategorie
          <span className="ml-1 text-xs font-normal text-slate-400">Soll/Ist</span>
        </Link>
        <Link href="/plan-check?tab=payees" className={tabCls(tab === "payees")}>
          Nach Empfänger
          <span className="ml-1 text-xs font-normal text-slate-400">Wiederkehrer</span>
        </Link>
      </div>

      {tab === "payees" ? <PayeeSection sort={sp.sort ?? ""} dir={sp.dir === "desc" ? "desc" : "asc"} /> : <CategorySection />}
    </div>
  );
}
