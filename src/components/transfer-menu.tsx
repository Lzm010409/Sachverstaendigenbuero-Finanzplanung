"use client";

import { useEffect, useRef, useState } from "react";

// Kleines Dropdown „→ <Ziel>" mit den Optionen kopieren / verschieben. Nutzt
// echte Formulare (Server-Action), damit Ladeindikator + Revalidierung greifen.
// „verschieben" verlangt eine Bestätigung, da die Quelle entfernt wird.
export function TransferMenu({
  id,
  label,
  action,
}: {
  id: string;
  label: string; // z.B. "Planposten" oder "Budget"
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="text-slate-400 hover:text-brand" onClick={() => setOpen((o) => !o)}>
        → {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-40 rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg">
          <form action={action} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="mode" value="copy" />
            <button type="submit" className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50">
              als {label} <strong>kopieren</strong>
            </button>
          </form>
          <form
            action={action}
            onSubmit={(e) => {
              if (!confirm(`Wirklich als ${label} verschieben? Die Quelle wird entfernt.`)) {
                e.preventDefault();
                return;
              }
              setOpen(false);
            }}
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="mode" value="move" />
            <button type="submit" className="block w-full rounded px-2 py-1.5 text-left text-slate-600 hover:bg-slate-50">
              als {label} <strong>verschieben</strong>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
