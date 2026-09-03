import type { DatabaseSync } from "node:sqlite";
import type { ThreadResultRow, ThreadResultStatus } from "../types";

export class ThreadResultsRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** Inserts one pending row per item and returns their row ids, in the same order as `items`. */
  insertPending(
    operationId: string,
    items: { requestedName: string; normalizedName: string }[],
  ): number[] {
    const stmt = this.db.prepare(
      `INSERT INTO thread_results
        (operation_id, requested_name, normalized_name, status, updated_at)
       VALUES (?, ?, ?, 'pending', ?)`,
    );
    const now = new Date().toISOString();
    const ids: number[] = [];
    for (const item of items) {
      const info = stmt.run(
        operationId,
        item.requestedName,
        item.normalizedName,
        now,
      );
      ids.push(Number(info.lastInsertRowid));
    }
    return ids;
  }

  insertResolved(
    operationId: string,
    item: {
      requestedName: string;
      normalizedName: string;
      status: ThreadResultStatus;
      discordThreadId?: string;
      errorReason?: string;
    },
  ): void {
    this.db
      .prepare(
        `INSERT INTO thread_results
          (operation_id, requested_name, normalized_name, status, discord_thread_id, error_reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        operationId,
        item.requestedName,
        item.normalizedName,
        item.status,
        item.discordThreadId ?? null,
        item.errorReason ?? null,
        new Date().toISOString(),
      );
  }

  markResult(
    id: number,
    status: ThreadResultStatus,
    fields: { discordThreadId?: string; errorReason?: string } = {},
  ): void {
    this.db
      .prepare(
        `UPDATE thread_results
         SET status = ?, discord_thread_id = COALESCE(?, discord_thread_id),
             error_reason = ?, attempt_count = attempt_count + 1, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        status,
        fields.discordThreadId ?? null,
        fields.errorReason ?? null,
        new Date().toISOString(),
        id,
      );
  }

  listByOperation(operationId: string): ThreadResultRow[] {
    return this.db
      .prepare(
        "SELECT * FROM thread_results WHERE operation_id = ? ORDER BY id ASC",
      )
      .all(operationId) as unknown as ThreadResultRow[];
  }

  listByStatus(
    operationId: string,
    statuses: ThreadResultStatus[],
  ): ThreadResultRow[] {
    const placeholders = statuses.map(() => "?").join(", ");
    return this.db
      .prepare(
        `SELECT * FROM thread_results WHERE operation_id = ? AND status IN (${placeholders}) ORDER BY id ASC`,
      )
      .all(operationId, ...statuses) as unknown as ThreadResultRow[];
  }

  countByStatus(operationId: string): Record<ThreadResultStatus, number> {
    const rows = this.db
      .prepare(
        "SELECT status, COUNT(*) as count FROM thread_results WHERE operation_id = ? GROUP BY status",
      )
      .all(operationId) as { status: ThreadResultStatus; count: number }[];

    const result: Record<ThreadResultStatus, number> = {
      pending: 0,
      created: 0,
      skipped_duplicate: 0,
      skipped_existing: 0,
      failed: 0,
    };
    for (const row of rows) result[row.status] = row.count;
    return result;
  }
}
