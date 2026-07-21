// Einheitliches Zwischenformat, in das alle Parser (CSV/CAMT/MT940) münden.
export interface ParsedTransaction {
  bookingDate: Date;
  valueDate?: Date | null;
  amount: number; // Cent, vorzeichenbehaftet (positiv = Zufluss)
  counterparty: string;
  purpose: string;
  raw?: string;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  warnings: string[];
}
