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
}: {
  col: string;
  label: string;
  sort: string;
  dir: "asc" | "desc";
  basePath: string;
  params?: Record<string, string | undefined>;
  align?: "left" | "right";
}) {
  const active = sort === col;
  const nextDir: "asc" | "desc" = active && dir === "asc" ? "desc" : "asc";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== "") qs.set(k, v);
  qs.set("sort", col);
  qs.set("dir", nextDir);
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
