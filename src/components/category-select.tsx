// Gemeinsame, nach Einnahmen/Ausgaben gruppierte Options für jedes
// Kategorie-Auswahlmenü. Reine Präsentation (kein "use client") – dadurch in
// Server- wie Client-Komponenten und in Formular- wie onChange-Selects nutzbar.
// Die Platzhalter-/Leer-Option rendert der jeweilige Aufrufer selbst.

export type CatOpt = { id: string; name: string; kind: "INCOME" | "EXPENSE" };

export function CategoryOptions({ categories }: { categories: CatOpt[] }) {
  const income = categories.filter((c) => c.kind === "INCOME");
  const expense = categories.filter((c) => c.kind === "EXPENSE");
  return (
    <>
      {income.length > 0 && (
        <optgroup label="Einnahmen">
          {income.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {expense.length > 0 && (
        <optgroup label="Ausgaben">
          {expense.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
