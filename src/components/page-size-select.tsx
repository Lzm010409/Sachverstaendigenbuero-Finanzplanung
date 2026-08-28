"use client";

import { useRouter } from "next/navigation";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./pagination";

// Verstellt die Seitengröße und erhält dabei die aktiven Filter. Springt auf
// Seite 1 zurück (page wird verworfen). Standardgröße erzeugt keinen Parameter,
// damit die URLs sauber bleiben.
export function PageSizeSelect({
  size,
  basePath,
  params,
}: {
  size: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1 text-xs text-slate-500">
      <span className="hidden sm:inline">pro Seite</span>
      <select
        value={size}
        onChange={(e) => {
          const q = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) {
            if (v && k !== "page" && k !== "size") q.set(k, v);
          }
          const val = Number(e.target.value);
          if (val !== DEFAULT_PAGE_SIZE) q.set("size", String(val));
          const s = q.toString();
          router.push(s ? `${basePath}?${s}` : basePath);
        }}
        className="input w-auto py-1 text-xs"
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
