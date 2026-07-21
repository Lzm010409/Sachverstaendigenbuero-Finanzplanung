# Roadmap

## ✅ Phase 1 – MVP (umgesetzt)

- Konten mit Anfangssaldo und laufendem Saldo
- Import CSV / CAMT.053 / MT940 mit Auto-Erkennung und Duplikat-Schutz
- Kategorien + Auto-Kategorisierungs-Regeln (Teilstring & Regex)
- Wiederkehrende/einmalige Planposten
- Liquiditätsvorschau (tägliche Kurve), Tiefpunkt + Warnung
- Single-User-Login, Middleware-Schutz
- Getestete Kernlogik (Vitest)

## 🔜 Phase 2 – Substanz

- **Offene Posten (Forderungen/Verbindlichkeiten)**
  Offene Rechnungen mit Fälligkeitsdatum; fließen bis zur Bezahlung als
  erwarteter Zu-/Abfluss in die Vorschau ein.
- **Szenarien (Best / Base / Worst)**
  Planposten pro Szenario an-/abschalten oder skalieren, Kurven vergleichen.
- **Plan/Ist-Vergleich**
  Geplante gegen tatsächlich gebuchte Kategoriewerte je Monat.
- **FinTS/HBCI-Auto-Sync**
  Automatischer Umsatzabruf direkt von der Bank (python-fints als kleiner
  Microservice oder n8n-Workflow) – ersetzt den manuellen Upload.
- **Warnungen**
  E-Mail/Benachrichtigung bei Unterschreitung eines Liquiditäts-Schwellwerts
  (z.B. via n8n).
- **Export**
  Liquiditätsplan und Reports als PDF und XLSX.

## 🧭 Phase 3 – Ausbau

- Mehrbenutzer mit Rollen/Freigaben
- Mehr-Firmen-/Mehr-Mandanten-Konsolidierung
- Öffentliche API (Token) für Integrationen
- Wiederkehrende Kategorie-Budgets und Abweichungsanalyse

## Technische To-dos / Härtung

- Editieren bestehender Konten/Planposten (aktuell Anlegen + Löschen/Pausieren)
- Konten-spezifische Salden im Forecast (aktuell konsolidierter Gesamtsaldo)
- Backup-/Restore-Anleitung für die Postgres-Volume
- Optional: Zwei-Faktor / Reverse-Proxy mit TLS (Betrieb hinter z.B. Caddy)
