import { Client, GatewayIntentBits, Partials } from "discord.js";
import { loadConfig } from "./config/env.schema";
import { createLogger } from "./logging/logger";
import { openDatabase } from "./database/db";
import { createAppContext } from "./appContext";
import { routeInteraction } from "./interactions/router";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logging);

  logger.info("Starting bot...");

  const db = openDatabase(config.db.path, logger);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });

  const ctx = createAppContext(client, config, db, logger);

  recoverInterruptedOperations(ctx);

  client.once("clientReady", () => {
    logger.info({ user: client.user?.tag }, "Bot is ready");
  });

  client.on("interactionCreate", (interaction) => {
    void routeInteraction(ctx, interaction);
  });

  client.on("error", (err) => {
    logger.error({ err }, "Discord client error");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    try {
      client.destroy();
      db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection");
  });

  await client.login(config.discord.token);
}

/**
 * On boot, any operation still marked pending/running was interrupted by a
 * crash or restart. We never silently resume it (channel state may have
 * changed) — instead mark it interrupted so /thread status surfaces it and
 * points the user at /thread retry, with every already-completed row intact.
 */
function recoverInterruptedOperations(ctx: ReturnType<typeof createAppContext>): void {
  const stale = ctx.operationsRepo.findStale(["pending", "running"]);
  for (const op of stale) {
    ctx.operationsRepo.markInterrupted(op.id);
    ctx.logger.warn(
      { operationId: op.id, guildId: op.guild_id, channelId: op.channel_id },
      "Marked operation as interrupted after restart",
    );
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
