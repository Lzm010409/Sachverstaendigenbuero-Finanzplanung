import Link from "next/link";

// Serverseitige Pagination: baut Vor/Zurück + Seitenzahlen und erhält dabei die
// aktuellen Filter (alle übergebenen Query-Parameter außer `page`).
export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) {
    return (
      <p className="mt-3 text-xs text-slate-400">
        {totalItems} {totalItems === 1 ? "Eintrag" : "Einträge"}
      </p>
    );
  }

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  // Kompaktes Fenster von Seitenzahlen um die aktuelle Seite.
  const windowSize = 2;
  const nums: number[] = [];
  for (let p = Math.max(1, page - windowSize); p <= Math.min(totalPages, page + windowSize); p++) {
    nums.push(p);
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(totalItems, page * pageSize);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">
        {from}–{to} von {totalItems}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link className="btn-secondary px-2 py-1" href={href(page - 1)} aria-label="Zurück">
            ←
          </Link>
        ) : (
          <span className="btn-secondary cursor-not-allowed px-2 py-1 opacity-40">←</span>
        )}
        {nums[0] > 1 && (
          <>
            <Link className="btn-secondary px-2.5 py-1" href={href(1)}>
              1
            </Link>
            {nums[0] > 2 && <span className="px-1 text-slate-400">…</span>}
          </>
        )}
        {nums.map((p) => (
          <Link
            key={p}
            href={href(p)}
            className={`px-2.5 py-1 ${p === page ? "btn-primary" : "btn-secondary"}`}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Link>
        ))}
        {nums[nums.length - 1] < totalPages && (
          <>
            {nums[nums.length - 1] < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
            <Link className="btn-secondary px-2.5 py-1" href={href(totalPages)}>
              {totalPages}
            </Link>
          </>
        )}
        {page < totalPages ? (
          <Link className="btn-secondary px-2 py-1" href={href(page + 1)} aria-label="Weiter">
            →
          </Link>
        ) : (
          <span className="btn-secondary cursor-not-allowed px-2 py-1 opacity-40">→</span>
        )}
      </div>
    </div>
  );
}
