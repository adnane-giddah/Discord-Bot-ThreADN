import { ChannelType, type ThreadAutoArchiveDuration } from "discord.js";
import type { AppConfig } from "../config/env.schema";

export interface ThreadOptions {
  visibility: "public" | "private";
  autoArchiveMinutes: ThreadAutoArchiveDuration;
  slowmodeSeconds?: number;
  startingMessage?: string;
  /** Forum-channel tag names to apply, where the parent channel is a forum. */
  tags?: string[];
  parentChannelId: string;
}

export interface ThreadOptionOverrides {
  visibility?: "public" | "private";
  autoArchiveMinutes?: ThreadAutoArchiveDuration;
  slowmodeSeconds?: number;
  startingMessage?: string;
  tags?: string[];
}

/** Resolves final thread options: per-command overrides > global config defaults. */
export function resolveThreadOptions(
  parentChannelId: string,
  config: AppConfig,
  overrides: ThreadOptionOverrides = {},
): ThreadOptions {
  return {
    parentChannelId,
    visibility: overrides.visibility ?? config.threadDefaults.type,
    autoArchiveMinutes:
      overrides.autoArchiveMinutes ??
      (config.threadDefaults.autoArchiveMinutes as ThreadAutoArchiveDuration),
    slowmodeSeconds: overrides.slowmodeSeconds,
    startingMessage: overrides.startingMessage,
    tags: overrides.tags,
  };
}

export function threadTypeFor(
  visibility: "public" | "private",
): ChannelType.PublicThread | ChannelType.PrivateThread {
  return visibility === "private"
    ? ChannelType.PrivateThread
    : ChannelType.PublicThread;
}
