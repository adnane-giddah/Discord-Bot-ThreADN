import {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppContext } from "../../appContext";
import { buildErrorEmbed } from "../../utils/embeds";
import { renderListOrAttachment } from "../../utils/chunker";

export function buildStatusSubcommand(sub: SlashCommandSubcommandBuilder) {
  return sub
    .setName("status")
    .setDescription("Check the status of a bulk thread-creation operation")
    .addStringOption((opt) =>
      opt.setName("operation_id").setDescription("Operation ID, e.g. THR-A8F29D").setRequired(true),
    );
}

const STATUS_COLORS: Record<string, number> = {
  pending: 0xfee75c,
  running: 0x5865f2,
  completed: 0x57f287,
  completed_with_errors: 0xfee75c,
  interrupted: 0xed4245,
  cancelled: 0x99aab5,
};

export async function handleStatus(
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

  const counts = ctx.threadResultsRepo.countByStatus(operationId);
  const failedRows = ctx.threadResultsRepo.listByStatus(operationId, ["failed"]);

  const channel = await ctx.client.channels.fetch(operation.channel_id).catch(() => null);
  const channelLabel = channel && "name" in channel && channel.name ? `#${channel.name}` : operation.channel_id;

  const embed = new EmbedBuilder()
    .setTitle(`Operation ${operation.id}`)
    .setColor(STATUS_COLORS[operation.status] ?? 0x5865f2)
    .addFields(
      { name: "Status", value: operation.status, inline: true },
      { name: "Channel", value: channelLabel, inline: true },
      { name: "Requested by", value: `<@${operation.user_id}>`, inline: true },
      { name: "Requested", value: String(operation.requested_count), inline: true },
      { name: "Created", value: String(counts.created), inline: true },
      { name: "Skipped", value: String(counts.skipped_duplicate + counts.skipped_existing), inline: true },
      { name: "Failed", value: String(counts.failed), inline: true },
      { name: "Pending", value: String(counts.pending), inline: true },
      {
        name: "Duration",
        value: operation.duration_ms != null ? `${(operation.duration_ms / 1000).toFixed(1)}s` : "—",
        inline: true,
      },
    )
    .setTimestamp(new Date(operation.created_at));

  const files: AttachmentBuilder[] = [];

  if (failedRows.length > 0) {
    const lines = failedRows.map((r) => `• ${r.normalized_name} — ${r.error_reason ?? "unknown error"}`);
    const rendered = renderListOrAttachment(lines);
    if (rendered.mode === "inline") {
      embed.addFields({ name: "Failed items", value: rendered.text });
    } else {
      files.push(
        new AttachmentBuilder(Buffer.from(rendered.content, "utf-8"), {
          name: `${operation.id}-failed.txt`,
        }),
      );
    }
  }

  if (operation.status === "interrupted" || counts.failed > 0 || counts.pending > 0) {
    embed.setFooter({ text: `Run /thread retry operation_id:${operation.id} to retry incomplete items.` });
  }

  await interaction.editReply({ embeds: [embed], files });
}
