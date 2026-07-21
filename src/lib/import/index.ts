import { parseCamt } from "./camt";
import { parseCsv } from "./csv";
import { parseMt940 } from "./mt940";
import type { ParseResult } from "./types";

export type ImportFormat = "csv" | "camt" | "mt940";

/** Erkennt das Format anhand von Dateiname/Inhalt. */
export function detectFormat(filename: string, content: string): ImportFormat {
  const lower = filename.toLowerCase();
  const head = content.slice(0, 2000);
  if (lower.endsWith(".xml") || head.includes("<Document") || head.includes("BkToCstmr")) {
    return "camt";
  }
  if (lower.endsWith(".sta") || lower.endsWith(".mt940") || /(^|\n):20:/.test(head)) {
    return "mt940";
  }
  return "csv";
}

export function parseStatement(
  filename: string,
  content: string,
  formatOverride?: ImportFormat,
): ParseResult & { format: ImportFormat } {
  const format = formatOverride ?? detectFormat(filename, content);
  let result: ParseResult;
  switch (format) {
    case "camt":
      result = parseCamt(content);
      break;
    case "mt940":
      result = parseMt940(content);
      break;
    default:
      result = parseCsv(content);
  }
  return { ...result, format };
}

export { parseCsv, parseCamt, parseMt940 };
export type { ParseResult, ParsedTransaction } from "./types";
