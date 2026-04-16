import { dequeueTask, completeTask, failTask } from "./queue";
import type { TaskHandlerMap, Task } from "./types";
import { createLogger } from "@/lib/logger";

const logger = createLogger('TaskWorker');
const POLL_INTERVAL_MS = 2000;

let isRunning = false;
let handlers: TaskHandlerMap = {};

export function registerHandlers(newHandlers: TaskHandlerMap) {
  handlers = { ...handlers, ...newHandlers };
}

async function processTask(task: Task) {
  const handler = task.type ? handlers[task.type] : undefined;
  if (!handler) {
    await failTask(task.id, `No handler registered for task type: ${task.type}`);
    return;
  }

  try {
    const result = await handler(task);
    await completeTask(task.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failTask(task.id, message);
  }
}

async function poll() {
  if (!isRunning) return;

  try {
    const task = await dequeueTask();
    if (task) {
      await processTask(task);
    }
  } catch (err) {
    logger.error("Poll error", err);
  }

  if (isRunning) {
    setTimeout(poll, POLL_INTERVAL_MS);
  }
}

export function startWorker() {
  if (isRunning) return;
  isRunning = true;
  logger.info(`Started polling every ${POLL_INTERVAL_MS}ms`);
  poll();
}

export function stopWorker() {
  isRunning = false;
  logger.info("Stopped");
}