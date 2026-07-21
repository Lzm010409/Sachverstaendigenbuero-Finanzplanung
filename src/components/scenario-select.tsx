"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ScenarioSelect({
  scenarios,
  current,
}: {
  scenarios: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <select
      className="input w-auto"
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("s", e.target.value);
        else next.delete("s");
        router.push(`?${next.toString()}`);
      }}
    >
      <option value="">Basis (neutral)</option>
      {scenarios.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
