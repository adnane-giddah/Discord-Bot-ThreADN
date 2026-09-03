import { randomBytes } from "node:crypto";
import type { OperationsRepo } from "../database/repositories/operationsRepo";

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_CHARS[bytes[i]! % ID_CHARS.length];
  }
  return out;
}

/** Generates a short, human-shareable, collision-checked operation id like THR-A8F29D. */
export function generateOperationId(repo: OperationsRepo): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = `THR-${randomSuffix(6)}`;
    if (!repo.exists(id)) return id;
  }
  throw new Error("Failed to generate a unique operation id after 10 attempts");
}
