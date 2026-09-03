export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: "init",
    sql: `
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        requested_count INTEGER NOT NULL,
        created_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        options_json TEXT NOT NULL,
        progress_channel_id TEXT,
        progress_message_id TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS thread_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL REFERENCES operations(id),
        requested_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        status TEXT NOT NULL,
        discord_thread_id TEXT,
        error_reason TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_thread_results_operation ON thread_results(operation_id);
      CREATE INDEX IF NOT EXISTS idx_thread_results_status ON thread_results(operation_id, status);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
    `,
  },
];
