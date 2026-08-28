# Datenbank-Umstellung: eigenständige Coolify-Postgres

Diese Anleitung dokumentiert die Umstellung der Finanzplanung von der **im
Compose mitgeführten** Postgres (`db`-Dienst mit Volume `pgdata`) auf eine
**eigenständige Coolify-Datenbank-Ressource** — Datenübertragung, Prüfung und
Rückweg. Sie beschreibt den **tatsächlich ausgeführten** Weg.

Der Grund: Coolify sichert nur eigenständige Datenbank-Ressourcen über seine
*Backups*. Eine Postgres, die als Dienst im `docker-compose.coolify.yml` steckt,
lässt sich nicht sichern und erschwert jeden Serverumzug.

> **Am Programm ändert sich nichts.** Prisma spricht die Datenbank ausschließlich
> über `DATABASE_URL` an, und der Container wendet beim Start `prisma migrate
> deploy` an (wiederholbar, idempotent). Der Umbau ist rein ein Deployment-Umbau.

**Status: abgeschlossen.** Die laufende Anwendung (`dt6b44ru…`) läuft auf der
Standalone `finanzplanung-postgres` (UUID `a117z8eqedr5vnsry9u5llrq`). Die alte
`db` samt Volume `pgdata` bleibt als Rückfallebene erhalten (siehe *Aufräumen*).

---

## Warum ein Kopiermechanismus im Container statt `pg_dump` auf dem Host

Auf den Coolify-Host besteht kein Shell-Zugriff, ein `pg_dump`/`pg_restore`
direkt auf dem Host ist damit nicht möglich. Der Umzug läuft deshalb
**env-gesteuert im App-Container** über `scripts/db-copy.sh`:

- Das Runtime-Image enthält dafür `postgresql16-client` (`pg_dump`, `pg_restore`,
  `psql`) — siehe `Dockerfile` (Runner-Stufe).
- `db-copy.sh` läuft **nur**, wenn `DB_COPY=1` **und** `DB_COPY_TARGET` gesetzt
  sind, sonst beendet es sich sofort wirkungslos. Es ist der erste Schritt der
  `CMD`-Kette, noch vor `prisma migrate deploy` und `node server.js`.
- Kopiert wird mit dem bewährten `pg_dump --format=custom | pg_restore
  --clean --if-exists` (idempotent, kein stilles Verdoppeln).
- **Quelle**: `DB_COPY_SOURCE`, ersatzweise `DATABASE_URL`. **Ziel**:
  `DB_COPY_TARGET`. Der Prisma-Zusatz `?schema=public` wird für libpq
  abgeschnitten.
- Zum Schluss vergleicht das Skript die **Zählwerte** aller 17 Tabellen zwischen
  Quelle (`alt`) und Ziel (`neu`) und meldet jede Abweichung.

---

## Was sich in diesem Repository geändert hat

Zwei Dateien:

1. **`docker-compose.coolify.yml`**
   - **`DATABASE_URL`** wird nicht mehr inline aus `SERVICE_PASSWORD_POSTGRES`
     zusammengesetzt, sondern als Umgebungsvariable aus Coolify durchgereicht
     (`- DATABASE_URL`). Sie zeigt jetzt auf die Standalone (Host = deren UUID).
   - Die App ist zusätzlich an das externe Coolify-Netz angeschlossen
     (`networks: [default, coolify]` + Top-Level `networks.coolify.external:
     true`). **Ohne das** kann der Compose-Stack die Standalone nicht per UUID
     auflösen (`could not translate host name … Try again`).
   - Durchgereichte Umzugs-Variablen `- DB_COPY`, `- DB_COPY_TARGET` sowie die
     fest verdrahtete Quelle
     `- DB_COPY_SOURCE=postgresql://liqui:${SERVICE_PASSWORD_POSTGRES}@db:5432/liqui`
     (Passwort per Coolify-Magie, kein Geheimnis im Repo).
   - Der Dienst **`db`** und das Volume **`pgdata`** sind **weiterhin vorhanden**
     — bewusst als Rückfallebene, bis der Betrieb verifiziert ist.

2. **`Dockerfile`** — `postgresql16-client` in der Runner-Stufe; `sh
   scripts/db-copy.sh &&` als erstes Glied der `CMD`-Kette.

Neu: **`scripts/db-copy.sh`** (der env-gesteuerte Umzug).

Die lokale Entwicklung bleibt unverändert: dafür weiterhin `docker-compose.yml`
verwenden.

---

## Ausgeführte Reihenfolge

### 1. Standalone-Postgres in Coolify angelegt

- PostgreSQL **16** (identisch zum bisherigen `postgres:16-alpine`), gleiche
  Destination/Netz `coolify` wie die Anwendung, Benutzer/DB `liqui`.
- **Backups aktivieren** (am Datenbank-Objekt) — der eigentliche Zweck.
- Verbindungszeichenkette:
  `postgresql://liqui:<passwort>@a117z8eqedr5vnsry9u5llrq:5432/liqui?schema=public`
  — **ausschließlich in der Coolify-Env, niemals im Repository.**

### 2. Datenkopie (Phase A) — App bleibt auf der alten `db`

