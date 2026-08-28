// Leichter, strukturierter Logger (JSON je Zeile). Kein Fremdpaket – die
// Ausgabe geht nach stdout/stderr und landet so in den Coolify-Container-Logs.
//
// Grundsätze (Observability-Checkliste):
//  - Ereignisname + maschinenlesbare Felder statt interpolierter Prosa.
//  - Feste Level: error = Invariante verletzt, warn = degradiert aber behandelt,
//    info = fachliches Ereignis, debug = nur bei LOG_LEVEL=debug.
//  - Niemals Geheimnisse/Token/Passwörter/vollständige PII loggen. Der Aufrufer
//    gibt nur Felder aus einer bewussten Auswahl mit.

type Level = "debug" | "info" | "warn" | "error";
type Felder = Record<string, string | number | boolean | null | undefined>;

const RANG: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Schwelle: in Produktion standardmäßig "info", per LOG_LEVEL übersteuerbar.
function schwelle(): number {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level;
  return RANG[env] ?? RANG.info;
}

function schreibe(level: Level, event: string, felder?: Felder): void {
  if (RANG[level] < schwelle()) return;
  const zeile: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...felder,
  };
  const text = JSON.stringify(zeile);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (event: string, felder?: Felder) => schreibe("debug", event, felder),
  info: (event: string, felder?: Felder) => schreibe("info", event, felder),
  warn: (event: string, felder?: Felder) => schreibe("warn", event, felder),
  error: (event: string, felder?: Felder) => schreibe("error", event, felder),
};

/** Reduziert eine Fehlerursache auf eine loggbare, PII-arme Nachricht. */
export function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
