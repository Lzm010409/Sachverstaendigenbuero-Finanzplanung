import Link from "next/link";
import { getAnomaliesForPage, type AnomalyLevel } from "@/lib/anomalies";

const STYLE: Record<AnomalyLevel, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};
const ICON: Record<AnomalyLevel, string> = { info: "ℹ️", warn: "⚠️", error: "⛔" };

/**
 * Zeigt die für eine Seite relevanten Anomalien als Banner. Rendert nichts,
 * wenn keine vorliegen. Server-Komponente (lädt selbst).
 */
export async function PageAlerts({ page }: { page: string }) {
  let anomalies;
  try {
    anomalies = await getAnomaliesForPage(page);
  } catch {
    return null;
  }
  if (!anomalies.length) return null;

  return (
    <div className="space-y-2">
      {anomalies.map((a) => (
        <div key={a.key} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${STYLE[a.level]}`}>
          <span className="text-lg leading-none">{ICON[a.level]}</span>
          <div className="flex-1">
            <strong>{a.title}</strong>
            <div>{a.detail}</div>
          </div>
          {a.href && (
            <Link href={a.href} className="whitespace-nowrap text-xs underline opacity-80 hover:opacity-100">
              ansehen →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
