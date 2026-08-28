# Projekt: Liquiditätsplanung (self-hosted)

Selbst gehostete Web-App für Liquiditäts- und Finanzplanung: Bankumsätze
importieren, automatisch kategorisieren, Budgets/Planposten pflegen und die
rollierende Liquiditätsvorschau sehen. Einzelmandant, intern betrieben.

## Tech-Stack
- **Next.js 15** (App Router, React 19, Server Components + Server Actions)
- **TypeScript** (strikt), **Tailwind CSS**
- **Prisma 6** ORM auf **PostgreSQL** (17 Modelle)
- **Auth.js / NextAuth v5** (Microsoft Entra SSO + Passwort-Fallback)
- **Recharts** (Diagramme), **nodemailer** (Wochenbericht per E-Mail)
- **Vitest** (Unit-Tests), **ESLint** (Flat-Config, `next/core-web-vitals`)
- Deployment: **Coolify** (Docker Compose) hinter Traefik; eigenständige
  Postgres-Ressource (siehe `DATENBANK-UMSTELLUNG.md`)

## Befehle
- Entwicklung: `npm run dev`
- Build (Prod): `npm run build`  (führt `prisma generate` + `next build` aus)
- Tests: `npm test`  (Vitest)
- Lint: `npm run lint`  (muss grün sein)
- Typecheck: `npx tsc --noEmit`
- Migration lokal: `npm run prisma:migrate` · Prod: `npm run prisma:deploy`
- Seed: `npm run seed` · Auto-Regeln: `npm run seed:rules`

Vor jedem Commit gilt die Definition of Done: Lint, Typecheck, Tests und Build
müssen grün sein (das gleiche Gate läuft in `.github/workflows/ci.yml`).

## Architektur & Konventionen
- **Server lädt und rechnet, Client kapselt Interaktion.** Seiten unter
  `src/app/(app)/**` sind `async` Server-Komponenten (`export const dynamic =
  "force-dynamic"`), die Prisma direkt aufrufen; interaktive Teile sind dünne
  `"use client"`-Inseln.
- **Aggregations- und Rechenlogik** liegt in `src/lib/**` (z. B. `analytics.ts`,
  `queries.ts`, `forecast.ts`, `budgets.ts`, `category-tree.ts`), nicht in den
  Seiten. Tests dazu in `src/lib/__tests__/`.
- **Geldbeträge** sind **Integer in Cent**, vorzeichenbehaftet (Einzahlung > 0,
  Auszahlung < 0). Formatierung nur über `src/lib/money.ts`.
- **Neutrale Geldtransfers** (`Category.isTransfer`) zählen nie als Ein-/Ausgabe.
- **Überkategorien**: `Category.isGroup` = reine Gliederung, nicht bebuchbar;
  genau eine Ebene (`parentId`). Roll-up-Summen über `src/lib/category-tree.ts`.
- **Budget-Farbskala** einheitlich über `src/lib/budget-color.ts` überall dort,
  wo Ist gegen Plan/Budget steht (leere Zeiträume bleiben neutral).
- **Auth**: jede geschützte Route wird durch die Middleware UND – für
  datenliefernde API-Routen – zusätzlich durch ein eigenes `auth()` abgesichert
  (Defense-in-Depth). Öffentlich sind nur `api/health`, `api/branding/logo`,
  die `api/oauth/*`-Discovery und `api/auth/*`.
- **Logging**: strukturiert über `src/lib/logger.ts` (`log.info("event", {…})`),
  niemals Geheimnisse/PII loggen. Kein `console.log` im Laufzeitcode.
- **Sprache**: Bezeichner, Kommentare und UI auf **Deutsch**.

## Sicherheit
- Keine Secrets im Repo; `.env`/`*.pem`/`*.key` sind ignoriert, `.env.example`
  enthält nur Platzhalter.
- Prisma = parametrisierte Queries; Eingaben in Server-Actions via **Zod**.
- Security-Header (CSP, HSTS, …) in `next.config.mjs`; Passwort-Login mit
  Rate-Limit (`src/lib/rate-limit.ts`).

## Weiterführende Doku
- `docs/SEITEN-UND-LOGIK.md` – jede Seite: Anzeige, Funktion, Rechenweg.
- `docs/decisions/` – Architecture Decision Records (das *Warum*).
- `DATENBANK-UMSTELLUNG.md` – Betrieb der eigenständigen Postgres.
