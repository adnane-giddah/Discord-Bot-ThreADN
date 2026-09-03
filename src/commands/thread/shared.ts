import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildMember,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ThreadAutoArchiveDuration,
} from "discord.js";
import type { AppContext } from "../../appContext";
import {
  isThreadCapableChannel,
  type ThreadCapableChannel,
} from "../../thread_manager/threadExecutor";
import {
  resolveThreadOptions,
  type ThreadOptionOverrides,
} from "../../thread_manager/threadOptions";
import {
  botCanCreateThreads,
  memberHasRequiredPermission,
  meetsBulkThreshold,
} from "../../permissions/checks";
import { executeOperation, planOperation } from "../../services/threadCreationService";
import { buildErrorEmbed, buildProgressEmbed, buildPreviewEmbed } from "../../utils/embeds";
import { buildFinalReportMessage } from "../../services/reportBuilder";
import { ProgressReporter } from "../../services/progressReporter";
import { generateOperationId } from "../../utils/idGenerator";
import { ABSOLUTE_MAX_NAMES_PER_SUBMISSION } from "../../config/constants";
import type { PendingPreview } from "../../services/pendingOperationStore";

export const AUTO_ARCHIVE_CHOICES = [
  { name: "1 hour", value: 60 },
  { name: "24 hours", value: 1440 },
  { name: "3 days", value: 4320 },
  { name: "7 days", value: 10080 },
];

export function resolveTargetChannel(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  explicitChannelId: string | null,
): { ok: true; channel: ThreadCapableChannel } | { ok: false; message: string } {
  const channel = explicitChannelId
    ? interaction.guild?.channels.cache.get(explicitChannelId)
    : interaction.channel;

  if (!channel) {
    return { ok: false, message: "I couldn't find that channel." };
  }

  if (!isThreadCapableChannel(channel)) {
    return {
      ok: false,
      message: `<#${channel.id}> is a ${ChannelType[channel.type] ?? "channel"} and doesn't support threads. Choose a text, announcement, forum, or media channel.`,
    };
  }

  return { ok: true, channel };
}

export function readOverridesFromOptions(
  interaction: ChatInputCommandInteraction,
): ThreadOptionOverrides {
  const visibility = interaction.options.getString("visibility") as
    | "public"
    | "private"
    | null;
  const autoArchive = interaction.options.getInteger("auto_archive");
  const slowmode = interaction.options.getInteger("slowmode");
  const startingMessage = interaction.options.getString("starting_message");

  const overrides: ThreadOptionOverrides = {};
  if (visibility) overrides.visibility = visibility;
  if (autoArchive) overrides.autoArchiveMinutes = autoArchive as ThreadAutoArchiveDuration;
  if (slowmode) overrides.slowmodeSeconds = slowmode;
  if (startingMessage) overrides.startingMessage = startingMessage;
  return overrides;
}

/**
 * Shared pipeline used by both /thread create and /thread bulk once raw
 * names have been obtained (from a slash command option, a modal, or a
 * file): permission checks -> plan (validate + live duplicate check) ->
 * preview reply with Confirm/Cancel.
 */
