#!/bin/sh
# Einmaliger, wiederholbarer Datenumzug in eine eigenständige Postgres.
#
# Läuft nur, wenn DB_COPY=1 und DB_COPY_TARGET gesetzt sind — sonst sofort ohne
# Wirkung. Quelle ist die aktuelle DATABASE_URL (die alte In-Compose-Datenbank,
# ausschließlich lesend), Ziel die Standalone. Kopiert wird mit dem
# battle-tested pg_dump/pg_restore, nicht handgeschrieben. Der Vorgang ist
# idempotent: pg_restore räumt das Ziel vorher auf (--clean --if-exists), ein
# zweiter Lauf erzeugt denselben Stand ohne Dubletten. Die Quelle bleibt
# unangetastet, damit der Rückweg jederzeit offensteht.
set -eu

if [ "${DB_COPY:-}" != "1" ] || [ -z "${DB_COPY_TARGET:-}" ]; then
  exit 0
fi

# Quelle: standardmäßig die laufende DATABASE_URL. Beim finalen Umzug zeigt
# DATABASE_URL aber schon auf das Ziel — dann pinnt DB_COPY_SOURCE die Quelle
# explizit auf die alte Datenbank, damit der letzte Abgleich verlustfrei genau
# vor der Umschaltung läuft.
SRC_RAW="${DB_COPY_SOURCE:-$DATABASE_URL}"
# libpq versteht den Prisma-Zusatz "?schema=public" nicht — daher abschneiden.
SRC="${SRC_RAW%%\?*}"
DST="${DB_COPY_TARGET%%\?*}"

echo "[db-copy] Start: Quelle -> Ziel (pg_dump | pg_restore)"
pg_dump --format=custom --no-owner --no-privileges "$SRC" > /tmp/fp.dump
echo "[db-copy] Dump erstellt ($(wc -c < /tmp/fp.dump) Bytes). Spiele ins Ziel ein…"
# --clean --if-exists macht den Lauf wiederholbar; benigne DROP-Hinweise auf dem
# leeren Ziel sind kein Fehler, deshalb wird der Restore-Exitcode nicht als
# Abbruch gewertet. Die Wahrheit sind die Zählwerte unten.
pg_restore --no-owner --no-privileges --clean --if-exists -d "$DST" /tmp/fp.dump || true
rm -f /tmp/fp.dump

echo "[db-copy] Zählwerte (alt = Quelle, neu = Ziel):"
ABWEICHUNG=0
for TAB in Account Transaction Category Rule Budget PlannedItem OpenItem Contact \
           Scenario ScenarioCategoryAdjustment CustomKpi IgnoredSevItem \
           ForecastSnapshot Setting OAuthClient OAuthCode OAuthToken; do
  A=$(psql -tA "$SRC" -c "select count(*) from \"$TAB\"" 2>/dev/null || echo "?")
  B=$(psql -tA "$DST" -c "select count(*) from \"$TAB\"" 2>/dev/null || echo "?")
  MARK=""
  if [ "$A" != "$B" ]; then MARK="  <-- ABWEICHUNG"; ABWEICHUNG=1; fi
  printf '[db-copy]   %-28s alt=%-8s neu=%-8s%s\n' "$TAB" "$A" "$B" "$MARK"
done

if [ "$ABWEICHUNG" = "1" ]; then
  echo "[db-copy] WARNUNG: Zählwerte weichen ab — bitte prüfen, NICHT umschalten."
else
  echo "[db-copy] OK: alle Zählwerte stimmen überein."
fi
echo "[db-copy] Fertig. (Quelle unverändert; Umschaltung erfolgt separat.)"
