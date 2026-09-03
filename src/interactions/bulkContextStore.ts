import { TtlStore } from "../utils/ttlStore";
import type { ThreadOptionOverrides } from "../thread_manager/threadOptions";

export interface BulkContext {
  guildId: string;
  channelId: string;
  userId: string;
  overrides: ThreadOptionOverrides;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Short-lived store bridging a /thread bulk command invocation to its follow-up paste modal. */
export const bulkContextStore = new TtlStore<BulkContext>(FIVE_MINUTES_MS);
