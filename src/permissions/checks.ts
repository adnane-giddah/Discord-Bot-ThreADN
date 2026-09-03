import {
  PermissionsBitField,
  type GuildMember,
  type PermissionResolvable,
} from "discord.js";
import type { ThreadCapableChannel } from "../thread_manager/threadExecutor";
import type { AppConfig } from "../config/env.schema";

export function memberHasRequiredPermission(
  member: GuildMember,
  channel: ThreadCapableChannel,
  config: AppConfig,
): boolean {
  const required = PermissionsBitField.Flags[
    config.permissions.required
  ] as bigint;
  return channel
    .permissionsFor(member)
    ?.has(required as PermissionResolvable) ?? false;
}

export function botCanCreateThreads(
  channel: ThreadCapableChannel,
  visibility: "public" | "private" = "public",
): { ok: true } | { ok: false; missing: string[] } {
  const me = channel.guild.members.me;
  if (!me) return { ok: false, missing: ["Unknown bot member"] };

  const perms = channel.permissionsFor(me);
  const required: [bigint, string][] = [
    [PermissionsBitField.Flags.ViewChannel, "View Channel"],
    [PermissionsBitField.Flags.SendMessagesInThreads, "Send Messages in Threads"],
    visibility === "private"
      ? [PermissionsBitField.Flags.CreatePrivateThreads, "Create Private Threads"]
      : [PermissionsBitField.Flags.CreatePublicThreads, "Create Public Threads"],
    [PermissionsBitField.Flags.ManageThreads, "Manage Threads"],
  ];

  const missing = required
    .filter(([flag]) => !perms?.has(flag as PermissionResolvable))
    .map(([, label]) => label);

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

export function meetsBulkThreshold(
  count: number,
  isAdministrator: boolean,
  config: AppConfig,
): { allowed: true; requiresTypedConfirmation: boolean } | { allowed: false; reason: string } {
  if (count > config.bulkSafety.hardMax && !isAdministrator) {
    return {
      allowed: false,
      reason: `This operation would create ${count} threads, exceeding the configured hard maximum of ${config.bulkSafety.hardMax}. Only an Administrator can proceed with an operation this large.`,
    };
  }

  return {
    allowed: true,
    requiresTypedConfirmation: count > config.bulkSafety.confirmThreshold,
  };
}
