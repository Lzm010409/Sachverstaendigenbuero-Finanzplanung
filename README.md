# Liquiditätsplanung (self-hosted)

Eine schlanke, selbst gehostete Software für **Liquiditäts- und Finanzplanung** –
als kostengünstige Alternative zu SaaS-Tools wie Commitly. Bankumsätze importieren,
automatisch kategorisieren, wiederkehrende Zahlungen planen und die
**Liquiditätsvorschau** als tägliche Cashflow-Kurve sehen.

> Kein Nachbau fremden Codes: Diese App ist von Grund auf neu entwickelt und
> repliziert lediglich die *Funktion* (Liquiditätsplanung), nicht Code, Design
> oder Marken eines Anbieters.

## Funktionen (Phase 1 – MVP)

- 🏦 **Konten** mit Anfangssaldo und laufendem Saldo
- 📥 **Import** von Kontoauszügen: **CSV** (Auto-Spaltenerkennung für Sparkasse,
  VR-Bank, DKB, Commerzbank, ING …), **CAMT.053 (XML)** und **MT940 (.sta)**
  – inkl. automatischer **Duplikaterkennung**
- 🏷️ **Kategorien** und **Auto-Kategorisierungs-Regeln** (Teilstring oder Regex)
- 🗓️ **Planung** wiederkehrender/einmaliger Ein- und Auszahlungen
  (wöchentlich/monatlich/quartalsweise/jährlich, mit Intervall)
- 📊 **Dashboard** mit Liquiditätskurve, Tiefpunkt-Erkennung und Warnung bei
  drohender Unterdeckung
- 🔐 **Single-User-Login** (Passwort + signiertes Session-Cookie), alle Routen
  per Middleware geschützt

Geldbeträge werden intern durchgängig als **Ganzzahl in Cent** geführt (keine
Float-Rundungsfehler). Die Kernlogik (Geld, Wiederholungen, Forecast, Import,
Kategorisierung) ist mit Vitest getestet.

## Schnellstart mit Docker

Voraussetzung: Docker + Docker Compose.

```bash
cp .env.example .env
# In .env setzen:
#   APP_PASSWORD  -> dein Login-Passwort
#   AUTH_SECRET   -> Zufallswert, z.B.:  openssl rand -hex 32
#   DB_PASSWORD   -> Passwort für Postgres (optional, Default: liqui)

docker compose up -d --build
```

Die App läuft anschließend auf http://localhost:3000
(Port über `APP_PORT` in `.env` änderbar). Migrationen werden beim Start
automatisch angewandt.

Optional die Standard-Kategorien und -Regeln laden:

```bash
docker compose exec app node node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

## Lokale Entwicklung

```bash
npm install
cp .env.example .env         # DATABASE_URL auf lokale Postgres-Instanz zeigen lassen
npx prisma migrate deploy    # oder: npx prisma migrate dev
npm run seed                 # optional: Standard-Kategorien/Regeln
npm run dev                  # http://localhost:3000
npm test                     # Unit-Tests (Vitest)
```

## Kontoauszug exportieren

Im Online-Banking den gewünschten Zeitraum als Datei exportieren:

- **CSV** – meist „Umsätze exportieren“ → CSV/CSV-CAMT
- **CAMT.053** – „Kontoauszug ISO 20022 / CAMT“ (XML)
- **MT940** – klassisches SWIFT-Format (`.sta`)

Danach unter **Import** hochladen, Konto wählen, fertig. Bereits importierte
Buchungen werden anhand eines Hashes automatisch übersprungen.

## Technik

| Schicht   | Technologie                          |
|-----------|--------------------------------------|
| Frontend/Backend | Next.js 15 (App Router, TypeScript) |
| Datenbank | PostgreSQL + Prisma                  |
| Charts    | Recharts                             |
| Auth      | HMAC-signiertes Cookie (Web Crypto)  |
| Deploy    | Docker Compose                       |

Ordnerstruktur (Auszug):

```
src/lib/            Kernlogik (money, dates, recurrence, forecast, categorize, import/*)
src/lib/__tests__/  Unit-Tests
src/app/(app)/      Geschützte Seiten (Dashboard, Umsätze, Import, Planung, Kategorien, Konten)
src/app/actions/    Server Actions (Mutationen)
prisma/             Schema, Migrationen, Seed
```

## Roadmap

Siehe [ROADMAP.md](./ROADMAP.md) für die geplanten Phasen 2 & 3
(offene Posten, Szenarien, FinTS-Auto-Sync, E-Mail-Warnungen, Export, Rollen).
