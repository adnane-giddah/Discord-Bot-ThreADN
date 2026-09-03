import type { DatabaseSync } from "node:sqlite";
import type { OperationRow, OperationStatus } from "../types";

export class OperationsRepo {
  constructor(private readonly db: DatabaseSync) {}

  create(params: {
    id: string;
    guildId: string;
    channelId: string;
    userId: string;
    requestedCount: number;
    optionsJson: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO operations
          (id, guild_id, channel_id, user_id, requested_count, status, options_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
      )
      .run(
        params.id,
        params.guildId,
        params.channelId,
        params.userId,
        params.requestedCount,
        params.optionsJson,
        new Date().toISOString(),
      );
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM operations WHERE id = ?")
      .get(id);
    return row !== undefined;
  }

  get(id: string): OperationRow | undefined {
    return this.db.prepare("SELECT * FROM operations WHERE id = ?").get(id) as
      | OperationRow
      | undefined;
  }

  setProgressMessage(id: string, channelId: string, messageId: string): void {
    this.db
      .prepare(
        "UPDATE operations SET progress_channel_id = ?, progress_message_id = ? WHERE id = ?",
      )
      .run(channelId, messageId, id);
  }

  updateCounts(
    id: string,
    counts: { created: number; skipped: number; failed: number },
  ): void {
    this.db
      .prepare(
        `UPDATE operations
         SET created_count = ?, skipped_count = ?, failed_count = ?
         WHERE id = ?`,
      )
      .run(counts.created, counts.skipped, counts.failed, id);
  }

  complete(
    id: string,
    status: Extract<OperationStatus, "completed" | "completed_with_errors">,
    durationMs: number,
  ): void {
    this.db
      .prepare(
        `UPDATE operations
         SET status = ?, completed_at = ?, duration_ms = ?
         WHERE id = ?`,
      )
      .run(status, new Date().toISOString(), durationMs, id);
  }

  markInterrupted(id: string): void {
    this.db
      .prepare(
        "UPDATE operations SET status = 'interrupted', completed_at = ? WHERE id = ?",
      )
      .run(new Date().toISOString(), id);
  }

  findStale(statuses: OperationStatus[]): OperationRow[] {
    const placeholders = statuses.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM operations WHERE status IN (${placeholders})`)
      .all(...statuses) as unknown as OperationRow[];
  }
}
