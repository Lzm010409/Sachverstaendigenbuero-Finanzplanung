# ADR-0003: Eigenständige Coolify-Postgres statt In-Compose-Datenbank

## Status
Angenommen

## Datum
2026-08-28

## Kontext
Die Postgres lief zunächst als Dienst `db` im `docker-compose.coolify.yml`
(Volume `pgdata`). Coolify sichert jedoch nur **eigenständige**
Datenbank-Ressourcen über seine Backups; eine In-Compose-DB lässt sich nicht
sichern und erschwert Serverumzüge.

## Entscheidung
Die Anwendung nutzt eine eigenständige Coolify-Postgres-Ressource. `DATABASE_URL`
wird als Umgebungsvariable durchgereicht und zeigt auf deren interne UUID; die
App wird dafür an das externe `coolify`-Netz angeschlossen. Der einmalige
Datenumzug lief env-gesteuert im App-Container (`pg_dump | pg_restore`), verifiziert
über Zählwertvergleich. Details und Rückweg: `DATENBANK-UMSTELLUNG.md`.

## Alternativen
- **In-Compose-DB behalten**: einfacher, aber ohne Backups und schlecht
  umziehbar → verworfen.
- **pg_dump vom Host**: nicht möglich, da kein Shell-Zugriff auf den Coolify-Host
  → stattdessen Kopie im Container.

## Konsequenzen
- Automatische Backups der Datenbank über Coolify.
- Am Programm ändert sich nichts (Prisma spricht die DB nur über `DATABASE_URL`).
- Die alte In-Compose-DB bleibt vorerst als Rückfallebene; das Aufräumen ist ein
  bewusst getrennter Folgeschritt.
