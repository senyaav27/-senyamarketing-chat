import { database, migrate } from "./db.js";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { telegram } from "./telegram.js";
import { startWorker } from "./worker.js";
async function main() {
  const cfg = config(),
    db = database(process.env.DATABASE_URL);
  await migrate(db);
  const stopWorker = startWorker(db, telegram(cfg.token), cfg.retention, {
    idleMs: cfg.workerIdleMs,
  });
  const server = createApp(db, cfg, { onQueued: stopWorker.wake }).listen(
    Number(process.env.PORT || 3000),
    "0.0.0.0",
    () => console.log("chat_server_started"),
  );
  server.on("error", () => {
    console.error("server_listen_failed");
    process.exit(1);
  });
  async function stop() {
    server.close(async () => {
      try {
        await stopWorker();
        await db.close();
        process.exit(0);
      } catch {
        process.exit(1);
      }
    });
    setTimeout(() => process.exit(1), 20000).unref();
  }
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
main().catch(() => {
  console.error(
    "startup_failed: check required environment variables and database connectivity",
  );
  process.exit(1);
});
