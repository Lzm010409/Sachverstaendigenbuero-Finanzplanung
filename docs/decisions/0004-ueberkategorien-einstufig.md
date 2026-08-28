# ADR-0004: Überkategorien als einstufige, nicht bebuchbare Gliederung

## Status
Angenommen

## Datum
2026-08-28

## Kontext
Bei vielen Kategorien wird die Übersicht unübersichtlich. Gewünscht war eine
Bündelung ("Überkategorien"), die überall als auf-/zuklappbares Accordion
erscheint. Das Datenmodell hatte bereits eine ungenutzte Selbstreferenz
(`Category.parentId`).

## Entscheidung
Genau **eine** Hierarchieebene: Eine Überkategorie (`Category.isGroup = true`)
ist reine Gliederung und **nicht bebuchbar** – keine Umsätze, Regeln, Planposten,
offenen Posten oder Budgets zeigen auf sie. Über- und Unterkategorie müssen
dieselbe Art (Einnahme/Ausgabe) haben. Summen entstehen ausschließlich per
Roll-up aus den Kindkategorien (`src/lib/category-tree.ts`). Der Aufklapp-Zustand
lebt pro Seite im `localStorage`; im Druck/PDF wird immer aufgeklappt gerendert.

## Alternativen
- **Mehrstufige Hierarchie**: flexibler, aber rekursive Summen, Zyklusgefahr und
  komplexere UI → verworfen.
- **Überkategorien bebuchbar machen**: würde Doppelzählung ermöglichen (Buchung
  auf Eltern *und* Kind) → verworfen; die Klammer ist immer exakt die Summe ihrer
  Kinder.

## Konsequenzen
- Keine Doppelzählung, einfache und prüfbare Roll-up-Logik.
- Budgets/Szenario-Faktoren bleiben auf Kategorieebene (bewusste Entscheidung).
- Filter/Deep-Links verstehen zusätzlich `g:<id>` für eine ganze Überkategorie.
