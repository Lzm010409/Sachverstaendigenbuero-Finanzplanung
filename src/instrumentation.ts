// Next.js Instrumentation: läuft einmalig beim Serverstart (nur Node-Runtime).
// Startet den In-Process-Scheduler für den wöchentlichen Liquiditätsbericht.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
