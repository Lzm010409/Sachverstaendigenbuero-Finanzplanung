import { createHash } from "node:crypto";
import { isoDate } from "../dates";
import type { ParsedTransaction } from "./types";

/**
 * Stabiler Dedup-Hash pro Umsatz. Zwei Importe derselben Buchung erzeugen
 * denselben Hash und werden so nicht doppelt angelegt.
 */
export function importHash(accountId: string, tx: ParsedTransaction): string {
  const parts = [
    accountId,
    isoDate(tx.bookingDate),
    String(tx.amount),
    tx.counterparty.trim().toLowerCase(),
    tx.purpose.trim().toLowerCase().replace(/\s+/g, " "),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
