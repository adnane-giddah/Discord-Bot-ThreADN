import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { migrations } from "./migrations";
import type { Logger } from "pino";

export function openDatabase(dbPath: string, logger: Logger): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db, logger);
  return db;
}

function runMigrations(db: DatabaseSync, logger: Logger): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => Number((row as { id: number }).id)),
  );

  for (const migration of migrations.sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;
    logger.info({ migration: migration.name }, "Applying database migration");
    db.exec(migration.sql);
    db.prepare(
      "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
