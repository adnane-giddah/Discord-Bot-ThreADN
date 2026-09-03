/**
 * Trims leading/trailing whitespace and collapses internal runs of whitespace
 * to a single space, without touching casing or punctuation the user typed.
 * "   Mathematics   " -> "Mathematics"; "Data   Science" -> "Data Science".
 */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Key used for case-insensitive equality comparisons (duplicates, existing-thread matching). */
export function dedupeKey(normalized: string): string {
  return normalized.toLowerCase();
}
