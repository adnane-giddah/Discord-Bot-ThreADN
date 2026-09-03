import { normalizeName, dedupeKey } from "../validation/normalize";
import { findInvalidReason } from "../validation/rules";
import type { ValidationResult } from "./types";

/**
 * Normalizes and validates a raw list of candidate names: drops empty lines,
 * flags names that violate Discord's constraints, and flags case-insensitive
 * duplicates within the submitted list itself (first occurrence wins).
 */
export function validateNames(rawNames: string[]): ValidationResult {
  const result: ValidationResult = {
    toCreate: [],
    invalidEntries: [],
    duplicatesInList: [],
  };

  const seen = new Map<string, string>(); // dedupeKey -> first normalized name seen

  for (const raw of rawNames) {
    const normalized = normalizeName(raw);
    const invalidReason = findInvalidReason(normalized);

    if (invalidReason) {
      result.invalidEntries.push({ raw, reason: invalidReason });
      continue;
    }

    const key = dedupeKey(normalized);
    const firstSeen = seen.get(key);
    if (firstSeen) {
      result.duplicatesInList.push({
        raw,
        normalizedName: normalized,
        firstSeenAs: firstSeen,
      });
      continue;
    }

    seen.set(key, normalized);
    result.toCreate.push({ requestedName: raw, normalizedName: normalized });
  }

  return result;
}
