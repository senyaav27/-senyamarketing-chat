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
main().catch((error) => {
  // Only predefined diagnostics may reach logs; never print driver messages,
  // connection strings, exception stacks, or environment variable values.
  const safeMessages = new Set([
    ...["DATABASE_URL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_OWNER_ID", "TELEGRAM_CHAT_ID",
      "TELEGRAM_WEBHOOK_SECRET", "TILDA_WEBHOOK_SECRET", "PUBLIC_URL", "ALLOWED_ORIGINS"]
      .map((key) => `Missing ${key}`),
    "Invalid Telegram IDs", "Invalid CHAT_SECRET_SEED",
    "Invalid TELEGRAM_WEBHOOK_SECRET", "Invalid TILDA_WEBHOOK_SECRET",
    "HTTPS required", "Invalid WORKER_IDLE_MS", "Invalid RETENTION_DAYS",
    "Invalid privacy URL",
  ]);
  const dbCodes = {
    "28P01": "database_authentication_failed",
    "28000": "database_authorization_failed",
    "3D000": "database_does_not_exist",
    "42501": "database_permission_denied",
    ENOTFOUND: "database_hostname_not_found",
    ECONNREFUSED: "database_connection_refused",
    ETIMEDOUT: "database_connection_timeout",
    ERR_INVALID_URL: "invalid_url_in_configuration",
  };
  const reason = safeMessages.has(error?.message)
    ? error.message
    : Object.hasOwn(dbCodes, error?.code || "")
      ? dbCodes[error.code]
      : "configuration_or_database_error";
  console.error(`startup_failed: ${reason}`);
  process.exit(1);
});
