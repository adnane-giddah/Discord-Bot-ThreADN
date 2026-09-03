import {
  ChannelType,
  type AnyThreadChannel,
  type ForumChannel,
  type MediaChannel,
  type NewsChannel,
  type TextChannel,
} from "discord.js";
import { classifyError, type ClassifiedError } from "./errorMapper";
import { threadTypeFor, type ThreadOptions } from "./threadOptions";

export type ThreadCapableChannel =
  | TextChannel
  | NewsChannel
  | ForumChannel
  | MediaChannel;

export type CreateThreadResult =
  | { ok: true; thread: AnyThreadChannel }
  | { ok: false; error: ClassifiedError };

/** Creates exactly one thread. Never throws — errors are classified and returned. */
export async function createSingleThread(
  parent: ThreadCapableChannel,
  name: string,
  options: ThreadOptions,
): Promise<CreateThreadResult> {
  try {
    let thread: AnyThreadChannel;

    if (
      parent.type === ChannelType.GuildForum ||
      parent.type === ChannelType.GuildMedia
    ) {
      thread = await parent.threads.create({
        name,
        autoArchiveDuration: options.autoArchiveMinutes,
        message: { content: options.startingMessage || "​" },
        appliedTags: options.tags,
      });
    } else if (parent.type === ChannelType.GuildAnnouncement) {
      // Announcement channels only support one thread type; public/private visibility doesn't apply.
      thread = await parent.threads.create({
        name,
        autoArchiveDuration: options.autoArchiveMinutes,
        type: ChannelType.AnnouncementThread,
      });

      if (options.startingMessage) {
        await thread.send(options.startingMessage);
      }
    } else {
      thread = await parent.threads.create({
        name,
        autoArchiveDuration: options.autoArchiveMinutes,
        type: threadTypeFor(options.visibility),
      });

      if (options.startingMessage) {
        await thread.send(options.startingMessage);
      }
    }

    if (options.slowmodeSeconds && options.slowmodeSeconds > 0) {
      await thread.setRateLimitPerUser(options.slowmodeSeconds);
    }

    return { ok: true, thread };
  } catch (err) {
    return { ok: false, error: classifyError(err) };
  }
}

export function isThreadCapableChannel(
  channel: unknown,
): channel is ThreadCapableChannel {
  if (!channel || typeof channel !== "object" || !("type" in channel)) {
    return false;
  }
  const type = (channel as { type: ChannelType }).type;
  return (
    type === ChannelType.GuildText ||
    type === ChannelType.GuildAnnouncement ||
    type === ChannelType.GuildForum ||
    type === ChannelType.GuildMedia
  );
}
