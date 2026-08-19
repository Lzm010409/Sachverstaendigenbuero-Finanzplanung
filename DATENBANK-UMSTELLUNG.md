# Datenbank-Umstellung: eigenständige Coolify-Postgres

Diese Anleitung beschreibt, wie die Finanzplanung von der **im Compose
mitgeführten** Postgres auf eine **eigenständige Coolify-Datenbank-Ressource**
umgestellt wird — inklusive Datenübertragung, Prüfung und Rückweg.

Der Grund: Coolify sichert nur eigenständige Datenbank-Ressourcen über seine
*Backups*. Eine Postgres, die als Dienst im `docker-compose.coolify.yml` steckt
(bisheriger Dienst `db` mit Volume `pgdata`), lässt sich nicht sichern und
erschwert jeden Serverumzug.

> **Am Programm ändert sich nichts.** Prisma spricht die Datenbank schon heute
> ausschließlich über `DATABASE_URL` an, und der Container wendet beim Start
> `prisma migrate deploy` an (wiederholbar, idempotent). Der Umbau ist rein ein
> Deployment-Umbau.

---

## Was sich in diesem Repository ändert

Nur eine Datei: **`docker-compose.coolify.yml`**.

- Der Dienst **`db`** und das Volume **`pgdata`** wurden **entfernt**.
- **`DATABASE_URL`** wird nicht mehr im Compose zusammengesetzt, sondern als
  Umgebungsvariable der Anwendung aus Coolify durchgereicht (Zeile `- DATABASE_URL`).
  Sie zeigt künftig auf die Standalone-Datenbank; ihr internes Hostziel ist die
  **UUID** dieser Ressource.

Die lokale Entwicklung bleibt unverändert: dafür weiterhin `docker-compose.yml`
(mit lokalem `db`-Dienst) verwenden.

---

## Ausrollen — Reihenfolge

Die Reihenfolge ist wichtig: erst die neue Datenbank **anlegen und befüllen**,
dann die App darauf **umbiegen**, erst danach den alten Dienst entfernen.

### 1. Standalone-Postgres in Coolify anlegen

- Projekt der Anwendung → **+ New** → **Database** → **PostgreSQL**.
- **Version 16** wählen (identisch zum bisherigen `postgres:16-alpine`).
- Dieselbe **Destination** (Netz, i. d. R. `coolify`) wie die Anwendung, sonst
  scheitert die Namensauflösung mit `EAI_AGAIN`.
- Nach dem Anlegen notieren: **UUID** (= interner Hostname), **Benutzer**,
  **Passwort**, **Datenbankname**. Empfehlung: Benutzer/DB `liqui` beibehalten,
  dann bleibt die Verbindungszeichenkette bis auf Host/Passwort gleich.
- **Backups aktivieren** (am Datenbank-Objekt → *Backups*). Das ist der
  eigentliche Zweck der ganzen Umstellung.

Die Verbindungszeichenkette hat dann die Form:

```
postgresql://liqui:<passwort>@<db-uuid>:5432/liqui?schema=public
```

`<db-uuid>` ist der interne Hostname der Standalone-Ressource, `<passwort>` das
von Coolify generierte Passwort. **Beides gehört ausschließlich in die
Coolify-Env, niemals in dieses Repository.**

### 2. Altbestand in die neue Datenbank übertragen

Der alte `db`-Dienst läuft dabei **weiter** — es wird nur gelesen. Da das
Prisma-Schema unverändert bleibt, ist der sauberste „Import" ein vollständiger
`pg_dump` der alten Datenbank, eingespielt in die noch **leere** neue.

Auf dem Coolify-Host (Container-Namen ggf. anpassen, `docker ps` zeigt sie):

```bash
# a) Alte, noch laufende Compose-Datenbank sichern (Schema + Daten + Migrationshistorie)
docker exec -t <alter-db-container> \
  pg_dump -U liqui -d liqui --no-owner --no-privileges -Fc \
  > /tmp/finanzplanung.dump

# b) In die neue Standalone einspielen (muss leer sein)
docker exec -i <neuer-standalone-container> \
  pg_restore -U liqui -d liqui --no-owner --no-privileges --clean --if-exists \
  < /tmp/finanzplanung.dump
```

Hinweise:

- Der Dump enthält bewusst auch die Prisma-Tabelle `_prisma_migrations`. Dadurch
  erkennt `prisma migrate deploy` beim ersten App-Start, dass alle Migrationen
  bereits angewandt sind, und ändert nichts.
