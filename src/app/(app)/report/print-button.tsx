"use client";

export function PrintButton() {
  return (
    <button className="btn-primary print:hidden" onClick={() => window.print()}>
      Drucken / als PDF speichern
    </button>
  );
}
