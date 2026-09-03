import { type Interaction } from "discord.js";
import type { AppContext } from "../appContext";
import { dispatchChatInputCommand } from "../commands/registry";
import { handleButtonInteraction } from "./buttons";
import { handleModalSubmit } from "./modals";
import { buildErrorEmbed } from "../utils/embeds";

export async function routeInteraction(ctx: AppContext, interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await dispatchChatInputCommand(ctx, interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButtonInteraction(ctx, interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModalSubmit(ctx, interaction);
      return;
    }
  } catch (err) {
    ctx.logger.error({ err, customId: "customId" in interaction ? interaction.customId : undefined }, "Unhandled interaction error");
    await safelyReportError(interaction, err);
  }
}

async function safelyReportError(interaction: Interaction, err: unknown): Promise<void> {
  if (
    !interaction.isRepliable()
  ) {
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  const embed = buildErrorEmbed(
    "Something Went Wrong",
    `An unexpected error occurred: ${message}\n\nThis was logged. No threads were left in an inconsistent state — check \`/thread status\` if you have an operation ID.`,
  );

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch {
    // Best-effort only — nothing more we can do if even the error report fails to send.
  }
}
