import {
  ActionRowBuilder,
  ChannelType,
  GuildMember,
  ModalBuilder,
  SlashCommandSubcommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppContext } from "../../appContext";
import { extractRawNames } from "../../services/parsingService";
import { buildErrorEmbed } from "../../utils/embeds";
import { bulkContextStore } from "../../interactions/bulkContextStore";
import { memberHasRequiredPermission } from "../../permissions/checks";
import {
  AUTO_ARCHIVE_CHOICES,
  planAndReplyPreview,
  readOverridesFromOptions,
  resolveTargetChannel,
} from "./shared";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".txt", ".csv"];

export function buildBulkSubcommand(sub: SlashCommandSubcommandBuilder) {
  return sub
    .setName("bulk")
    .setDescription("Bulk-create threads from a pasted list or an uploaded .txt/.csv file")
    .addAttachmentOption((opt) =>
      opt
        .setName("file")
        .setDescription("A .txt or .csv file, one thread name per line (or first CSV column)"),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Target channel (defaults to this channel)")
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.GuildForum,
          ChannelType.GuildMedia,
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName("visibility")
        .setDescription("Public or private threads")
        .addChoices({ name: "Public", value: "public" }, { name: "Private", value: "private" }),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("auto_archive")
        .setDescription("Auto-archive duration")
        .addChoices(...AUTO_ARCHIVE_CHOICES),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("slowmode")
        .setDescription("Slowmode (seconds) for the created threads")
        .setMinValue(0)
        .setMaxValue(21600),
    )
    .addStringOption((opt) =>
      opt
        .setName("starting_message")
        .setDescription("First message to post in each created thread")
        .setMaxLength(1900),
    );
}

export async function handleBulk(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const channelId = interaction.options.getChannel("channel")?.id ?? null;
  const resolved = resolveTargetChannel(interaction, channelId);
  const overrides = readOverridesFromOptions(interaction);
  const attachment = interaction.options.getAttachment("file");

  if (!resolved.ok) {
    await interaction.reply({
      embeds: [buildErrorEmbed("Invalid Channel", resolved.message)],
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member;
  if (!member || !(member instanceof GuildMember) || !memberHasRequiredPermission(member, resolved.channel, ctx.config)) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          "Missing Permissions",
          `You need the **${ctx.config.permissions.required}** permission in <#${resolved.channel.id}> to create threads in bulk.`,
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (!attachment) {
    // No file provided: collect the list via a modal instead.
    const token = bulkContextStore.create({
      guildId: interaction.guildId!,
      channelId: resolved.channel.id,
      userId: interaction.user.id,
      overrides,
    });

    const modal = new ModalBuilder()
      .setCustomId(`thread:bulkmodal:${token}`)
      .setTitle("Bulk Thread Names")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("names")
            .setLabel("Thread names (one per line)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Mathematics\nPhysics\nComputer Science\nAlgorithms")
            .setRequired(true)
            .setMaxLength(4000),
        ),
      );

    await interaction.showModal(modal);
    return;
  }

  await interaction.deferReply();

  const filename = attachment.name ?? "input.txt";
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) =>
    filename.toLowerCase().endsWith(ext),
  );
  if (!hasAllowedExtension) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Unsupported File Type",
          `Please upload a ${ALLOWED_EXTENSIONS.join(" or ")} file.`,
        ),
      ],
    });
    return;
  }

  if (attachment.size > MAX_FILE_BYTES) {
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "File Too Large",
          `The uploaded file is ${(attachment.size / 1024 / 1024).toFixed(1)} MB, which exceeds the ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB limit.`,
        ),
      ],
    });
    return;
  }

  let text: string;
  try {
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    text = await response.text();
  } catch (err) {
    ctx.logger.warn({ err }, "Failed to download bulk attachment");
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          "Download Failed",
          "I couldn't download the attached file. Please try again.",
        ),
      ],
    });
    return;
  }

  const rawNames = extractRawNames({ type: "file", raw: text, filename });
  await planAndReplyPreview(ctx, interaction, resolved.channel, rawNames, overrides);
}
