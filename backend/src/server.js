import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/db.js";
import { startJobs, stopJobs } from "./jobs/index.js";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info(`DRP Payment Gateway listening on 0.0.0.0:${env.PORT}`);
  startJobs();
});

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  stopJobs();
  server.close(() => logger.info("HTTP server closed"));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