export async function planAndReplyPreview(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  channel: ThreadCapableChannel,
  rawNames: string[],
  overrides: ThreadOptionOverrides,
): Promise<void> {
  const member = interaction.member;
  if (!member || !(member instanceof GuildMember)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Error", "Could not resolve your guild member.")],
    });
    return;
  }

  if (!memberHasRequiredPermission(member, channel, ctx.config)) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Missing Permissions",
          `You need the **${ctx.config.permissions.required}** permission in <#${channel.id}> to create threads in bulk.`,
        ),
      ],
    });
    return;
  }

  const options = resolveThreadOptions(channel.id, ctx.config, overrides);
  const botCheck = botCanCreateThreads(channel, options.visibility);
  if (!botCheck.ok) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Bot Missing Permissions",
          `I'm missing the following permission(s) in <#${channel.id}>: **${botCheck.missing.join(", ")}**.`,
        ),
      ],
    });
    return;
  }

  if (rawNames.length === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Nothing to do", "No thread names were found in your input.")],
    });
    return;
  }

  if (rawNames.length > ABSOLUTE_MAX_NAMES_PER_SUBMISSION) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Too Many Names",
          `A single submission can contain at most ${ABSOLUTE_MAX_NAMES_PER_SUBMISSION} names (received ${rawNames.length}). Please split this into smaller batches.`,
        ),
      ],
    });
    return;
  }

  const plan = await planOperation(channel, rawNames);

  if (plan.toCreate.length === 0) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Nothing New To Create",
          `Of ${plan.totalRequested} name(s) submitted: ${plan.alreadyExisting.length} already exist, ${plan.duplicatesInList.length} were duplicates in your input, and ${plan.invalidEntries.length} were invalid. There is nothing left to create.`,
        ),
      ],
    });
    return;
  }

  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  const threshold = meetsBulkThreshold(plan.toCreate.length, isAdmin, ctx.config);
  if (!threshold.allowed) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Operation Too Large", threshold.reason)],
    });
    return;
  }

  const token = ctx.pendingPreviews.create({
    plan,
    options,
    guildId: interaction.guildId!,
    channelId: channel.id,
    userId: interaction.user.id,
    requiresTypedConfirmation: threshold.requiresTypedConfirmation,
  });

  const { embed, attachmentText } = buildPreviewEmbed({
    channelName: channel.name,
    plan,
    autoArchiveMinutes: options.autoArchiveMinutes,
    visibility: options.visibility,
    requiresTypedConfirmation: threshold.requiresTypedConfirmation,
  });

  const confirmButton = new ButtonBuilder()
    .setCustomId(
      threshold.requiresTypedConfirmation ? `thread:confirm-large:${token}` : `thread:confirm:${token}`,
    )
    .setLabel(threshold.requiresTypedConfirmation ? "Confirm (large operation)" : "Create Threads")
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`thread:cancel:${token}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

  const files = attachmentText
    ? [new AttachmentBuilder(Buffer.from(attachmentText, "utf-8"), { name: "preview-details.txt" })]
    : [];

  await interaction.editReply({ embeds: [embed], components: [row], files });
}

/**
 * Runs a confirmed operation end-to-end: assigns the operation id, persists
 * the operations row, executes via the queue with live progress, then posts
 * the final report. Shared by both the direct-confirm and typed-confirm
 * (large operation) button/modal flows.
 */
export async function runConfirmedExecution(
  ctx: AppContext,
  interaction: ButtonInteraction | ModalSubmitInteraction,
  pending: PendingPreview,
): Promise<void> {
  const channel = await ctx.client.channels.fetch(pending.channelId).catch(() => null);
  if (!channel || !isThreadCapableChannel(channel)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Channel Unavailable", "The target channel is no longer available.")],
      components: [],
    });
    return;
  }

  const channelName = channel.name;
  const operationId = generateOperationId(ctx.operationsRepo);

  // requested_count intentionally excludes invalid entries (they never become a
  // thread_results row), so it always equals created+skipped+failed+pending —
  // keeping /thread status internally consistent. The full submitted total
  // (including invalid entries) is shown in the preview and final report instead.
  const trackedCount =
    pending.plan.toCreate.length +
    pending.plan.alreadyExisting.length +
    pending.plan.duplicatesInList.length;

  ctx.operationsRepo.create({
    id: operationId,
    guildId: pending.guildId,
    channelId: pending.channelId,
    userId: pending.userId,
    requestedCount: trackedCount,
    optionsJson: JSON.stringify(pending.options),
  });

  // Persist the skip decisions made at preview time too, so /thread status and
  // logs reflect the full picture even after a restart, not just what got created.
  for (const existing of pending.plan.alreadyExisting) {
    ctx.threadResultsRepo.insertResolved(operationId, {
      requestedName: existing.requestedName,
      normalizedName: existing.normalizedName,
      status: "skipped_existing",
      discordThreadId: existing.existingThreadId,
    });
  }
  for (const dup of pending.plan.duplicatesInList) {
    ctx.threadResultsRepo.insertResolved(operationId, {
      requestedName: dup.raw,
      normalizedName: dup.normalizedName,
      status: "skipped_duplicate",
    });
  }

  const progressMessage = await interaction.editReply({
    embeds: [
      buildProgressEmbed({
        operationId,
        channelName,
        total: pending.plan.toCreate.length,
        done: 0,
        created: 0,
        failed: 0,
      }),
    ],
    components: [],
    files: [],
  });
  const reporter = new ProgressReporter(progressMessage, operationId, channelName);

  ctx.logger.info(
    {
      operationId,
      userId: pending.userId,
      guildId: pending.guildId,
      channelId: pending.channelId,
      requested: pending.plan.toCreate.length,
    },
    "Bulk thread creation started",
  );

  const summary = await ctx.queue.enqueue(channel.id, () =>
    executeOperation(
      {
        operationsRepo: ctx.operationsRepo,
        threadResultsRepo: ctx.threadResultsRepo,
        logger: ctx.logger,
        createDelayMs: ctx.config.rateLimiting.createDelayMs,
      },
      {
        operationId,
        channel,
        items: pending.plan.toCreate,
        options: pending.options,
        onProgress: (snapshot) => reporter.update(snapshot),
      },
    ),
  );

  await reporter.finish({
    total: pending.plan.toCreate.length,
    done: pending.plan.toCreate.length,
    created: summary.createdCount,
    failed: summary.failedCount,
  });

  const finalStatus = summary.failedCount > 0 ? "completed_with_errors" : "completed";
  ctx.operationsRepo.complete(operationId, finalStatus, summary.durationMs);

  const message = buildFinalReportMessage({
    operationId,
    channelName,
    plan: pending.plan,
    summary,
  });

  await interaction.followUp(message);

  ctx.logger.info(
    {
      operationId,
      created: summary.createdCount,
      failed: summary.failedCount,
      skipped:
        pending.plan.alreadyExisting.length +
        pending.plan.duplicatesInList.length +
        pending.plan.invalidEntries.length,
      durationMs: summary.durationMs,
    },
    "Bulk thread creation completed",
  );
}
