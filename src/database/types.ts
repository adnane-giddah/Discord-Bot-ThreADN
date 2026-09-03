export type OperationStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "interrupted"
  | "cancelled";

export type ThreadResultStatus =
  | "pending"
  | "created"
  | "skipped_duplicate"
  | "skipped_existing"
  | "failed";

export interface OperationRow {
  id: string;
  guild_id: string;
  channel_id: string;
  user_id: string;
  requested_count: number;
  created_count: number;
  skipped_count: number;
  failed_count: number;
  status: OperationStatus;
  options_json: string;
  progress_channel_id: string | null;
  progress_message_id: string | null;
  created_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface ThreadResultRow {
  id: number;
  operation_id: string;
  requested_name: string;
  normalized_name: string;
  status: ThreadResultStatus;
  discord_thread_id: string | null;
  error_reason: string | null;
  attempt_count: number;
  updated_at: string;
}
