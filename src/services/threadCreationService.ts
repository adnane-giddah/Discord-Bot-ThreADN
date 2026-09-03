import type { Logger } from "pino";
import { validateNames } from "./validationService";
import { splitByExistingThreads } from "./duplicateService";
import type { ThreadResultRow } from "../database/types";
import type { ThreadCapableChannel } from "../thread_manager/threadExecutor";
import { createSingleThread } from "../thread_manager/threadExecutor";
import type { ThreadOptions } from "../thread_manager/threadOptions";
import { classifyError } from "../thread_manager/errorMapper";
import { sleep } from "../utils/sleep";
import { MAX_CREATE_ATTEMPTS } from "../config/constants";
import type { OperationsRepo } from "../database/repositories/operationsRepo";
import type { ThreadResultsRepo } from "../database/repositories/threadResultsRepo";
import type {
  ExecutionItemResult,
  ExecutionSummary,
  NameEntry,
  PlanResult,
} from "./types";

export async function planOperation(
  channel: ThreadCapableChannel,
  rawNames: string[],
): Promise<PlanResult> {
  const validation = validateNames(rawNames);
  const { toCreate, alreadyExisting } = await splitByExistingThreads(
    channel,
    validation.toCreate,
  );

  return {
    totalRequested: rawNames.length,
    toCreate,
    invalidEntries: validation.invalidEntries,
    duplicatesInList: validation.duplicatesInList,
    alreadyExisting,
  };
}

export interface ProgressSnapshot {
  total: number;
  done: number;
  created: number;
  failed: number;
}

export interface ExecuteDeps {
  operationsRepo: OperationsRepo;
  threadResultsRepo: ThreadResultsRepo;
  logger: Logger;
  createDelayMs: number;
}

export interface ExecuteParams {
  operationId: string;
  channel: ThreadCapableChannel;
  items: NameEntry[];
  options: ThreadOptions;
  onProgress?: (snapshot: ProgressSnapshot) => void | Promise<void>;
}

/**
 * Runs a previously-planned+persisted set of pending thread_results rows to
 * completion, updating each row as it resolves so a mid-batch crash never
 * loses already-completed work. Reusable independent of any Discord command.
 */
export async function executeOperation(
  deps: ExecuteDeps,
  params: ExecuteParams,
): Promise<ExecutionSummary> {
  const { operationsRepo, threadResultsRepo, logger, createDelayMs } = deps;
  const { operationId, channel, items, options } = params;
  const startedAt = Date.now();

  const rowIds = threadResultsRepo.insertPending(operationId, items);

  const created: ExecutionItemResult[] = [];
  const failed: ExecutionItemResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const rowId = rowIds[i]!;

    const outcome = await createWithRetry(channel, item.normalizedName, options);

    if (outcome.ok) {
      threadResultsRepo.markResult(rowId, "created", {
        discordThreadId: outcome.threadId,
      });
      created.push({
        requestedName: item.requestedName,
        normalizedName: item.normalizedName,
        status: "created",
        threadId: outcome.threadId,
      });
      logger.info(
        { operationId, name: item.normalizedName, threadId: outcome.threadId },
        "Thread created",
      );
    } else {
      threadResultsRepo.markResult(rowId, "failed", {
        errorReason: outcome.error,
      });
      failed.push({
        requestedName: item.requestedName,
        normalizedName: item.normalizedName,
        status: "failed",
        errorReason: outcome.error,
      });
      logger.warn(
        { operationId, name: item.normalizedName, error: outcome.error },
        "Thread creation failed",
      );
    }

    const counts = threadResultsRepo.countByStatus(operationId);
    operationsRepo.updateCounts(operationId, {
      created: counts.created,
      skipped: counts.skipped_duplicate + counts.skipped_existing,
      failed: counts.failed,
    });

    await params.onProgress?.({
      total: items.length,
      done: i + 1,
      created: created.length,
      failed: failed.length,
    });

    if (createDelayMs > 0 && i < items.length - 1) {
      await sleep(createDelayMs);
    }
  }

  const durationMs = Date.now() - startedAt;
  const finalCounts = threadResultsRepo.countByStatus(operationId);

  return {
    operationId,
    createdCount: created.length,
    failedCount: failed.length,
    skippedCount: finalCounts.skipped_duplicate + finalCounts.skipped_existing,
    durationMs,
    created,
    failed,
  };
}

