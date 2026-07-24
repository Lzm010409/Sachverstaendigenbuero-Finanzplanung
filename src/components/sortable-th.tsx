import Link from "next/link";

// Klickbarer Spaltenkopf zum serverseitigen Sortieren. Setzt ?sort=<col>&dir=…
// und behält die übrigen Query-Parameter (Filter/Seitengröße) bei. Klick auf die
// aktive Spalte kehrt die Richtung um.
export function SortableTh({
  col,
  label,
  sort,
  dir,
  basePath,
  params,
  align = "left",
  sortKey = "sort",
  dirKey = "dir",
}: {
  col: string;
  label: string;
  sort: string;
  dir: "asc" | "desc";
  basePath: string;
  params?: Record<string, string | undefined>;
  align?: "left" | "right";
  // Query-Parameter-Namen für Spalte/Richtung (Standard: sort/dir). Auf Seiten,
  // die `dir` bereits als Filter nutzen (z.B. Planung), kann dirKey abweichen.
  sortKey?: string;
  dirKey?: string;
}) {
  const active = sort === col;
  const nextDir: "asc" | "desc" = active && dir === "asc" ? "desc" : "asc";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== "") qs.set(k, v);
  qs.set(sortKey, col);
  qs.set(dirKey, nextDir);
  // page beim Umsortieren zurücksetzen
  qs.delete("page");

  return (
    <th className={`th ${align === "right" ? "text-right" : ""}`}>
      <Link href={`${basePath}?${qs.toString()}`} className={`inline-flex items-center gap-1 hover:text-brand ${active ? "text-brand" : ""}`}>
        {label}
        <span className="text-[10px] leading-none">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </Link>
    </th>
  );
}
