// In-Content-Ladezustand für Navigationen innerhalb des App-Bereichs. Next.js
// zeigt dies automatisch als Suspense-Fallback, solange die (dynamische) Zielseite
// serverseitig rendert – so „hängt" nichts mehr ohne sichtbares Feedback.
export default function AppLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-400">
      <span className="jd-spinner h-8 w-8" />
      <p className="text-sm">Lädt…</p>
    </div>
  );
}
