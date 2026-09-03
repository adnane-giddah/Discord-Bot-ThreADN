import type { Message } from "discord.js";
import { buildProgressEmbed } from "../utils/embeds";
import { PROGRESS_EDIT_MIN_INTERVAL_MS } from "../config/constants";
import type { ProgressSnapshot } from "./threadCreationService";

/**
 * Edits a single message to reflect progress, throttled so a large operation
 * never spams the channel or hits Discord's message-edit rate limits.
 */
export class ProgressReporter {
  private lastEditAt = 0;
  private pending: ProgressSnapshot | null = null;
  private editing = false;

  constructor(
    private readonly message: Message,
    private readonly operationId: string,
    private readonly channelName: string,
  ) {}

  async update(snapshot: ProgressSnapshot, force = false): Promise<void> {
    this.pending = snapshot;
    const elapsed = Date.now() - this.lastEditAt;
    if (!force && elapsed < PROGRESS_EDIT_MIN_INTERVAL_MS) return;
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.editing || !this.pending) return;
    this.editing = true;
    const snapshot = this.pending;
    this.lastEditAt = Date.now();
    try {
      await this.message.edit({
        embeds: [
          buildProgressEmbed({
            operationId: this.operationId,
            channelName: this.channelName,
            total: snapshot.total,
            done: snapshot.done,
            created: snapshot.created,
            failed: snapshot.failed,
          }),
        ],
      });
    } catch {
      // Progress-display failures must never abort the underlying operation.
    } finally {
      this.editing = false;
    }
  }

  async finish(snapshot: ProgressSnapshot): Promise<void> {
    await this.update(snapshot, true);
  }
}
