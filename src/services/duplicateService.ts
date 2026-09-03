import { dedupeKey } from "../validation/normalize";
import type { ThreadCapableChannel } from "../thread_manager/threadExecutor";
import type { ExistingThreadEntry, NameEntry } from "./types";

/** Safety bound on archived-thread pagination so a channel with years of history can't hang a preview. */
const MAX_ARCHIVED_PAGES = 20;

export interface DuplicateSplitResult {
  toCreate: NameEntry[];
  alreadyExisting: ExistingThreadEntry[];
}

/**
 * Fetches the channel's active + (bounded) archived threads and splits the
 * candidate list into ones that are genuinely new vs. ones that already
 * exist by name (case-insensitive). This live check — rather than relying on
 * this bot's own history — is what keeps re-running an identical list safe.
 */
export async function splitByExistingThreads(
  channel: ThreadCapableChannel,
  candidates: NameEntry[],
): Promise<DuplicateSplitResult> {
  const existingByKey = new Map<string, string>(); // dedupeKey -> thread id

  const active = await channel.threads.fetchActive();
  for (const thread of active.threads.values()) {
    if (thread.name) existingByKey.set(dedupeKey(thread.name), thread.id);
  }

  let before: string | undefined;
  for (let page = 0; page < MAX_ARCHIVED_PAGES; page++) {
    const archived = await channel.threads.fetchArchived({
      type: "public",
      before,
      limit: 100,
    });
    for (const thread of archived.threads.values()) {
      if (thread.name) existingByKey.set(dedupeKey(thread.name), thread.id);
    }
    if (!archived.hasMore || archived.threads.size === 0) break;
    const last = [...archived.threads.values()].at(-1);
    if (!last?.archiveTimestamp) break;
    before = new Date(last.archiveTimestamp).toISOString();
  }

  const toCreate: NameEntry[] = [];
  const alreadyExisting: ExistingThreadEntry[] = [];

  for (const candidate of candidates) {
    const existingId = existingByKey.get(dedupeKey(candidate.normalizedName));
    if (existingId) {
      alreadyExisting.push({ ...candidate, existingThreadId: existingId });
    } else {
      toCreate.push(candidate);
    }
  }

  return { toCreate, alreadyExisting };
}
