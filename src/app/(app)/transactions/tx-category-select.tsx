"use client";

import { useTransition } from "react";
import { setTransactionCategory } from "@/app/actions/transactions";

export function TxCategorySelect({
  txId,
  current,
  categories,
}: {
  txId: string;
  current: string | null;
  categories: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={current ?? ""}
      disabled={pending}
      className="input py-1 text-xs"
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", txId);
        fd.set("categoryId", e.target.value);
        start(() => {
          setTransactionCategory(fd);
        });
      }}
    >
      <option value="">– nicht zugeordnet –</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
