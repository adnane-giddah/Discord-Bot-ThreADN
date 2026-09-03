import { REST, Routes } from "discord.js";
import { loadConfig } from "./config/env.schema";
import { commandDefinitions } from "./commands/registry";

async function deploy(): Promise<void> {
  const config = loadConfig();
  const rest = new REST().setToken(config.discord.token);
  const body = commandDefinitions.map((cmd) => cmd.toJSON());

  if (config.discord.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body },
    );
    // eslint-disable-next-line no-console
    console.log(
      `Registered ${body.length} command(s) to guild ${config.discord.guildId} (instant).`,
    );
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
    // eslint-disable-next-line no-console
    console.log(`Registered ${body.length} command(s) globally (may take up to ~1 hour to propagate).`);
  }
}

deploy().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to deploy commands:", err);
  process.exit(1);
});