type CreateOutcome =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

async function createWithRetry(
  channel: ThreadCapableChannel,
  name: string,
  options: ThreadOptions,
): Promise<CreateOutcome> {
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
    const result = await createSingleThread(channel, name, options);
    if (result.ok) {
      return { ok: true, threadId: result.thread.id };
    }

    lastError = result.error.message;
    if (!result.error.retryable || attempt === MAX_CREATE_ATTEMPTS) {
      break;
    }
    await sleep(result.error.retryAfterMs ?? 1000 * attempt);
  }

  return { ok: false, error: lastError };
}

export interface RetryParams {
  operationId: string;
  channel: ThreadCapableChannel;
  options: ThreadOptions;
  onProgress?: (snapshot: ProgressSnapshot) => void | Promise<void>;
}

/**
 * Re-attempts only the rows still `failed` or `pending` for an existing
 * operation (pending rows occur when the process crashed mid-batch). Re-runs
 * the live duplicate check first, since the target channel's state may have
 * changed since the original attempt (e.g. someone created the thread by hand).
 */
export async function retryOperation(
  deps: ExecuteDeps,
  params: RetryParams,
): Promise<ExecutionSummary> {
  const { operationsRepo, threadResultsRepo, logger, createDelayMs } = deps;
  const { operationId, channel, options } = params;
  const startedAt = Date.now();

  const toRetry = threadResultsRepo.listByStatus(operationId, ["failed", "pending"]);

  const created: ExecutionItemResult[] = [];
  const failed: ExecutionItemResult[] = [];

  if (toRetry.length === 0) {
    return { operationId, createdCount: 0, failedCount: 0, skippedCount: 0, durationMs: 0, created, failed };
  }

  const rowByNormalized = new Map<string, ThreadResultRow>(
    toRetry.map((r) => [r.normalized_name, r]),
  );

  const { toCreate, alreadyExisting } = await splitByExistingThreads(
    channel,
    toRetry.map((r) => ({
      requestedName: r.requested_name,
      normalizedName: r.normalized_name,
    })),
  );

  for (const existing of alreadyExisting) {
    const row = rowByNormalized.get(existing.normalizedName);
    if (row) threadResultsRepo.markResult(row.id, "skipped_existing");
  }

  for (let i = 0; i < toCreate.length; i++) {
    const item = toCreate[i]!;
    const row = rowByNormalized.get(item.normalizedName)!;

    const outcome = await createWithRetry(channel, item.normalizedName, options);

    if (outcome.ok) {
      threadResultsRepo.markResult(row.id, "created", { discordThreadId: outcome.threadId });
      created.push({
        requestedName: item.requestedName,
        normalizedName: item.normalizedName,
        status: "created",
        threadId: outcome.threadId,
      });
      logger.info({ operationId, name: item.normalizedName, threadId: outcome.threadId }, "Thread created (retry)");
    } else {
      threadResultsRepo.markResult(row.id, "failed", { errorReason: outcome.error });
      failed.push({
        requestedName: item.requestedName,
        normalizedName: item.normalizedName,
        status: "failed",
        errorReason: outcome.error,
      });
      logger.warn({ operationId, name: item.normalizedName, error: outcome.error }, "Thread creation failed (retry)");
    }

    const counts = threadResultsRepo.countByStatus(operationId);
    operationsRepo.updateCounts(operationId, {
      created: counts.created,
      skipped: counts.skipped_duplicate + counts.skipped_existing,
      failed: counts.failed,
    });

    await params.onProgress?.({
      total: toCreate.length,
      done: i + 1,
      created: created.length,
      failed: failed.length,
    });

    if (createDelayMs > 0 && i < toCreate.length - 1) {
      await sleep(createDelayMs);
    }
  }

  return {
    operationId,
    createdCount: created.length,
    failedCount: failed.length,
    skippedCount: alreadyExisting.length,
    durationMs: Date.now() - startedAt,
    created,
    failed,
  };
}

// Re-exported so callers that only have raw errors (e.g. bulk permission probes) can reuse the same mapping.
export { classifyError };
