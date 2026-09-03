import {
  ChannelType,
  SlashCommandSubcommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppContext } from "../../appContext";
import { extractRawNames } from "../../services/parsingService";
import { buildErrorEmbed } from "../../utils/embeds";
import {
  AUTO_ARCHIVE_CHOICES,
  planAndReplyPreview,
  readOverridesFromOptions,
  resolveTargetChannel,
} from "./shared";

export function buildCreateSubcommand(sub: SlashCommandSubcommandBuilder) {
  return sub
    .setName("create")
    .setDescription("Create one or more threads from a comma or newline separated list of names")
    .addStringOption((opt) =>
      opt
        .setName("names")
        .setDescription("Thread names, separated by commas or newlines")
        .setRequired(true)
        .setMaxLength(4000),
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

export async function handleCreate(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply();

  const channelId = interaction.options.getChannel("channel")?.id ?? null;
  const resolved = resolveTargetChannel(interaction, channelId);
  if (!resolved.ok) {
    await interaction.editReply({ embeds: [buildErrorEmbed("Invalid Channel", resolved.message)] });
    return;
  }

  const namesRaw = interaction.options.getString("names", true);
  const rawNames = extractRawNames({ type: "inline", raw: namesRaw });
  const overrides = readOverridesFromOptions(interaction);

  await planAndReplyPreview(ctx, interaction, resolved.channel, rawNames, overrides);
}
