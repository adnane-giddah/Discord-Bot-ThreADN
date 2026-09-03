/** Hard limits imposed by the Discord API / client that the whole app must respect. */
export const DISCORD_LIMITS = {
  THREAD_NAME_MAX_LENGTH: 100,
  MESSAGE_MAX_LENGTH: 2000,
  EMBED_DESCRIPTION_MAX_LENGTH: 4096,
  EMBED_FIELD_VALUE_MAX_LENGTH: 1024,
  EMBED_FIELDS_MAX_COUNT: 25,
  EMBED_TOTAL_MAX_LENGTH: 6000,
  MODAL_TEXT_INPUT_MAX_LENGTH: 4000,
  ATTACHMENT_MAX_BYTES_DEFAULT: 8 * 1024 * 1024,
} as const;

/** How many sample names to show inline in a preview/report before falling back to a file attachment. */
export const REPORT_INLINE_ITEM_LIMIT = 15;

/** How often (ms) the live progress message is allowed to be edited, to stay well under Discord's edit rate limits. */
export const PROGRESS_EDIT_MIN_INTERVAL_MS = 1200;

/** Max attempts for a single thread-creation call before giving up and marking it failed. */
export const MAX_CREATE_ATTEMPTS = 3;

/** How long a pending (unconfirmed) preview stays valid in memory before requiring resubmission. */
export const PREVIEW_TTL_MS = 10 * 60 * 1000;

/** Absolute ceiling on names accepted from a single input, regardless of config, to bound memory/parsing cost. */
export const ABSOLUTE_MAX_NAMES_PER_SUBMISSION = 2000;
