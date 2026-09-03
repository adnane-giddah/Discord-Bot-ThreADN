import { z } from "zod";
import path from "node:path";
import dotenv from "dotenv";
import { PermissionsBitField } from "discord.js";

dotenv.config();

const permissionNames = Object.keys(
  PermissionsBitField.Flags,
) as (keyof typeof PermissionsBitField.Flags)[];

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().optional().default(""),

  DB_PATH: z.string().default("./data/bot.sqlite3"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  LOG_DIR: z.string().default("./logs"),

  DEFAULT_AUTO_ARCHIVE_MINUTES: z.coerce
    .number()
    .int()
    .refine((v) => [60, 1440, 4320, 10080].includes(v), {
      message: "must be one of 60, 1440, 4320, 10080",
    })
    .default(1440),
  DEFAULT_THREAD_TYPE: z.enum(["public", "private"]).default("public"),

  BULK_CONFIRM_THRESHOLD: z.coerce.number().int().positive().default(25),
  BULK_HARD_MAX: z.coerce.number().int().positive().default(500),

  REQUIRED_PERMISSION: z
    .string()
    .refine((v) => (permissionNames as string[]).includes(v), {
      message: `must be a valid discord.js PermissionsBitField flag name, e.g. ${permissionNames
        .slice(0, 3)
        .join(", ")}`,
    })
    .default("ManageThreads"),

  THREAD_CREATE_DELAY_MS: z.coerce.number().int().min(0).default(300),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid configuration:\n${issues}`);
    process.exit(1);
  }

  const env = parsed.data;
  return {
    discord: {
      token: env.DISCORD_TOKEN,
      clientId: env.DISCORD_CLIENT_ID,
      guildId: env.DISCORD_GUILD_ID || undefined,
    },
    db: {
      path: path.resolve(process.cwd(), env.DB_PATH),
    },
    logging: {
      level: env.LOG_LEVEL,
      dir: path.resolve(process.cwd(), env.LOG_DIR),
    },
    threadDefaults: {
      autoArchiveMinutes: env.DEFAULT_AUTO_ARCHIVE_MINUTES,
      type: env.DEFAULT_THREAD_TYPE,
    },
    bulkSafety: {
      confirmThreshold: env.BULK_CONFIRM_THRESHOLD,
      hardMax: env.BULK_HARD_MAX,
    },
    permissions: {
      required: env.REQUIRED_PERMISSION as keyof typeof PermissionsBitField.Flags,
    },
    rateLimiting: {
      createDelayMs: env.THREAD_CREATE_DELAY_MS,
    },
  };
}
