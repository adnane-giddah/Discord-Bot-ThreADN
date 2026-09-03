import fs from "node:fs";
import path from "node:path";
import pino from "pino";

export function createLogger(opts: { level: string; dir: string }): pino.Logger {
  fs.mkdirSync(opts.dir, { recursive: true });
  const logFile = path.join(opts.dir, "bot.log");

  const transport = pino.transport({
    targets: [
      {
        target: "pino-pretty",
        level: opts.level,
        options: { colorize: true, translateTime: "SYS:standard" },
      },
      {
        target: "pino/file",
        level: opts.level,
        options: { destination: logFile, mkdir: true },
      },
    ],
  });

  return pino({ level: opts.level }, transport);
}
