// Einfacher In-Memory-Ratenbegrenzer (gleitendes Fenster) für den
// Passwort-Login. Bewusst prozesslokal: Die Anwendung läuft als eine
// Container-Instanz, ein verteilter Speicher wäre hier Overengineering.
//
// Zweck: Brute-Force gegen das Fallback-Passwort ausbremsen. Nach zu vielen
// Fehlversuchen je Schlüssel (i. d. R. die Client-IP) wird für eine Sperrzeit
// abgewiesen – ein erfolgreicher Login setzt den Zähler zurück.

type Eintrag = { treffer: number[]; gesperrtBis?: number };

const speicher = new Map<string, Eintrag>();

export type RateLimitOptions = {
  /** Erlaubte Versuche innerhalb des Fensters. */
  max: number;
  /** Fensterlänge in Millisekunden. */
  fensterMs: number;
  /** Sperrzeit in Millisekunden, sobald das Limit gerissen ist. */
  sperreMs: number;
};

export type RateLimitErgebnis = {
  /** true = Versuch erlaubt, false = abgewiesen. */
  erlaubt: boolean;
  /** Verbleibende Versuche im Fenster (0, wenn gesperrt). */
  verbleibend: number;
  /** Sekunden bis zur nächsten Erlaubnis (nur bei Sperre gesetzt). */
  warteSek?: number;
};

/**
 * Registriert einen Versuch und meldet, ob er erlaubt ist. Läuft ein Schlüssel
 * über das Limit, wird er für `sperreMs` gesperrt.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitErgebnis {
  const jetzt = Date.now();
  const e = speicher.get(key) ?? { treffer: [] };

  if (e.gesperrtBis && e.gesperrtBis > jetzt) {
    return { erlaubt: false, verbleibend: 0, warteSek: Math.ceil((e.gesperrtBis - jetzt) / 1000) };
  }

  // Alte Treffer außerhalb des Fensters verwerfen.
  e.treffer = e.treffer.filter((t) => t > jetzt - opts.fensterMs);
  e.treffer.push(jetzt);
  delete e.gesperrtBis;

  if (e.treffer.length > opts.max) {
    e.gesperrtBis = jetzt + opts.sperreMs;
    e.treffer = [];
    speicher.set(key, e);
    return { erlaubt: false, verbleibend: 0, warteSek: Math.ceil(opts.sperreMs / 1000) };
  }

  speicher.set(key, e);
  return { erlaubt: true, verbleibend: Math.max(0, opts.max - e.treffer.length) };
}

/**
 * Prüft, ob ein Schlüssel aktuell gesperrt ist – ohne einen Versuch zu zählen.
 * Für die Vorabprüfung, bevor überhaupt ein Login-Versuch unternommen wird.
 */
export function rateLimitStatus(key: string): { gesperrt: boolean; warteSek?: number } {
  const e = speicher.get(key);
  const jetzt = Date.now();
  if (e?.gesperrtBis && e.gesperrtBis > jetzt) {
    return { gesperrt: true, warteSek: Math.ceil((e.gesperrtBis - jetzt) / 1000) };
  }
  return { gesperrt: false };
}

/** Setzt den Zähler eines Schlüssels zurück (z. B. nach erfolgreichem Login). */
export function rateLimitReset(key: string): void {
  speicher.delete(key);
}
