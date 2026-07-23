# Seiten & Logik – Handbuch

Dieses Dokument erklärt **jede Seite der App**: was sie zeigt, welche Funktionen
sie bietet und **wie sie rechnet** (Datenquellen und Formeln). Es richtet sich an
Nutzer *und* an Entwickler, die die Berechnungslogik nachvollziehen wollen.

> Kurzfassung der Rechenregeln steht in **[Grundkonzepte](#grundkonzepte)** –
> bitte zuerst lesen, danach ergeben die Seiten deutlich mehr Sinn.

---

## Inhalt

- [Grundkonzepte](#grundkonzepte) — Vorzeichen, Konten, Kategorien, Budgets vs. Planposten, die Prognose-Engine
- Liquidität: [Übersicht](#übersicht--), [13-Wochen-Vorschau](#13-wochen-vorschau-forecast), [Fälligkeitskalender](#fälligkeitskalender-calendar), [Planung](#planung-planning), [Szenarien](#szenarien-scenarios), [Szenario-Vergleich](#szenario-vergleich-scenario-compare)
- Forderungen & Posten: [Offene Posten](#offene-posten-open-items), [Forderungen](#forderungen-receivables)
- Buchhaltung: [Umsätze](#umsätze-transactions), [Kategorien & Regeln](#kategorien--regeln-categories), [Budgets](#budgets-budgets), [Import](#import-import), [Konten](#konten-accounts)
- Auswertung & Berichte: [Auswertung](#auswertung-breakdown), [Plan/Ist](#planist-plan-actual), [Planungs-Check](#planungs-check-plan-check), [Steuer-Vorschau](#steuer-vorschau-tax), [Klumpenrisiko](#klumpenrisiko-concentration), [Prognose-Güte](#prognose-güte-forecast-accuracy), [Bericht](#bericht-report)
- System: [Benachrichtigungen](#benachrichtigungen-notifications), [Kontakte](#kontakte-contacts), [Einstellungen](#einstellungen-settings), [Selbsttest](#selbsttest-diagnostics)
- Sonstiges: [Drilldown](#drilldown-drilldown), [MCP-Connector & OAuth](#mcp-connector--oauth)
- [Automatisierung (Scheduler & Sync)](#automatisierung-scheduler--sync)

---

## Grundkonzepte

Diese Regeln gelten **überall** in der App.

### Geld & Vorzeichen
- Alle Beträge werden intern als **Ganzzahl in Cent** geführt (keine Float-Rundungsfehler).
- **Vorzeichen:** `positiv = Zufluss` (Einnahme), `negativ = Abfluss` (Ausgabe).
- Anzeige/Umrechnung kapseln `src/lib/money.ts` (`formatCents`, `parseAmountToCents`).

### Welche Konten zählen?
- Ein Konto hat die Flags `archived` und `excludedFromCalc`.
- Für **alle** Kennzahlen, Salden und die Prognose zählen nur Konten mit
  `archived = false` **und** `excludedFromCalc = false` (Konstante `INCLUDED_ACCOUNT`).
- **Kontostand eines Kontos** = `openingBalance` (Anfangssaldo zum `openingDate`) + Summe aller Umsätze.
- **Gesamtsaldo** = Summe der Kontostände aller einbezogenen Konten (`getTotalBalanceCents`).

### Kategorien und der „Geldtransfer"
- Kategorien sind reine **Labels** (Name, Art `INCOME`/`EXPENSE`, Farbe). Das Finanzielle (Budget) ist davon entkoppelt.
- Eine Kategorie kann als **`isTransfer` (neutraler Geldtransfer)** markiert sein.
  Umsätze solcher Kategorien (z. B. Umbuchungen zwischen eigenen Konten) zählen
  **nicht** als Einnahme/Ausgabe und fließen **nicht** in Prognose, KPIs oder
  Auswertung ein – sie bleiben aber im Kontostand. So blähen interne Transfers
  die Zahlen nicht auf. **Steuern sind kein Transfer** (echter Abfluss).
- **Soft-Delete:** gelöschte Kategorien/Budgets landen 30 Tage im Papierkorb.

### Die drei Planungs-Objekte (wichtig!)
| Objekt | Zweck | Wirkt in der Prognose? |
|---|---|---|
| **Budget** | Soll-/Kontrollgröße je Kategorie (mit Rhythmus & optionalem Zeitraum) | **Nein** – nur wenn der Schalter „in Prognose einbeziehen" gesetzt ist |
| **Planposten** (`PlannedItem`) | konkreter wiederkehrender/einmaliger Cashflow | **Ja**, immer |
| **Offener Posten** (`OpenItem`) | unbezahlte Rechnung/Verbindlichkeit mit Fälligkeit | **Ja**, mit dem offenen Restbetrag |

Grundregel gegen Doppelzählung: **jede künftige Zahlung genau einmal** – entweder
als offener Posten *oder* Planposten *oder* Budget-mit-Häkchen.

### Die Prognose-Engine (`buildForecast`, `src/lib/forecast.ts`)
Reine Funktion, testbar, ohne DB-Zugriff. Sie erzeugt eine **tägliche** Saldo-Kurve:

1. **Startsaldo** = aktueller Gesamtsaldo aller einbezogenen Konten (`heute`).
2. **Zukünftige Ereignisse** ab **morgen** bis zum Horizont:
   - alle aktiven **Planposten** (im jeweiligen Rhythmus/Intervall),
   - **Budgets mit „in Prognose einbeziehen"** (als zusätzliche Planposten),
   - **offene Posten**: nur der **noch offene Restbetrag** (`amount − paidAmount`);
     **überfällige** Posten werden auf **heute** gezogen (der bezahlte Teil steckt
     schon als gebuchter Umsatz im Startsaldo → keine Doppelzählung).
3. **Szenario** (optional): globale Faktoren auf Zu-/Abflüsse, kategoriespezifische
   Faktoren und eine Verzögerung der Zuflüsse um *n* Tage.
4. Ergebnis: `points[]` (Tagessalden), `lowest` (Tiefpunkt), `endBalance`, Summen.

Der Aufruf `getForecast(horizonTage)` (`src/lib/queries.ts`) setzt diese Eingaben
zusammen; Transfers werden dabei ausgeklammert.

### KPI-Zeitfenster
Die Durchschnitts-KPIs (`getKpis`) betrachten die **letzten 3 Monate**:
- `Ø Einnahmen/Monat` = Summe Zuflüsse / 3, `Ø Ausgaben/Monat` = Summe Abflüsse / 3,
- `Netto/Monat` = Ø Einnahmen − Ø Ausgaben,
- `Reichweite (Runway)` = `Saldo / −Netto` (nur wenn Netto negativ), sonst „∞".

---

## Übersicht (`/`)

**Was sie zeigt:** Die Startseite – Liquidität, Ein-/Auszahlungen je Monat, Budget-Status.

**Funktionen**
- **KPI-Kacheln mit „KPIs anpassen":** ~22 Kennzahlen, per Schalter ein-/ausblendbar
  (Auswahl wird pro Gerät in `localStorage` gespeichert; Standardsatz = die 5 wichtigsten).
- **Cashflow-Chart** (6 Monate zurück + 6 voraus, blätterbar via `?offset`): gestapelte
  Balken **realisiert vs. geplant** je Ein-/Auszahlung + Liquiditäts-Linie + Mindestliquiditäts-Schwelle.
- **Warnungen:** rote Box bei prognostizierter Liquidität < 0; gelbe Box bei
  Unterschreitung der **Mindestliquiditäts-Schwelle** (mit Datum).
- **Budget-Status-Karte:** Monat wählbar (← / →, Standard = aktueller Monat via `?bm`),
  Balken je Kategorie mit Ist/Soll/Hochrechnung, aufklappbare **variable Liste** (alle Budgets).
- **Monats-Pivot** je Kategorie (Einnahmen/Ausgaben) + Spalte **„% Jahr"** (Jahresbudget-Verbrauch).

**Rechenlogik (Cashflow-Matrix, `getCashflowMatrix`)**
- Vergangene/laufende Monate: **realisierte** (gebuchte) Umsätze.
- Laufender/künftige Monate: **geplant** = Planposten + offene Posten + Budgets-mit-Häkchen (ab morgen).
- **Liquiditäts-Start/-Ende je Monat:** ein durchgehender „Liquiditäts-Walk", **verankert
  am aktuellen Kontostand** – d. h. der heutige Saldo ist der Fixpunkt, von dem aus
  vorwärts (Prognose) und rückwärts (Ist) gerechnet wird. Dadurch stimmt „Liquidität
  heute" exakt mit dem Kontostand überein.
- **KPIs:** siehe `getDashboardKpis` (unten).

**Die ~22 KPIs (`src/lib/dashboard-kpis.ts`)** – Auswahl:
Verfügbare Liquidität · Ø Einnahmen/Ausgaben/Netto pro Monat · Reichweite · Working
Capital (`Saldo + Forderungen − Verbindlichkeiten`) · Einnahmen/Ausgaben/Netto
laufender Monat · Umsatzwachstum MoM · Ausgabenquote (`Ausgaben/Einnahmen`) · offene
& überfällige Forderungen · **DSO** · offene Verbindlichkeiten · fällig in 30 Tagen ·
**Liquiditätsdeckung** = `(Saldo + Forderungen) / Verbindlichkeiten` · Prognose 30/90 T
· 13-Wochen-Tiefpunkt · Liquiditätspuffer (`Saldo − Mindestbestand`) · USt-Zahllast
(nächste Fälligkeit) · Klumpenrisiko Top-1.

---

## 13-Wochen-Vorschau (`/forecast`)

**Was sie zeigt:** Rollierende Wochenvorschau der Liquidität (Standard 13 Wochen).

**Funktionen:** Woche für Woche Start-/Endliquidität, Zufluss/Abfluss (realisiert vs.
geplant), Anteil aus überfälligen Forderungen, Markierung der Unterschreitung der
Mindestliquiditäts-Schwelle; optional pro Szenario.

**Rechenlogik (`getWeeklyForecast`)**
- Basis ist die tägliche Prognose (`getForecast(Wochen·7+7)`), aggregiert auf **Kalenderwochen** (Montag-Start).
- **Laufende Woche:** bereits gebuchte Umsätze (Mo–heute) = *realisiert*; der Rest = *geplant*.
- **Überfällige Forderungen** werden von der Engine auf „heute" gezogen und erscheinen in der aktuellen Woche.
- Startsaldo = aktueller Gesamtsaldo.

---

## Fälligkeitskalender (`/calendar`)

**Was sie zeigt:** Tages-Agenda der nächsten ~8 Wochen mit fälligen Zahlungen.

**Rechenlogik (`getPaymentCalendar`)**
- Quellen: **offene Posten** (Forderung = Zufluss, Verbindlichkeit = Abfluss; nur
  offener Rest `amount − paidAmount`, Fälligkeit = `dueDate`) und **Planposten**
  (Vorkommen im Zeitraum). Überfällige Posten erscheinen am ersten Tag.
- Je Tag: Zufluss-/Abfluss-Summe und Netto; gesamt In/Out über den Zeitraum.

---

## Planung (`/planning`)

**Was sie zeigt:** Alle **Planposten** (wiederkehrende/einmalige Cashflows).

**Funktionen**
- Anlegen mit: Bezeichnung, Richtung (Ein/Aus), Betrag, **Rhythmus**
  (einmalig/wöchentlich/monatlich/quartalsweise/jährlich) + **Intervall** („jede n-te"),
  Ab-/Bis-Datum, optionale Kategorie.
- **Inline bearbeiten**, pausieren/aktivieren, löschen.
- **Umwandeln:** „→ Budget ▾" mit **kopieren** (Quelle bleibt) oder **verschieben** (Quelle weg).

**Rechenlogik:** Planposten fließen **immer** in die Prognose ein (siehe Engine).
Der Rhythmus erzeugt Vorkommen via `occurrencesBetween` (`src/lib/recurrence.ts`).

---

## Szenarien (`/scenarios`)

**Was sie zeigt:** Simulations-Profile (z. B. Best/Base/Worst Case).

**Funktionen/Logik:** Ein Szenario definiert `inflowFactor` (Faktor auf Zuflüsse),
`outflowFactor` (Faktor auf Abflüsse), `inflowShiftDays` (Zuflüsse um *n* Tage nach
hinten verschieben) sowie **kategoriespezifische Faktoren**, die den globalen Faktor
überschreiben. Die Engine wendet diese beim Verbuchen jeder Zahlung an.

---

## Szenario-Vergleich (`/scenario-compare`)

**Was sie zeigt:** Mehrere Szenarien **nebeneinander** – Endliquidität, Tiefpunkt,
Schwellen-Unterschreitung – als Vergleichstabelle/Kurven. Rechnet je Szenario eine
eigene Prognose (`getForecast(..., scenarioId)` / `getWeeklyForecast`).

---

## Offene Posten (`/open-items`)

**Was sie zeigt:** Forderungen (`RECEIVABLE`) und Verbindlichkeiten (`PAYABLE`) mit
Fälligkeit, offener Rest, Mahnstufe, Quelle.

**Funktionen:** Paginierung + Filter; anlegen/bearbeiten; als **bezahlt** markieren
(auch Teilzahlung über `paidAmount`); Mahnstufe setzen. Viele Posten kommen per
**sevDesk-Sync** (Rechnungen/Belege). Offene Posten speisen Prognose, Kalender und Forderungs-KPIs.

---

## Forderungen (`/receivables`)

**Was sie zeigt:** Forderungsmanagement mit **Alterstruktur (Aging)**, DSO und Mahnwesen.

**Rechenlogik (`getReceivablesReport`)**
- **Offen gesamt** / **überfällig**: Summe der offenen Reste; überfällig, wenn
  `Fälligkeit < heute` (Tage überfällig = `(heute − dueDate)` in Tagen).
- **Aging-Buckets:** Einordnung nach Tagen bis/seit Fälligkeit.
- **DSO (Days Sales Outstanding):** Ø **Zahlungsdauer** aus *bezahlten* Forderungen =
  `Zahldatum − Ausstellungsdatum` (Mittelwert in Tagen). Schätzt, wie lange Kunden im Schnitt brauchen.

---

## Umsätze (`/transactions`)

**Was sie zeigt:** Alle gebuchten Bankumsätze.

**Funktionen**
- **Filter** (Konto, Kategorie, Status „unkategorisiert", Freitext) – wirken **sofort
  bei Änderung** (kein „Filter"-Button) und werden **pro Seite im App-Speicher gemerkt**.
- **Verstellbare Seitengröße** (25/50/100/200) auf allen paginierten Seiten.
- **Kategorisieren einzeln** oder per **Multiselect** (mehrere auf einmal).
- Kategorie-Auswahl überall in **Einnahmen/Ausgaben gegliedert** (optgroups).
- **Stabilität:** Kategorisieren läuft **optimistisch** über eine schlanke API-Route
  (`/api/transactions`, `updateMany`) statt Server-Action-Vollrender – vermeidet
  503-Fehler und Sortiersprünge. Sortierung stabil (Datum, dann `id`).

**Logik:** Ein Umsatz zählt als Einnahme/Ausgabe je nach Vorzeichen; Kategorie ist
optional; Umsätze in `isTransfer`-Kategorien sind neutral. Dedup beim Import via `importHash`.

---

## Kategorien & Regeln (`/categories`)

**Was sie zeigt:** Kategorien (nach Einnahmen/Ausgaben getrennt) + **Auto-Kategorisierungs-Regeln**.

**Funktionen**
- Kategorie anlegen (Name, Art, Farbe, optional **Geldtransfer**), Soft-Delete + Papierkorb.
- **Regeln** mit **verschachtelten Bedingungs-Bäumen**: Gruppen mit **UND/ODER**,
  optional **NICHT**, beliebig tief. Bedingungstypen:
  - **Text** (Gegenpartei / Verwendungszweck / „Gegenpartei o. Zweck"): enthält /
    enthält nicht / ist genau / beginnt mit / endet mit / **Regex**,
  - **Betrag** (auch **Absolutbetrag**): >, ≥, <, ≤, =, **zwischen**,
  - **Konto**, **Wochentag**, **Monat**, **Datum** (vor/nach/zwischen).
  Mit **Live-Klartext-Vorschau**; bestehende Regeln als Satz lesbar + editierbar.
- „Regeln auf offene Umsätze anwenden" und „Aus kategorisierten Umsätzen lernen".

**Rechenlogik (`src/lib/rule-expr.ts`, `categorize`)**
- Regeln werden nach **Priorität** (aufsteigend) geprüft; die **erste** Regel, deren
  Bedingungs-Baum zutrifft, gewinnt und setzt die Kategorie.
- Textvergleiche sind case-insensitiv; `CONTAINS` erkennt zusätzlich das `/regex/`-Format.
- Regeln greifen automatisch beim **Import** (Datei) und beim **sevDesk-Sync** auf neue Umsätze.

---

## Budgets (`/budgets`)

**Was sie zeigt:** Eigenständige Budget-Objekte (entkoppelt von Kategorien).

**Funktionen**
- Anlegen: Titel, Art, **Betrag je Periode**, Rhythmus (Woche/Monat/Quartal/Jahr),
  optionaler **Zeitraum** (ab/bis), optionale Kategorie, Schalter **„in Prognose einbeziehen"**.
- Inline bearbeiten, deaktivieren, Soft-Delete + Papierkorb.
- **Umwandeln:** „→ Planposten ▾" (kopieren/verschieben). Beim Umwandeln werden die
  Prognose-Flags automatisch gesetzt, damit **nichts doppelt** zählt.

**Rechenlogik**
- Interne Normalisierung auf **Jahreswert** = `Betrag × Perioden/Jahr`
  (Woche 52, Monat 12, Quartal 4, Jahr 1). **Monatsbudget** = Jahreswert / 12.
- Mehrere Budgets je Kategorie werden **addiert**.
- Nur Budgets, die am Stichtag im Zeitraum liegen, zählen.

---

## Import (`/import`)

**Was sie zeigt:** Upload von Kontoauszügen.

**Funktionen/Logik**
- Formate: **CSV** (Auto-Spaltenerkennung für Sparkasse, VR-Bank, DKB, Commerzbank,
  ING …), **CAMT.053 (XML)**, **MT940 (.sta)**.
- **Duplikaterkennung** über `importHash` (Konto+Datum+Betrag+Zweck+Gegenpartei).
- Beim Import werden **aktive Regeln** direkt auf die neuen Umsätze angewandt.

---

## Konten (`/accounts`)

**Was sie zeigt:** Alle Konten mit Anfangssaldo und aktuellem Kontostand.

**Funktionen/Logik:** anlegen/bearbeiten/archivieren; Flag **`excludedFromCalc`**
(Konto sichtbar/synchronisiert, zählt aber **nicht** in Saldo/Prognose/Auswertung).
Kontostand = `openingBalance` + Summe der Umsätze.

---

## Auswertung (`/breakdown`)

**Was sie zeigt:** **Ist-Umsätze** je Kategorie und Zeitraum (Woche/Monat/Jahr,
blätterbar) mit **Budgetverbrauch**.

**Funktionen**
- Umschalter Granularität; Perioden verlinken in den **Drilldown**.
- **Zellfarbe** = Budgetverbrauch je Zeitraum (grün im Rahmen, rot überzogen; bei
  Einnahmen umgekehrt).
- Spalte **„% Jahr"** = Anteil des Jahresbudgets, im laufenden Kalenderjahr erreicht/verbraucht.
- **Hover je Kategorie:** Popover mit **Soll/Ist je Zeitraum** + Jahres-Summe.
- **Ecke unten rechts:** Gesamt-**Budgetauslastung (Jahr)** getrennt für Einnahmen
  und Ausgaben = `Σ Ist / Σ Jahresbudget` (nur Kategorien mit Budget; Ausgaben rot > 100 %).

**Wichtig:** Diese Seite ist **reine Ist-Betrachtung gegen Budget** – **keine**
Planposten, **keine** Prognose. Sie beantwortet „Halte ich meine Budgets ein?".

---

## Plan/Ist (`/plan-actual`)

**Was sie zeigt:** Geplante gegen gebuchte Werte je Kategorie für **einen Monat** (blätterbar).

**Rechenlogik (`getPlanVsActual`)**
- **Ist** = gebuchte Umsätze des Monats (einbezogene Konten).
- **Plan** je Kategorie mit **Vorrang für das Budget**: existiert ein Budget
  (Monatsbetrag = Jahreswert/12, sofern der Zeitraum den Monat überschneidet), zählt
  **nur** dieses als Soll; **ohne** Budget greift der aktive **Planposten** der
  Kategorie. So gibt es je Kategorie **genau eine** Plan-Quelle (keine Doppelzählung).
  Der Prognose-Schalter „in Prognose einbeziehen" spielt hier **keine** Rolle – Plan/Ist
  ist ein Soll-Ist-Vergleich, kein Cashflow-Forecast.
- **Abweichung** = Ist − Plan (Vorzeichen folgt dem Betrag).

---

## Planungs-Check (`/plan-check`)

**Was sie zeigt:** Abgleich der Plandaten mit den **echten Umsätzen** – mit 1-Klick-Übernahme. Zwei Tabs:

**Tab „Nach Kategorie" (`getPlanReview`)**
- Je Kategorie: **Ø-Ist der letzten 3 vollen Monate** (inkl. der drei Einzelmonate)
  gegen den aktuellen Plan (**Budget + Planposten**), Differenz und ein Vorschlag
  (*neu / anpassen / unregelmäßig / kein Ist*).
- Pro Zeile Betrag prüfen und **als Budget** oder **als Planposten** übernehmen.
  **Idempotent:** vorhandenes Budget/Planposten wird **aktualisiert statt verdoppelt**.

**Tab „Nach Empfänger" (`detectRecurring`)**
- Automatisch erkannte **wiederkehrende Zahlungen je Gegenpartei** mit **echtem
  Rhythmus** → als Planposten übernehmen (präziser Zahlungstakt, auch quartals-/jährlich).

**Erkennungslogik (Wiederkehrer):** je Gegenpartei über 12 Monate; ≥3 Vorkommen,
stabiler Betrag (Abweichung ≤ 30 % um den **Median**), regelmäßiger Abstand. Der
mittlere Abstand wird klassifiziert: ~7 T → wöchentlich, ~30 T → monatlich, ~90 T →
quartalsweise, ~365 T → jährlich. Vorschlagsbetrag = Median.

> Unterschied der Tabs: „Nach Kategorie" = Budget-/Soll-Sicht (Monatsschnitt),
> „Nach Empfänger" = präziser Cashflow (richtiger Takt) für die Prognose.

---

## Steuer-Vorschau (`/tax`)

**Was sie zeigt:** **USt-Zahllast je Voranmeldungszeitraum** (Fälligkeit = 10. des Folgemonats).

**Rechenlogik (`getVatForecast`)**
- **Bevorzugt echte sevDesk-Steuerbeträge** (nur Belege/Rechnungen in EUR mit MwSt > 0):
  `USt auf Erlöse` (Output) und `Vorsteuer` (Input) je Monat.
- **Ohne Token:** Schätzung aus den gebuchten Umsätzen bei einheitlichem Satz –
  Netto = `Brutto / (1 + Satz)`, USt = Brutto − Netto.
- **Zahllast** = `USt auf Erlöse − Vorsteuer` (positiv = zahlen). Zyklus standardmäßig monatlich.

---

## Klumpenrisiko (`/concentration`)

**Was sie zeigt:** Erlöskonzentration nach Auftraggeber (Abhängigkeit von einzelnen Kunden).

**Rechenlogik (`getConcentration`)**
- Erlöse je Auftraggeber über die letzten *n* Monate (nur Einnahme-Kategorien).
- **Anteil** = Erlös des Auftraggebers / Gesamterlös.
- **HHI (Herfindahl-Hirschman-Index, 0…10000)** = Σ (Anteil in % )² – Konzentrationsmaß
  (hoch = starke Abhängigkeit). Zusätzlich **Top-1-/Top-3-Anteil** und aktuell offene
  Forderung je Auftraggeber.

---

## Prognose-Güte (`/forecast-accuracy`)

**Was sie zeigt:** Wie gut die Prognose die spätere Realität getroffen hat.

**Rechenlogik (`snapshots.ts`)**
- Zum Monatsanfang wird ein **Snapshot** der für ein Zieldatum (Horizont in Tagen)
  prognostizierten Liquidität gespeichert (idempotent je Zielmonat/Horizont).
- Später wird der **Ist-Wert** nachgetragen.
- **Abweichung** = `Ist − Prognose`; **Abweichung %** = `Abweichung / |Prognose|`.

---

## Bericht (`/report`)

**Was sie zeigt:** Kompakter **Liquiditätsbericht** (druck-/PDF-tauglich) – Kennzahlen,
Forderungs-Aging, USt-Vorschau u. a. auf einer Seite. Aggregiert bestehende
Auswertungen (`analytics`, `receivables`, `tax`) für Ausdruck/Weitergabe.

---

## Benachrichtigungen (`/notifications`)

**Was sie zeigt:** Übersicht der Alarme/Digests und deren Konfiguration.

**Logik:** Der Scheduler versendet einen **Wochen-Digest** und **Alarme** (z. B.
drohende Unterschreitung der Mindestliquidität). Regeln/Schwellen kommen aus den
Planungs-Einstellungen; Versand per E-Mail (Nodemailer).

---

## Kontakte (`/contacts`)

**Was sie zeigt:** Aus **Pipedrive** synchronisierte Kontakte (Personen/Organisationen),
paginiert und durchsuchbar. Dienen u. a. der Zuordnung/Anzeige bei Posten.

---

## Einstellungen (`/settings`)

**Was sie zeigt/kann:** Integrations-Zugangsdaten und Planungs-Parameter.
- **Integrationen:** sevDesk (Token/Domain) für Rechnungen/Belege/Umsätze, Pipedrive für Kontakte.
- **Planung:** **Mindestliquiditäts-Schwelle** (Basis für Warnungen), USt-Einstellungen,
  Sync-Optionen (täglicher Abgleich an/aus, Stunde).
- Zugangsdaten liegen im `Setting`-Schlüssel-Wert-Speicher bzw. in Umgebungsvariablen.

---

## Selbsttest (`/diagnostics`)

**Was sie zeigt:** Automatische **Datenintegritäts-Prüfungen** (`runDiagnostics`):
z. B. keine negativen Budgets, gültige Kategoriefarben, gültige Regel-Bedingungen,
offene Posten mit positivem Betrag, bezahlter Anteil im gültigen Bereich, u. v. m.
Auch als API (`/api/diagnostics`, token-/sessiongeschützt) abrufbar.

---

## Drilldown (`/drilldown`)

**Was sie zeigt:** Detail-Aufschlüsselung hinter einer Kennzahl oder einem Zeitraum
(z. B. „welche Bewegungen stecken in diesem Monat / dieser KPI?"). Von Übersicht und
Auswertung verlinkt (`?metric=…` bzw. `?metric=range&from=…&to=…`). Nutzt u. a.
`anomalies.ts` zur Hervorhebung auffälliger Buchungen.

---

## MCP-Connector & OAuth

**Zweck:** Externer, **aggregat-only** Zugriff für KI-Assistenten (claude.ai) – gibt
**ausschließlich anonymisierte Kennzahlen** aus (keine Namen/IBANs/Einzelbuchungen).

- **`/api/mcp`** – Remote-MCP-Server (JSON-RPC). Tools: `get_liquidity_kpis`,
  `get_forecast`, `get_open_items_aging` (Aging + **anonymisiertes** Klumpenrisiko als
  Rang/Anteil), `get_tax_preview`, `get_budgets`, `get_summary`. Datenschicht: `src/lib/agent.ts`.
- **OAuth 2.1 (App-eigener Server, `/api/oauth/*`):** Authorization-Code + **PKCE**,
  Dynamic Client Registration, Discovery über `/.well-known/…`. Der MCP-Endpunkt
  verlangt ein OAuth-Bearer-JWT (Fallback: statisches `MCP_TOKEN`) und antwortet sonst
  mit `401` + `WWW-Authenticate` (Ressourcen-Metadaten), damit claude.ai den Flow startet.

---

## Automatisierung (Scheduler & Sync)

Läuft in der Node-Runtime (`src/lib/scheduler.ts`, gestartet über `instrumentation.ts`),
Prüfung alle 30 Minuten:
- **Täglicher Datenabgleich** (Standard 04:00 UTC, abschaltbar): zieht neue sevDesk-
  Belege/Umsätze und Pipedrive-Kontakte; wendet Regeln auf neue Umsätze an.
- **Wochen-Digest** + **Alarme** per E-Mail.
- **Forecast-Snapshots** für die Prognose-Güte.

---

## Datenmodell (Kurzüberblick)

`Account`, `Transaction`, `Category`, `Budget`, `Rule` (mit JSON-Bedingungsbaum),
`PlannedItem`, `OpenItem`, `Contact`, `Scenario` (+ `ScenarioCategoryAdjustment`),
`ForecastSnapshot`, `Setting`, sowie `OAuthClient`/`OAuthCode`/`OAuthToken`.
Schema: `prisma/schema.prisma`. Alle Beträge Int/Cent, Vorzeichen wie oben.
