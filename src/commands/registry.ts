import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { AppContext } from "../appContext";
import { buildCreateSubcommand, handleCreate } from "./thread/create";
import { buildBulkSubcommand, handleBulk } from "./thread/bulk";
import { buildStatusSubcommand, handleStatus } from "./thread/status";
import { buildRetrySubcommand, handleRetry } from "./thread/retry";

const threadCommand = new SlashCommandBuilder()
  .setName("thread")
  .setDescription("Bulk thread creation and management")
  .setDMPermission(false)
  .addSubcommand(buildCreateSubcommand)
  .addSubcommand(buildBulkSubcommand)
  .addSubcommand(buildStatusSubcommand)
  .addSubcommand(buildRetrySubcommand);

export const commandDefinitions = [threadCommand];

type SubcommandHandler = (ctx: AppContext, interaction: ChatInputCommandInteraction) => Promise<void>;

const subcommandHandlers: Record<string, SubcommandHandler> = {
  create: handleCreate,
  bulk: handleBulk,
  status: handleStatus,
  retry: handleRetry,
};

export async function dispatchChatInputCommand(
  ctx: AppContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.commandName !== "thread") return;

  const sub = interaction.options.getSubcommand();
  const handler = subcommandHandlers[sub];
  if (!handler) {
    await interaction.reply({ content: `Unknown subcommand: ${sub}`, ephemeral: true });
    return;
  }

  await handler(ctx, interaction);
}
