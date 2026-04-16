import { runMigrations } from "@/lib/db";
import { initializeProviders } from "@/lib/ai/setup";
import { registerPipelineHandlers } from "@/lib/pipeline";
import { startWorker } from "@/lib/task-queue";
import { createLogger } from "@/lib/logger";

const logger = createLogger('Bootstrap');

let bootstrapped = false;

export function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;

  logger.info("Running database migrations...");
  runMigrations();

  logger.info("Initializing AI providers...");
  initializeProviders();

  logger.info("Registering pipeline handlers...");
  registerPipelineHandlers();

  logger.info("Starting task worker...");
  startWorker();

  logger.info("Ready.");
}