- **Idempotenz:** Der Transfer zielt auf eine **leere** Datenbank. Ein
  versehentlicher zweiter Lauf gegen eine bereits befüllte DB schlägt mit
  Schlüsselkonflikten fehl (kein stilles Verdoppeln). Zum bewussten Wiederholen
  die Ziel-DB vorher leeren (`--clean --if-exists` im `pg_restore` erledigt das
  für die enthaltenen Objekte).
- Wer lieber ohne Datei arbeitet, kann a) und b) per Pipe verbinden — dann muss
  aber der Host beide Container erreichen.

### 3. `DATABASE_URL` an der Anwendung setzen

In Coolify bei der **Anwendung** unter *Environment Variables* setzen:

```
DATABASE_URL=postgresql://liqui:<passwort>@<db-uuid>:5432/liqui?schema=public
```

Noch **nicht** neu deployen.

### 4. Anwendung neu deployen

Mit dem geänderten `docker-compose.coolify.yml` (ohne `db`-Dienst) deployen.
Beim Start läuft `prisma migrate deploy` gegen die bereits befüllte
Standalone — da alle Migrationen in `_prisma_migrations` stehen, ist das ein
No-op. Die App verbindet sich nun ausschließlich mit der Standalone.

### 5. Prüfen

- Health-Check grün (`/api/health`).
- Zählwerte vor/nach vergleichen (siehe unten). Sie müssen übereinstimmen.
- Stichprobe in der App: Umsätze, Kategorien, Planposten, offene Posten,
  Einstellungen sind vorhanden.

### 6. Aufräumen — später, eigener Schritt

Erst **nachdem** der Betrieb auf der Standalone verifiziert ist:

- Das alte Volume `pgdata` des früheren `db`-Dienstes entfernen.
- Diese Bereinigung ist bewusst **nicht** Teil dieses Pull Requests, damit der
  Rückweg bis zur Verifikation offensteht.

---

## Zählwerte prüfen (vorher/nachher)

Gegen alte und neue Datenbank identisch ausführen und vergleichen. Die Zahlen
müssen übereinstimmen:

```sql
select 'Account'      as tabelle, count(*) from "Account"
union all select 'Transaction',    count(*) from "Transaction"
union all select 'Category',       count(*) from "Category"
union all select 'Rule',           count(*) from "Rule"
union all select 'Budget',         count(*) from "Budget"
union all select 'PlannedItem',    count(*) from "PlannedItem"
union all select 'OpenItem',       count(*) from "OpenItem"
union all select 'Contact',        count(*) from "Contact"
union all select 'Scenario',       count(*) from "Scenario"
union all select 'CustomKpi',      count(*) from "CustomKpi"
union all select 'IgnoredSevItem', count(*) from "IgnoredSevItem"
union all select 'Setting',        count(*) from "Setting"
order by tabelle;
```

(Die vollständige Modellliste steht in `prisma/schema.prisma`. Für die Prüfung
genügen die Tabellen mit Nutzdaten; leere Konfigurationstabellen sind
unkritisch.)

---

## Rückweg (Rollback)

Solange das alte Volume `pgdata` und der frühere Compose-Stand vorhanden sind,
ist der Rückweg gefahrlos:

1. `DATABASE_URL` an der Anwendung wieder auf die alte In-Compose-Datenbank
   zeigen lassen (bzw. die Env-Variable entfernen und den vorherigen
   Compose-Stand mit dem `db`-Dienst deployen).
2. Vorherigen Commit von `docker-compose.coolify.yml` (mit `db`-Dienst)
   auschecken/deployen.

Da bis Schritt 6 nichts gelöscht wird, sind die alten Daten unverändert
erreichbar.

---

## Was ausdrücklich **nicht** in die Datenbank gewandert ist

**Nichts fehlt.** Die Finanzplanung hält ihren gesamten Zustand bereits
vollständig in Postgres (17 Prisma-Modelle). Es gibt keine Datei- oder
Volume-Ablage mit fachlichem Bestand, die außerhalb der Datenbank verbliebe.

Die einzige verbleibende Altlast ist das **alte `pgdata`-Volume** des früheren
`db`-Dienstes — es enthält denselben Bestand wie die neue Standalone und wird
nach der Verifikation in einem eigenen Schritt entfernt (Schritt 6). Bis dahin
ist es die Rückfallebene, kein Datenverlust.
