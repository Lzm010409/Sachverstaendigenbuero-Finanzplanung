# ADR-0001: Prisma + PostgreSQL als Datenhaltung

## Status
Angenommen

## Datum
2026-08-28 (rückwirkend dokumentiert)

## Kontext
Die App verwaltet stark relationale Finanzdaten (Konten, Umsätze, Kategorien,
Regeln, Budgets, Planposten, offene Posten, Szenarien – 17 Modelle) mit
Fremdschlüsselbeziehungen und Transaktionsbedarf. Ziel: typsicherer
Datenzugriff, verlässliche Migrationen, geringer Betriebsaufwand für einen
Einzelmandanten.

## Entscheidung
PostgreSQL als primäre Datenbank, angesprochen über Prisma ORM. Migrationen
liegen versioniert unter `prisma/migrations/` und werden beim Containerstart per
`prisma migrate deploy` (idempotent) angewandt.

## Alternativen
- **SQLite**: null Konfiguration, aber schwache Nebenläufigkeit beim Schreiben
  und kein sinnvoller Managed-Betrieb → verworfen.
- **MongoDB**: flexibles Schema, aber die Daten sind inhärent relational; Joins
  müssten von Hand nachgebaut werden → verworfen.
- **Drizzle** statt Prisma: leichtgewichtiger, aber Prisma bietet ausgereifte
  Migrationen und Typsicherheit, auf die der Codebestand bereits aufbaut →
  verworfen (siehe auch die bewusste Entscheidung, bei Prisma zu bleiben).

## Konsequenzen
- Typsicherer Zugriff und automatisierte Migrationshistorie (`_prisma_migrations`).
- Volltext/JSON-Funktionen von Postgres verfügbar, kein zusätzlicher Suchdienst.
- Der Prisma-Client muss zur Buildzeit generiert werden (`prisma generate`).
