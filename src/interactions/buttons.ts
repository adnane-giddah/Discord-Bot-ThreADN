import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
} from "discord.js";
import type { AppContext } from "../appContext";
import { buildErrorEmbed } from "../utils/embeds";
import { runConfirmedExecution } from "../commands/thread/shared";

const EXPIRED_EMBED = buildErrorEmbed(
  "Preview Expired",
  "This preview is no longer available (it expired, was already actioned, or the bot restarted). Please resubmit your request.",
);

export async function handleButtonInteraction(
  ctx: AppContext,
  interaction: ButtonInteraction,
): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "thread") return;
  const [, action, token] = parts;

  if (action === "cancel") {
    if (token) ctx.pendingPreviews.delete(token);
    await interaction.update({
      embeds: [buildErrorEmbed("Cancelled", "This thread creation operation was cancelled.")],
      components: [],
      files: [],
    });
    return;
  }

  if (action === "confirm") {
    const pending = token ? ctx.pendingPreviews.get(token) : undefined;
    if (!pending) {
      await interaction.update({ embeds: [EXPIRED_EMBED], components: [] });
      return;
    }
    ctx.pendingPreviews.delete(token!);
    await interaction.deferUpdate();
    await runConfirmedExecution(ctx, interaction, pending);
    return;
  }

  if (action === "confirm-large") {
    const pending = token ? ctx.pendingPreviews.get(token) : undefined;
    if (!pending) {
      await interaction.update({ embeds: [EXPIRED_EMBED], components: [] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`thread:typedconfirm:${token}`)
      .setTitle("Confirm Large Operation")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("confirmation")
            .setLabel(`Type CONFIRM to create ${pending.plan.toCreate.length} threads`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("CONFIRM")
            .setMinLength(7)
            .setMaxLength(7)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
    return;
  }
}
