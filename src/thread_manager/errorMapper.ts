import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";

export interface ClassifiedError {
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/** Turns a thrown error from a discord.js call into a friendly, report-ready reason. */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof DiscordAPIError) {
    const code = err.code;
    const status = err.status;

    if (status === 429) {
      return {
        message: "rate limited by Discord",
        retryable: true,
      };
    }

    switch (code) {
      case RESTJSONErrorCodes.MissingPermissions:
      case RESTJSONErrorCodes.MissingAccess:
        return { message: "insufficient permissions", retryable: false };
      case RESTJSONErrorCodes.MaximumThreadParticipantsReached:
      case RESTJSONErrorCodes.MaximumActiveThreads:
      case RESTJSONErrorCodes.MaximumActiveAnnouncementThreads:
        return {
          message: "channel has reached Discord's maximum active thread limit",
          retryable: false,
        };
      case RESTJSONErrorCodes.InvalidFormBodyOrContentType:
        return { message: "invalid thread name or options", retryable: false };
      case RESTJSONErrorCodes.ThreadLocked:
        return { message: "parent thread/channel is locked", retryable: false };
      default:
        return {
          message: `Discord API error (code ${code}): ${err.message}`,
          retryable: status >= 500,
        };
    }
  }

  if (err instanceof Error) {
    const isNetworkError =
      /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network/i.test(err.message);
    return {
      message: err.message,
      retryable: isNetworkError,
    };
  }

  return { message: "unknown error", retryable: false };
}
