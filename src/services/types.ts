import type { InvalidReason } from "../validation/rules";

export interface NameEntry {
  requestedName: string;
  normalizedName: string;
}

export interface InvalidEntry {
  raw: string;
  reason: InvalidReason;
}

export interface DuplicateInListEntry {
  raw: string;
  normalizedName: string;
  firstSeenAs: string;
}

export interface ExistingThreadEntry extends NameEntry {
  existingThreadId: string;
}

export interface ValidationResult {
  toCreate: NameEntry[];
  invalidEntries: InvalidEntry[];
  duplicatesInList: DuplicateInListEntry[];
}

export interface PlanResult {
  totalRequested: number;
  toCreate: NameEntry[];
  invalidEntries: InvalidEntry[];
  duplicatesInList: DuplicateInListEntry[];
  alreadyExisting: ExistingThreadEntry[];
}

export interface ExecutionItemResult {
  requestedName: string;
  normalizedName: string;
  status: "created" | "failed";
  threadId?: string;
  errorReason?: string;
}

export interface ExecutionSummary {
  operationId: string;
  createdCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
  created: ExecutionItemResult[];
  failed: ExecutionItemResult[];
}
