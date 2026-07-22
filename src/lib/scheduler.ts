// In-Process-Scheduler für den wöchentlichen Liquiditätsbericht. Läuft im
// langlebigen Server-Prozess (gestartet über instrumentation.ts). Der
// Versandzeitpunkt wird über eine DB-Einstellung (Setting) gemerkt, damit
// GENAU EINMAL pro Woche versendet wird – auch über Neustarts hinweg.

import { prisma } from "./db";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // alle 30 Minuten prüfen
let started = false;

async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? null;
}

/**
 * Letzter geplanter Versandzeitpunkt (Wochentag/Stunde in UTC), der <= now ist.
 * Beispiel: Montag 06:00 UTC. Wenn das diese Woche noch nicht war, die
 * Vorwoche.
 */
function lastScheduledOccurrence(now: Date, weekday: number, hourUtc: number): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0));
  const dayDiff = (d.getUTCDay() - weekday + 7) % 7;
  d.setUTCDate(d.getUTCDate() - dayDiff);
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

async function tick(): Promise<void> {
  try {
    const enabled = (await getSetting("notify.weekly")) === "true";
    if (!enabled) return;
    const weekday = Number((await getSetting("notify.weeklyDay")) ?? "1"); // 1 = Montag
    const hourUtc = Number((await getSetting("notify.weeklyHour")) ?? "6"); // 06:00 UTC ≈ 07/08 Uhr DE
    const now = new Date();
    const scheduled = lastScheduledOccurrence(now, weekday, hourUtc);

    const lastSentStr = await getSetting("notify.lastWeeklySent");
    const lastSent = lastSentStr ? new Date(lastSentStr) : null;
    // Fällig, wenn der letzte geplante Termin noch nicht bedient wurde.
    if (lastSent && lastSent.getTime() >= scheduled.getTime()) return;

    const { buildDigest, sendDigestEmail } = await import("./notifications");
    const digest = await buildDigest();
    const res = await sendDigestEmail(digest);
    // Nur bei erfolgreichem Versand als "erledigt" markieren, damit ein fehlendes
    // SMTP nicht dazu führt, dass die Woche als versendet gilt.
    if (res.sent) {
      await prisma.setting.upsert({
        where: { key: "notify.lastWeeklySent" },
        create: { key: "notify.lastWeeklySent", value: now.toISOString() },
        update: { value: now.toISOString() },
      });
      console.log(`[scheduler] Wochenbericht versendet (${now.toISOString()}).`);
    } else if (res.attempted) {
      console.log(`[scheduler] Versand fehlgeschlagen: ${res.reason}`);
    }
    // res.attempted === false (kein Empfänger/SMTP) -> still & ohne Markierung.
  } catch (e) {
    console.log("[scheduler] Fehler:", (e as Error).message);
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  console.log("[scheduler] Wochenversand-Scheduler aktiv (Prüfung alle 30 min).");
  // Erste Prüfung leicht verzögert (Server-Start abwarten).
  setTimeout(() => void tick(), 60 * 1000);
  const timer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  // Timer darf den Prozess nicht am Beenden hindern.
  if (typeof timer.unref === "function") timer.unref();
}
