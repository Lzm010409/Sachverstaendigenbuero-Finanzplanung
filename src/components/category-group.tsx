"use client";

import { useEffect, useState } from "react";

// Auf-/zuklappbare Überkategorie. Startet IMMER eingeklappt; die Kopfzeile
// trägt deshalb die Summen der enthaltenen Kategorien, damit eingeklappt kein
// Informationsverlust entsteht. Der zuletzt gewählte Zustand wird je Seite im
// localStorage gemerkt (reiner Anzeigezustand, gehört nicht in die Datenbank).
//
// Im Druck/PDF wird immer aufgeklappt gerendert – der Bildschirmzustand darf
// nicht in den Report durchschlagen (print:-Klassen unten).

function useOpenState(storeKey: string, groupId: string) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.includes(groupId)) setOpen(true);
    } catch {
      /* Speicher nicht verfügbar – Standard (eingeklappt) bleibt */
    }
  }, [storeKey, groupId]);

  const toggle = () =>
    setOpen((prev) => {
      const next = !prev;
      try {
        const raw = localStorage.getItem(storeKey);
        const parsed = raw ? JSON.parse(raw) : [];
        const set = new Set<string>(Array.isArray(parsed) ? parsed : []);
        if (next) set.add(groupId);
        else set.delete(groupId);
        localStorage.setItem(storeKey, JSON.stringify([...set]));
      } catch {
        /* ignore */
      }
      return next;
    });

  return [open, toggle] as const;
}

/**
 * Klappbare Überkategorie in einer Tabelle. `header` ist die Summenzeile
 * (<tr>), `children` sind die Kategoriezeilen (<tr>). Beide liegen in eigenen
 * <tbody>-Blöcken – zulässiges HTML und die einzige Möglichkeit, Zeilen ohne
 * Bruch des Tabellenflusses gemeinsam auszublenden.
 *
 * Die Kopfzeile ist komplett klickbar. Ein vom Aufrufer gerendertes Element mit
 * der Klasse `chev` wird über das data-Attribut gedreht.
 */
export function GroupTableSection({
  storeKey,
  groupId,
  header,
  children,
}: {
  storeKey: string;
  groupId: string;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, toggle] = useOpenState(storeKey, groupId);
  return (
    <>
      <tbody
        onClick={toggle}
        data-open={open}
        className="cursor-pointer select-none"
      >
        {header}
      </tbody>
      <tbody data-group-rows={groupId} data-open={open} className={open ? "" : "hidden print:table-row-group"}>
        {children}
      </tbody>
    </>
  );
}

/**
 * Klappbare Überkategorie außerhalb von Tabellen (Karten-/Listenlayout).
 * `header` bleibt sichtbar, `children` werden ein-/ausgeklappt.
 */
export function GroupSection({
  storeKey,
  groupId,
  header,
  children,
  className,
}: {
  storeKey: string;
  groupId: string;
  header: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, toggle] = useOpenState(storeKey, groupId);
  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-open={open}
        className="w-full text-left"
      >
        {header}
      </button>
      <div data-group-rows={groupId} data-open={open} className={open ? "" : "hidden print:block"}>
        {children}
      </div>
    </div>
  );
}

/** Einheitliches Klapp-Dreieck; Drehung steuert die umgebende Sektion. */
export function Chevron({ className = "" }: { className?: string }) {
  return <span className={`chev inline-block text-[10px] text-slate-400 ${className}`}>▶</span>;
}

/**
 * Kapselt Bedienelemente innerhalb einer klickbaren Gruppen-Kopfzeile, damit
 * ein Klick darauf nicht zusätzlich das Auf-/Zuklappen auslöst.
 */
export function StopClick({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}
