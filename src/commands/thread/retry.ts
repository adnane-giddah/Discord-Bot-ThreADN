import {
  AttachmentBuilder,
  GuildMember,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppContext } from "../../appContext";
import { buildErrorEmbed, buildFinalReportEmbed, buildProgressEmbed } from "../../utils/embeds";
import { isThreadCapableChannel } from "../../thread_manager/threadExecutor";
import { memberHasRequiredPermission } from "../../permissions/checks";
import { retryOperation } from "../../services/threadCreationService";
import { ProgressReporter } from "../../services/progressReporter";
import type { ThreadOptions } from "../../thread_manager/threadOptions";

export function buildRetrySubcommand(sub: SlashCommandSubcommandBuilder) {
  return sub
    .setName("retry")
    .setDescription("Retry the failed/incomplete items of a previous bulk thread-creation operation")
    .addStringOption((opt) =>
      opt.setName("operation_id").setDescription("Operation ID, e.g. THR-A8F29D").setRequired(true),
    );
}

export async function handleRetry(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  const operationId = interaction.options.getString("operation_id", true).trim().toUpperCase();
  const operation = ctx.operationsRepo.get(operationId);

  if (!operation) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Not Found", `No operation found with ID \`${operationId}\`.`)],
    });
    return;
  }

  const channel = await ctx.client.channels.fetch(operation.channel_id).catch(() => null);
  if (!channel || !isThreadCapableChannel(channel)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Channel Unavailable", "The original target channel no longer exists or no longer supports threads.")],
    });
    return;
  }

  const member = interaction.member;
  if (!member || !(member instanceof GuildMember) || !memberHasRequiredPermission(member, channel, ctx.config)) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Missing Permissions",
          `You need the **${ctx.config.permissions.required}** permission in <#${channel.id}> to retry this operation.`,
        ),
      ],
    });
    return;
  }

  const counts = ctx.threadResultsRepo.countByStatus(operationId);
  const toRetryCount = counts.failed + counts.pending;

  if (toRetryCount === 0) {
    await interaction.editReply({
      embeds: [buildErrorEmbed("Nothing To Retry", "This operation has no failed or pending items — nothing to do.")],
    });
    return;
  }

  const options = JSON.parse(operation.options_json) as ThreadOptions;
  const channelName = channel.name;

  const progressMessage = await interaction.editReply({
    embeds: [buildProgressEmbed({ operationId, channelName, total: toRetryCount, done: 0, created: 0, failed: 0 })],
  });
  const reporter = new ProgressReporter(progressMessage, operationId, channelName);

  const summary = await ctx.queue.enqueue(channel.id, () =>
    retryOperation(
      {
        operationsRepo: ctx.operationsRepo,
        threadResultsRepo: ctx.threadResultsRepo,
        logger: ctx.logger,
        createDelayMs: ctx.config.rateLimiting.createDelayMs,
      },
      {
        operationId,
        channel,
        options,
        onProgress: (snapshot) => reporter.update(snapshot),
      },
    ),
  );

  await reporter.finish({
    total: toRetryCount,
    done: toRetryCount,
    created: summary.createdCount,
    failed: summary.failedCount,
  });

  const finalCounts = ctx.threadResultsRepo.countByStatus(operationId);
  const finalStatus = finalCounts.failed > 0 ? "completed_with_errors" : "completed";
  const previousDuration = operation.duration_ms ?? 0;
  ctx.operationsRepo.complete(operationId, finalStatus, previousDuration + summary.durationMs);

  const { embed, attachmentText } = buildFinalReportEmbed({
    operationId,
    channelName,
    totalRequested: toRetryCount,
    summary,
    skippedExisting: summary.skippedCount,
    skippedDuplicates: 0,
    skippedInvalid: 0,
  });

  const files = attachmentText
    ? [new AttachmentBuilder(Buffer.from(attachmentText, "utf-8"), { name: `${operationId}-retry-details.txt` })]
    : [];

  await interaction.followUp({ embeds: [embed], files });

  ctx.logger.info(
    {
      operationId,
      retried: toRetryCount,
      created: summary.createdCount,
      failed: summary.failedCount,
      skipped: summary.skippedCount,
    },
    "Operation retry completed",
  );
}
