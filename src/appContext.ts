import type { Client } from "discord.js";
import type { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";
import type { AppConfig } from "./config/env.schema";
import { OperationsRepo } from "./database/repositories/operationsRepo";
import { ThreadResultsRepo } from "./database/repositories/threadResultsRepo";
import { OperationQueue } from "./queue/operationQueue";
import { PendingOperationStore } from "./services/pendingOperationStore";

export interface AppContext {
  client: Client;
  config: AppConfig;
  db: DatabaseSync;
  logger: Logger;
  operationsRepo: OperationsRepo;
  threadResultsRepo: ThreadResultsRepo;
  queue: OperationQueue;
  pendingPreviews: PendingOperationStore;
}

export function createAppContext(
  client: Client,
  config: AppConfig,
  db: DatabaseSync,
  logger: Logger,
): AppContext {
  return {
    client,
    config,
    db,
    logger,
    operationsRepo: new OperationsRepo(db),
    threadResultsRepo: new ThreadResultsRepo(db),
    queue: new OperationQueue(),
    pendingPreviews: new PendingOperationStore(),
  };
}
