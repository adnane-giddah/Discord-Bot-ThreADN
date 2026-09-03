import { ABSOLUTE_MAX_NAMES_PER_SUBMISSION } from "../config/constants";

export type InputSource =
  | { type: "inline"; raw: string }
  | { type: "modal"; raw: string }
  | { type: "file"; raw: string; filename: string };

/**
 * Extracts raw candidate names from any supported input source. New input
 * methods can be added by extending InputSource and this switch — nothing
 * downstream needs to change.
 */
export function extractRawNames(source: InputSource): string[] {
  switch (source.type) {
    case "inline":
    case "modal":
      return splitFreeText(source.raw);
    case "file":
      return source.filename.toLowerCase().endsWith(".csv")
        ? splitCsv(source.raw)
        : splitFreeText(source.raw);
  }
}

/** Newline-delimited when the input has newlines; otherwise falls back to comma-delimited. */
function splitFreeText(raw: string): string[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parts = lines.length > 1 ? lines : raw.split(",");
  return parts.slice(0, ABSOLUTE_MAX_NAMES_PER_SUBMISSION);
}

/** Takes the first column of a CSV, skipping a header row if it looks like one. */
function splitCsv(raw: string): string[] {
  const rows = raw
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => parseCsvLine(line)[0] ?? "");

  if (rows.length === 0) return [];

  const looksLikeHeader = /^(name|thread|title|topic)s?$/i.test(
    rows[0]!.trim(),
  );
  const data = looksLikeHeader ? rows.slice(1) : rows;
  return data.slice(0, ABSOLUTE_MAX_NAMES_PER_SUBMISSION);
}

/** Minimal CSV field parser: handles quoted fields with embedded commas/quotes. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}
