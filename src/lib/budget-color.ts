// Liefert eine Hintergrundfarbe für eine Tabellenzelle auf Basis des
// Budgetverbrauchs. Grün = im Rahmen, Gelb = nahe am Limit, Rot = überzogen.
// Bei Einnahmen ist die Logik umgekehrt (Ziel erreicht = grün).

export function budgetCellColor(
  magnitude: number,
  periodBudget: number,
  isIncome: boolean,
): string | undefined {
  if (periodBudget <= 0) return undefined;
  const ratio = magnitude / periodBudget;

  // "good" von 0 (schlecht = rot) bis 1 (gut = grün)
  const good = isIncome
    ? Math.max(0, Math.min(1, ratio)) // mehr Einnahmen = besser
    : Math.max(0, Math.min(1, 1 - ratio)); // weniger Ausgaben = besser

  const hue = Math.round(good * 130); // 0=rot .. 130=grün
  // Ausgaben über Budget deutlicher rot einfärben
  const overspent = !isIncome && ratio > 1;
  const saturation = overspent ? 72 : 60;
  const lightness = overspent ? Math.max(78, 88 - (ratio - 1) * 20) : 90;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
