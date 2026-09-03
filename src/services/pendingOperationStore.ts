import { PREVIEW_TTL_MS } from "../config/constants";
import { TtlStore } from "../utils/ttlStore";
import type { ThreadOptions } from "../thread_manager/threadOptions";
import type { PlanResult } from "./types";

export interface PendingPreview {
  plan: PlanResult;
  options: ThreadOptions;
  guildId: string;
  channelId: string;
  userId: string;
  requiresTypedConfirmation: boolean;
}

/**
 * Holds not-yet-confirmed preview payloads in memory only. Deliberately not
 * persisted: if the process restarts before Confirm is clicked, the token is
 * simply gone and the button handler reports "preview expired" — no thread
 * has been touched yet, so there is nothing to corrupt.
 */
export class PendingOperationStore extends TtlStore<PendingPreview> {
  constructor() {
    super(PREVIEW_TTL_MS);
  }
}