An der **laufenden** Anwendung gesetzt: `DB_COPY=1`,
`DB_COPY_TARGET=<Standalone-URL>`. Deploy. `db-copy.sh` kopierte aus der alten
`db` in die Standalone und meldete für alle 17 Tabellen `alt = neu`
(„OK: alle Zählwerte stimmen überein"). `DATABASE_URL` zeigte hier noch auf `db`,
die App blieb also unverändert auf der alten Datenbank — reine Kopie.

### 3. Umschaltung (Phase B) — verlustfreier Schluss-Abgleich + Cutover

In **einem** Deploy:

- `DATABASE_URL` an der Anwendung auf die **Standalone** gesetzt.
- `DB_COPY_SOURCE` (im Compose) pinnt die Quelle weiter auf die alte `db`, damit
  `db-copy.sh` unmittelbar vor dem Start **noch einmal** alles Alte → Standalone
  spiegelt (fängt etwaige Schreibvorgänge seit Phase A ab).
- Ergebnis in den Logs: erneut volle Parität, danach
  `Datasource "db": … at "a117z8eqedr5vnsry9u5llrq:5432"` und
  `No pending migrations to apply.` → die App läuft nun auf der Standalone.

### 4. Kopiermechanismus abgeschaltet — **wichtig**

Nach dem Cutover ist die Standalone die **Live-Datenbank**. Bliebe `DB_COPY=1`
gesetzt, würde der **nächste** Deploy sie via `--clean --if-exists` mit dem
eingefrorenen Alt-Stand überschreiben. Deshalb wurden `DB_COPY` und
`DB_COPY_TARGET` an der Anwendung **entfernt**. `db-copy.sh` beendet sich damit
bei jedem künftigen Deploy sofort wirkungslos.

### 5. Geprüft

- Health-Check grün (`/api/health` → `{"status":"ok"}`), `/login` erreichbar.
- Zählwerte alt/neu identisch (siehe unten).
- App-Status `running:healthy`.

---

## Verifizierte Zählwerte (alt = neu)

| Tabelle | Anzahl | | Tabelle | Anzahl |
|---|---:|---|---|---:|
| Account | 8 | | Scenario | 2 |
| Transaction | 6612 | | ScenarioCategoryAdjustment | 1 |
| Category | 45 | | CustomKpi | 0 |
| Rule | 67 | | IgnoredSevItem | 6 |
| Budget | 32 | | ForecastSnapshot | 2 |
| PlannedItem | 50 | | Setting | 20 |
| OpenItem | 763 | | OAuthClient | 2 |
| Contact | 1767 | | OAuthCode | 1 |
| | | | OAuthToken | 96 |

Zur erneuten Prüfung gegen beide Datenbanken identisch ausführen und vergleichen:

```sql
select 'Account' as tabelle, count(*) from "Account"
union all select 'Transaction',                count(*) from "Transaction"
union all select 'Category',                   count(*) from "Category"
union all select 'Rule',                       count(*) from "Rule"
union all select 'Budget',                     count(*) from "Budget"
union all select 'PlannedItem',                count(*) from "PlannedItem"
union all select 'OpenItem',                   count(*) from "OpenItem"
union all select 'Contact',                    count(*) from "Contact"
union all select 'Scenario',                   count(*) from "Scenario"
union all select 'ScenarioCategoryAdjustment', count(*) from "ScenarioCategoryAdjustment"
union all select 'CustomKpi',                  count(*) from "CustomKpi"
union all select 'IgnoredSevItem',             count(*) from "IgnoredSevItem"
union all select 'ForecastSnapshot',           count(*) from "ForecastSnapshot"
union all select 'Setting',                    count(*) from "Setting"
union all select 'OAuthClient',                count(*) from "OAuthClient"
union all select 'OAuthCode',                  count(*) from "OAuthCode"
union all select 'OAuthToken',                 count(*) from "OAuthToken"
order by tabelle;
```

---

## Rückweg (Rollback)

Solange das alte Volume `pgdata` und der `db`-Dienst im Compose vorhanden sind,
ist der Rückweg gefahrlos:

1. `DATABASE_URL` an der Anwendung wieder auf die alte In-Compose-Datenbank
   zeigen lassen: `postgresql://liqui:${SERVICE_PASSWORD_POSTGRES}@db:5432/liqui?schema=public`.
2. Neu deployen. Die App verbindet sich wieder mit der alten `db`.

Da bis zum Aufräumen nichts gelöscht wird, sind die alten Daten unverändert
erreichbar. (Hinweis: Nach dem Cutover in die Standalone geschriebene Daten sind
in der alten `db` naturgemäß nicht enthalten.)

---

## Aufräumen — später, eigener Schritt

Erst **nachdem** der Betrieb auf der Standalone dauerhaft verifiziert ist und
kein Rückweg mehr gebraucht wird:

- Umzugs-Gerüst aus dem Repo entfernen: `scripts/db-copy.sh`, das
  `postgresql16-client`-Paket und das `sh scripts/db-copy.sh &&`-Glied im
  `Dockerfile` sowie `DB_COPY_SOURCE` und die Passthroughs `DB_COPY`/
  `DB_COPY_TARGET` im Compose.
- Dienst **`db`** und Volume **`pgdata`** aus `docker-compose.coolify.yml`
  entfernen; das alte Volume in Coolify löschen.

Diese Bereinigung ist bewusst **nicht** Teil der Umschaltung, damit der Rückweg
bis zur Verifikation offensteht.

---

## Was ausdrücklich **nicht** außerhalb der Datenbank liegt

**Nichts fehlt.** Die Finanzplanung hält ihren gesamten fachlichen Zustand
vollständig in Postgres (17 Prisma-Modelle). Es gibt keine Datei- oder
Volume-Ablage mit fachlichem Bestand außerhalb der Datenbank. Die einzige
verbleibende Altlast ist das alte `pgdata`-Volume — dieselben Daten wie in der
Standalone, Rückfallebene bis zum Aufräumschritt.
