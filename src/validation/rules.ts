import { DISCORD_LIMITS } from "../config/constants";

export type InvalidReason = "empty" | "too_long" | "control_characters";

const CONTROL_CHAR_PATTERN = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]",
);

export function findInvalidReason(normalized: string): InvalidReason | null {
  if (normalized.length === 0) return "empty";
  if (normalized.length > DISCORD_LIMITS.THREAD_NAME_MAX_LENGTH) return "too_long";
  if (CONTROL_CHAR_PATTERN.test(normalized)) return "control_characters";
  return null;
}

export function describeInvalidReason(reason: InvalidReason): string {
  switch (reason) {
    case "empty":
      return "empty name";
    case "too_long":
      return `exceeds Discord's ${DISCORD_LIMITS.THREAD_NAME_MAX_LENGTH}-character thread name limit`;
    case "control_characters":
      return "contains invalid control characters";
  }
}
