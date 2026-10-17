import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { fixture, cfg, createDB } from "./helpers.js";
import { deliverOne, cleanup } from "../src/worker.js";
import { createApp } from "../src/app.js";
import { telegram } from "../src/telegram.js";
const token = () => randomBytes(32).toString("hex");
const page = {
  page: "https://senyamarketing.ru/a?email=private#secret",
  utm: { utm_source: "test", email: "private" },
};
async function session(f, t) {
  assert.equal(
    (await f.request("/api/session", { token: t, body: page })).status,
    200,
  );
}
async function send(f, t, text = "Здравствуйте", id = token()) {
  return f.request("/api/messages", { token: t, body: { text, clientId: id } });
}
const hook = (f, update) =>
  f.request("/webhooks/telegram", {
    body: update,
    headers: { "X-Telegram-Bot-Api-Secret-Token": cfg.webhookSecret },
  });
const reply = (
  id,
  mid,
  user = 12345,
  chat = 12345,
  text = "Здравствуйте! Помогу.",
) => ({
  update_id: id,
  message: {
    message_id: id,
    from: { id: user },
    chat: { id: chat },
    reply_to_message: { message_id: mid },
    text,
  },
});

test("durable delivery, two visitors, authorization, webhook/client dedup, contacts, forms, retention and restart", async (t) => {
  const f = await fixture({ persist: true });
  t.after(async () => {
    await f.close();
    await rm(f.directory, { recursive: true, force: true });
  });
  const a = token(),
    b = token();
  await session(f, a);
  await session(f, b);
  const firstId = token();
  assert.equal((await send(f, a, "Первый посетитель", firstId)).status, 200);
  assert.equal((await send(f, a, "Первый посетитель", firstId)).status, 200);
  assert.equal((await send(f, a, "Другое", firstId)).status, 409);
  await send(f, b, "Второй посетитель");
  assert.equal((await f.db.query("SELECT * FROM messages")).rows.length, 2);
  const sameOrigin = await fetch(f.url + "/api/messages", {
    headers: { authorization: "Bearer " + a },
  });
  assert.equal(sameOrigin.status, 200);
  assert.equal((await fetch(f.url + "/api/messages")).status, 401);
  const ca = (await f.db.query("SELECT * FROM conversations ORDER BY id"))
    .rows[0];
  assert.equal(ca.page, "https://senyamarketing.ru/a");
  assert.deepEqual(ca.utm, { utm_source: "test" });
  assert.equal(
    (await f.request("/api/messages", { token: token() })).status,
    401,
  );
  assert.equal(
    (await f.request("/api/messages", { token: String(ca.id) })).status,
    401,
  );
  assert.equal(
    (
      await f.request("/api/messages", {
        token: a,
        headers: { origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  assert.equal((await send(f, a, "x".repeat(2001))).status, 400);
  // API wrapper is exercised with a mock fetch; no real Telegram call.
  let tgId = 100;
  const sent = [];
  const mock = telegram("mock-only", async (url, opts) => {
    sent.push(JSON.parse(opts.body));
    return {
      ok: true,
      json: async () => ({ ok: true, result: { message_id: ++tgId } }),
    };
  });
  await deliverOne(f.db, async () => {
    throw Error("offline");
  });
  let job = (await f.db.query("SELECT * FROM outbox ORDER BY id")).rows[0];
  assert.equal(job.attempts, 1);
  assert.equal(job.sent_at, null);
  assert.equal((await f.db.query("SELECT * FROM messages")).rows.length, 2);
  await f.db.query("UPDATE outbox SET next_at=now()-interval '1 second'");
  await deliverOne(f.db, mock);
  await deliverOne(f.db, mock);
  assert.equal(sent.length, 2);
  assert.match(sent[0].text, /Диалог #1/);
  assert.equal(
    (await f.request("/webhooks/telegram", { body: reply(1, 101) })).status,
    403,
  );
  await hook(f, reply(2, 101, 999));
  await hook(f, reply(3, 101, 12345, 999));
  assert.equal(
    (await f.db.query("SELECT * FROM messages WHERE kind='owner'")).rows.length,
    0,
  );
  await hook(f, reply(4, 101));
  await hook(f, reply(4, 101));
  const ar = await f.request("/api/messages", { token: a }),
    br = await f.request("/api/messages", { token: b });
  assert.equal(ar.data.messages.filter((m) => m.kind === "owner").length, 1);
  assert.equal(br.data.messages.length, 1);
  assert.equal(br.data.messages[0].text, "Второй посетитель");
  await hook(f, reply(5, 999999));
  assert.equal(
    (await f.db.query("SELECT * FROM outbox WHERE message_id IS NULL")).rows
      .length,
    1,
  );
  const contact = { name: "Тест", contact: "@tester_name", clientId: token() };
  assert.equal(
    (await f.request("/api/contact", { token: a, body: contact })).status,
    200,
  );
  assert.equal(
    (await f.request("/api/contact", { token: a, body: contact })).status,
    200,
  );
  assert.equal(
    (
      await f.request("/api/contact", {
        token: b,
        body: { ...contact, contact: "bad" },
      })
    ).status,
    400,
  );
  const form = {
    formid: "form1",
    tranid: "123:456",
    Name: "Имя",
    Phone: "+79990000000",
    COOKIES: "secret",
    Password: "secret",
  };
  const formPath = "/webhooks/tilda/" + cfg.tildaSecret;
  assert.equal(
    (await f.request(formPath, { body: { test: "test" } })).status,
    200,
  );
  assert.equal((await f.request(formPath, { body: form })).status, 200);
  assert.equal((await f.request(formPath, { body: form })).status, 200);
  const leads = (await f.db.query("SELECT * FROM form_leads")).rows;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].payload.fields.Password, undefined);
  assert.equal(leads[0].payload.fields.COOKIES, undefined);
  assert.equal(
    (await f.request("/webhooks/tilda/wrong", { body: form })).status,
    403,
  );
  // Reopen a disk-backed PostgreSQL WASM database with a fresh DB instance.
  await new Promise((resolve) => f.server.close(resolve));
  await f.db.close();
  const reopened = await createDB(f.directory);
  assert.equal((await reopened.query("SELECT * FROM messages")).rows.length, 4);
  const restarted = createApp(reopened, cfg).listen(0, "127.0.0.1");
  await new Promise((resolve) => restarted.once("listening", resolve));
  const restored = await fetch(
    "http://127.0.0.1:" + restarted.address().port + "/api/messages",
    { headers: { authorization: "Bearer " + a } },
  );
  assert.equal(restored.status, 200);
  assert.equal(
    (await restored.json()).messages.filter((m) => m.kind === "owner").length,
    1,
  );
  await new Promise((resolve) => restarted.close(resolve));
  // fixture keeps its wrapper; restore its DB handle for teardown.
  f.db.close = () => reopened.close();
  await reopened.query(
    "UPDATE conversations SET updated_at=now()-interval '100 days'",
  );
  await cleanup(reopened, 90);
  assert.equal((await reopened.query("SELECT * FROM messages")).rows.length, 0);
  assert.equal(
    (await reopened.query("SELECT * FROM telegram_links")).rows.length,
    0,
  );
});

test("rate limiting and session token format", async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  assert.equal(
    (await f.request("/api/session", { body: page, token: "1" })).status,
    401,
  );
  const a = token();
  await session(f, a);
  for (let i = 0; i < 20; i++) assert.equal((await send(f, a)).status, 200);
  assert.equal((await send(f, a)).status, 429);
});
