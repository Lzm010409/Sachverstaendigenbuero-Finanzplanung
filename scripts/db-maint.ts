// DB-Analyse + Aufräumen. Meldet Tabellengrößen, Live-/Dead-Tupel und
// Datenbankgröße und gibt anschließend per VACUUM (FULL, ANALYZE) belegten,
// aber ungenutzten Speicher (u.a. durch die entfernte raw-Spalte und wiederholte
// Syncs entstandene "Dead Tuples") an das Betriebssystem zurück.
// Läuft im Container per DB_MAINT=true (Ausgabe über die Logs).
// VACUUM FULL sperrt Tabellen kurz und braucht etwas freien Speicher – daher
// erst NACH dem Freiräumen des Host-Speichers ausführen.

import { prisma } from "@/lib/db";

interface SizeRow { table: string; total: string; dead: bigint; live: bigint }

async function report(label: string) {
  const dbSize = await prisma.$queryRawUnsafe<{ size: string }[]>(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
  );
  console.log(`[db-maint] ${label}: Datenbankgröße = ${dbSize[0]?.size}`);
  const rows = await prisma.$queryRawUnsafe<SizeRow[]>(`
    SELECT c.relname AS table,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
           COALESCE(s.n_dead_tup,0) AS dead,
           COALESCE(s.n_live_tup,0) AS live
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC`);
  for (const r of rows) {
    console.log(`[db-maint]   ${r.table}: ${r.total} (live ${r.live}, dead ${r.dead})`);
  }
}

async function main() {
  await report("VORHER");
  console.log("[db-maint] Führe VACUUM (FULL, ANALYZE) aus …");
  for (const t of ["Transaction", "OpenItem", "Account", "Contact", "Setting", "ForecastSnapshot", "Rule", "Category", "PlannedItem", "Scenario"]) {
    try {
      await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) "${t}"`);
      console.log(`[db-maint]   ${t} ✓`);
    } catch (e) {
      console.log(`[db-maint]   ${t} übersprungen: ${(e as Error).message}`);
    }
  }
  await report("NACHHER");
  console.log("[db-maint] fertig.");
}

main().catch((e) => console.log("[db-maint] Fehler:", (e as Error).message)).finally(() => process.exit(0));
