import type { ModalSubmitInteraction } from "discord.js";
import type { AppContext } from "../appContext";
import { buildErrorEmbed } from "../utils/embeds";
import { extractRawNames } from "../services/parsingService";
import { isThreadCapableChannel } from "../thread_manager/threadExecutor";
import { planAndReplyPreview, runConfirmedExecution } from "../commands/thread/shared";
import { bulkContextStore } from "./bulkContextStore";

const EXPIRED_EMBED = buildErrorEmbed(
  "Expired",
  "This interaction is no longer available (it expired, was already actioned, or the bot restarted). Please resubmit your request.",
);

export async function handleModalSubmit(
  ctx: AppContext,
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "thread") return;
  const [, action, token] = parts;

  if (action === "bulkmodal") {
    const context = token ? bulkContextStore.get(token) : undefined;
    if (!context) {
      await interaction.reply({ embeds: [EXPIRED_EMBED], ephemeral: true });
      return;
    }
    bulkContextStore.delete(token!);

    await interaction.deferReply();

    const channel = await ctx.client.channels.fetch(context.channelId).catch(() => null);
    if (!channel || !isThreadCapableChannel(channel)) {
      await interaction.editReply({
        embeds: [buildErrorEmbed("Channel Unavailable", "The target channel is no longer available.")],
      });
      return;
    }

    const namesRaw = interaction.fields.getTextInputValue("names");
    const rawNames = extractRawNames({ type: "modal", raw: namesRaw });

    await planAndReplyPreview(ctx, interaction, channel, rawNames, context.overrides);
    return;
  }

  if (action === "typedconfirm") {
    const pending = token ? ctx.pendingPreviews.get(token) : undefined;
    if (!pending) {
      await interaction.reply({ embeds: [EXPIRED_EMBED], ephemeral: true });
      return;
    }

    const typed = interaction.fields.getTextInputValue("confirmation").trim();
    if (typed.toUpperCase() !== "CONFIRM") {
      await interaction.reply({
        embeds: [
          buildErrorEmbed(
            "Not Confirmed",
            'You must type "CONFIRM" exactly to proceed. The operation was not started — resubmit if you want to try again.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    ctx.pendingPreviews.delete(token!);
    await interaction.deferReply();

    if (interaction.message) {
      await interaction.message.edit({ components: [] }).catch(() => undefined);
    }

    await runConfirmedExecution(ctx, interaction, pending);
    return;
  }
}
