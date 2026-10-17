import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
export const cfg = {
  publicUrl: "http://localhost:3000",
  origins: ["http://localhost:3000", "https://senyamarketing.ru"],
  ownerId: "12345",
  chatId: "12345",
  token: "test",
  webhookSecret: "a".repeat(64),
  tildaSecret: "b".repeat(64),
  retention: 90,
  privacyUrl: "",
  formFields: ["Name", "Phone", "Message"],
  formNames: { form1: "Заявка на аудит" },
  trustProxy: 0,
};
export async function createDB(directory) {
  const raw = new PGlite(directory);
  await raw.waitReady;
  await raw.exec(
    await readFile(new URL("../migrations/001.sql", import.meta.url), "utf8"),
  );
  const query = (sql, args) => raw.query(sql, args);
  return {
    raw,
    query,
    transaction: (fn) =>
      raw.transaction((tx) => fn({ query: (s, a) => tx.query(s, a) })),
    close: () => raw.close(),
  };
}
export async function fixture({ persist = false } = {}) {
  const directory = persist
    ? await mkdtemp(path.join(tmpdir(), "senya-pg-"))
    : undefined;
  const db = await createDB(directory);
  const server = createApp(db, cfg).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = "http://127.0.0.1:" + server.address().port;
  async function request(route, { token, body, headers = {}, method } = {}) {
    const r = await fetch(url + route, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        origin: "https://senyamarketing.ru",
        ...(token ? { authorization: "Bearer " + token } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try {
      data = await r.json();
    } catch {}
    return { status: r.status, data };
  }
  return {
    db,
    server,
    url,
    request,
    directory,
    async close() {
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}
