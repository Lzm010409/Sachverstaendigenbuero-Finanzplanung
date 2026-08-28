# ADR-0005: Einheitliche Budget-Farbskala für Ist-gegen-Plan

## Status
Angenommen

## Datum
2026-08-28

## Kontext
Nur ein Teil der Auswertung färbte den Budgetverbrauch. Gewünscht: überall dort,
wo Ist gegen Plan/Budget steht, dieselbe Ampel-Lesart.

## Entscheidung
Eine zentrale Funktion `src/lib/budget-color.ts` liefert die Zellenfarbe (grün =
im Rahmen, gelb = nah am Limit, rot = überzogen; bei Einnahmen umgekehrt). Sie
wird in allen Ist/Plan-Anzeigen verwendet: Auswertung, Monatsmatrix, Plan/Ist,
Planungs-Check, Budget-Status, KPI-Kacheln, Hover-Popups und Report/PDF (mit
`print-color-adjust: exact`). **Leere Zeiträume ohne Buchung bleiben neutral** –
sie werden nicht bewertet.

## Alternativen
- **Zeitanteilige Skala** (Soll bis heute statt Jahresbudget): genauer, aber
  aufwändiger und für die bestehende Lesart nicht nötig → vorerst verworfen,
  als möglicher Folgeschritt notiert.
- **Nur Textfarbe bei Überschreitung**: weniger auf einen Blick erfassbar →
  verworfen.

## Konsequenzen
- Konsistente, sofort erfassbare Budget-Ampel über die ganze App.
- Farbe ist nie alleiniger Informationsträger (immer mit Prozent-/Zahlwert
  gepaart) – Barrierefreiheit bleibt gewahrt.
