import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { webhookSecrets } from "../src/secrets.js";
import { startWorker } from "../src/worker.js";

test("Render supplies public URL and a persistent seed without putting secrets in source", () => {
  const env = {
    DATABASE_URL: "postgresql://localhost/test",
    TELEGRAM_BOT_TOKEN: "test-only",
    TELEGRAM_OWNER_ID: "12345",
    TELEGRAM_CHAT_ID: "12345",
    RENDER_EXTERNAL_URL: "https://chat.example.onrender.com",
    ALLOWED_ORIGINS: "https://senyamarketing.ru",
    CHAT_SECRET_SEED: "x".repeat(43) + "=",
    WORKER_IDLE_MS: "900000",
    NODE_ENV: "production",
  };
  const cfg = config(env);
  assert.equal(cfg.publicUrl, env.RENDER_EXTERNAL_URL);
  assert.equal(cfg.workerIdleMs, 900000);
  assert.ok(cfg.origins.includes(env.RENDER_EXTERNAL_URL));
  assert.match(cfg.webhookSecret, /^[a-f0-9]{64}$/);
  assert.notEqual(cfg.webhookSecret, cfg.tildaSecret);
  assert.equal(webhookSecrets(env).webhookSecret, cfg.webhookSecret);
  assert.throws(() => config({ ...env, CHAT_SECRET_SEED: "short" }));
  assert.throws(() => config({ ...env, WORKER_IDLE_MS: "NaN" }));
  assert.equal(
    config({ ...env, TELEGRAM_WEBHOOK_SECRET: "a".repeat(64) }).webhookSecret,
    "a".repeat(64),
  );
});

test("an empty queue sleeps; wake and stop remain serialized", async () => {
  let firstEmpty, secondEmpty;
  const initial = new Promise((resolve) => (firstEmpty = resolve)),
    woken = new Promise((resolve) => (secondEmpty = resolve));
  let checks = 0,
    concurrent = 0,
    maxConcurrent = 0;
  const db = {
    transaction: async (fn) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      try {
        return await fn({ query: async () => ({ rows: [] }) });
      } finally {
        concurrent--;
      }
    },
    query: async () => {
      checks++;
      if (checks === 1) firstEmpty();
      else secondEmpty();
      return { rows: [{ next_at: null }] };
    },
  };
  const stop = startWorker(
    db,
    async () => {
      throw Error("not expected");
    },
    90,
    { idleMs: 900000 },
  );
  await initial;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(checks, 1);
  stop.wake();
  stop.wake();
  await woken;
  await stop();
  assert.ok(checks >= 2);
  assert.equal(maxConcurrent, 1);
  const afterStop = checks;
  stop.wake();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(checks, afterStop);
});

test("a saved visitor message wakes a worker configured to sleep for 15 minutes", async () => {
  const { fixture } = await import("./helpers.js");
  const { randomBytes } = await import("node:crypto");
  let worker;
  const f = await fixture({ onQueued: () => worker?.wake() });
  let firstIdle;
  const idle = new Promise((resolve) => (firstIdle = resolve));
  const original = f.db.query;
  f.db.query = async (sql, args) => {
    const result = await original(sql, args);
    if (sql.startsWith("SELECT min(next_at)")) firstIdle();
    return result;
  };
  let delivered;
  const sent = new Promise((resolve) => (delivered = resolve));
  worker = startWorker(
    f.db,
    async () => {
      delivered();
      return { message_id: 999 };
    },
    90,
    { idleMs: 900000 },
  );
  let timeout;
  try {
    await idle;
    await new Promise((resolve) => setImmediate(resolve));
    const token = randomBytes(32).toString("hex");
    assert.equal(
      (
        await f.request("/api/session", {
          token,
          body: { page: "https://senyamarketing.ru/", utm: {} },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await f.request("/api/messages", {
          token,
          body: {
            text: "Wake on durable write",
            clientId: randomBytes(24).toString("hex"),
          },
        })
      ).status,
      200,
    );
    await Promise.race([
      sent,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error("Worker did not wake")), 4000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    await worker();
    await f.close();
  }
});
