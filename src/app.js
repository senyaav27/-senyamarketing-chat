import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const hash = (x) => createHash("sha256").update(x).digest("hex");
const equal = (a, b) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (status, message) => Object.assign(new Error(message), { status });
const str = (x, max, required = true) => {
  if (typeof x !== "string" || x.length > max || (required && !x.trim()))
    throw fail(400, "Проверьте введённые данные");
  return x.trim();
};
const utmKeys = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];
function attribution(body, cfg) {
  let u;
  try {
    u = new URL(body.page);
  } catch {
    throw fail(400, "Некорректная страница");
  }
  if (!cfg.origins.includes(u.origin) || u.username || u.password)
    throw fail(400, "Некорректная страница");
  const utm = {};
  for (const k of utmKeys)
    if (typeof body.utm?.[k] === "string") utm[k] = body.utm[k].slice(0, 120);
  return { page: (u.origin + u.pathname).slice(0, 500), utm };
}
function notification(c, text) {
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  return `Диалог #${c.id}\n${text}\n\nИмя: ${c.name || "не указано"}\nКонтакт: ${c.contact || "не указан"}\nСтраница: ${c.page}\nUTM: ${JSON.stringify(c.utm)}\n${time} МСК\nЧтобы ответить посетителю, используйте «Ответить» на это сообщение.`.slice(
    0,
    4000,
  );
}
async function queue(tx, cfg, text, { messageId = null, formId = null } = {}) {
  await tx.query(
    "INSERT INTO outbox(message_id,form_id,chat_id,payload) VALUES ($1,$2,$3,$4)",
    [
      messageId,
      formId,
      cfg.chatId,
      JSON.stringify({
        chat_id: cfg.chatId,
        text,
        link_preview_options: { is_disabled: true },
      }),
    ],
  );
}
export function createApp(db, cfg) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", cfg.trustProxy);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    });
    next();
  });
  app.use("/api", (req, res, next) => {
    const origin = req.get("origin");
    if (
      (origin && !cfg.origins.includes(origin)) ||
      (!origin && req.method !== "GET")
    )
      return res.status(403).json({ error: "Домен не разрешён" });
    if (origin)
      res.set({
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(
    express.json({ limit: "24kb" }),
    express.urlencoded({ extended: false, limit: "24kb", parameterLimit: 80 }),
  );
  app.use(
    ["/api/session", "/api/messages", "/api/contact", "/webhooks/telegram"],
    (req, res, next) => {
      if (
        req.method === "POST" &&
        (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      )
        return res.status(400).json({ error: "Некорректный запрос" });
      next();
    },
  );
  async function rate(key, limit, seconds = 60) {
    const {
      rows: [r],
    } = await db.query(
      `INSERT INTO rate_limits(key,hits,expires_at) VALUES ($1,1,now()+($2 * interval '1 second'))
   ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END,
   expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING hits`,
      [key, seconds],
    );
    if (r.hits > limit)
      throw fail(429, "Слишком много запросов. Подождите минуту");
  }
  const tokenHash = (req) => {
    const t = req.get("authorization")?.replace(/^Bearer /, "");
    if (!t || !/^[a-f0-9]{64}$/.test(t)) throw fail(401, "Сессия недоступна");
    return hash(t);
  };
  async function auth(req) {
    const h = tokenHash(req);
    const {
      rows: [c],
    } = await db.query("SELECT * FROM conversations WHERE token_hash=$1", [h]);
    if (!c) throw fail(401, "Сессия недоступна");
    return c;
  }
  app.get("/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
  });
  app.get("/api/config", (req, res) =>
    res.json({ privacyUrl: cfg.privacyUrl }),
  );
  app.post("/api/session", async (req, res) => {
    await rate("session:" + hash(req.ip), 120, 3600);
    const h = tokenHash(req),
      a = attribution(req.body, cfg);
    const {
      rows: [c],
    } = await db.query(
      "INSERT INTO conversations(token_hash,page,utm) VALUES ($1,$2,$3) ON CONFLICT(token_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash RETURNING id",
      [h, a.page, JSON.stringify(a.utm)],
    );
    res.json({ id: c.id });
  });
  app.get("/api/messages", async (req, res) => {
    const c = await auth(req);
    await rate("read:" + c.id, 100);
    const after = String(req.query.after || "0");
    if (!/^\d{1,18}$/.test(after)) throw fail(400, "Некорректный указатель");
    const { rows } = await db.query(
      `SELECT m.id,m.kind,m.text,m.client_id,m.created_at,
    CASE WHEN o.sent_at IS NOT NULL THEN 'delivered' WHEN o.attempts>0 THEN 'retrying' ELSE 'queued' END AS delivery
    FROM messages m LEFT JOIN outbox o ON o.message_id=m.id WHERE m.conversation_id=$1 AND m.id>$2 ORDER BY m.id LIMIT 100`,
      [c.id, after],
    );
    const { rows: delivery } = await db.query(
      `SELECT m.client_id,CASE WHEN o.sent_at IS NOT NULL THEN 'delivered' WHEN o.attempts>0 THEN 'retrying' ELSE 'queued' END AS delivery FROM messages m JOIN outbox o ON o.message_id=m.id WHERE m.conversation_id=$1 ORDER BY m.id DESC LIMIT 50`,
      [c.id],
    );
    res.json({ messages: rows, delivery, name: c.name, contact: c.contact });
  });
  app.post("/api/messages", async (req, res) => {
    const c = await auth(req);
    await rate("write:" + c.id, 20);
    await rate("write-ip:" + hash(req.ip), 60);
    const text = str(req.body.text, 2000),
      key = str(req.body.clientId, 80);
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key))
      throw fail(400, "Некорректный ключ сообщения");
    const result = await db.transaction(async (tx) => {
      const {
        rows: [m],
      } = await tx.query(
        "INSERT INTO messages(conversation_id,kind,text,client_id) VALUES ($1,'visitor',$2,$3) ON CONFLICT(conversation_id,client_id) DO NOTHING RETURNING *",
        [c.id, text, key],
      );
      if (m) {
        await queue(tx, cfg, notification(c, text), { messageId: m.id });
        await tx.query(
          "UPDATE conversations SET updated_at=now() WHERE id=$1",
          [c.id],
        );
        return m;
      }
      const {
        rows: [old],
      } = await tx.query(
        "SELECT * FROM messages WHERE conversation_id=$1 AND client_id=$2",
        [c.id, key],
      );
      if (old.text !== text || old.kind !== "visitor")
        throw fail(409, "Ключ уже использован");
      return old;
    });
    res.json({ message: result });
  });
  app.post("/api/contact", async (req, res) => {
    const c = await auth(req);
    await rate("contact:" + c.id, 8);
    const name = str(req.body.name, 80, false),
      contact = str(req.body.contact, 80),
      key = str(req.body.clientId, 80);
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key))
      throw fail(400, "Некорректный ключ");
    if (
      !/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact) &&
      !(
        /^\+?[\d\s()\-]{7,25}$/.test(contact) &&
        contact.replace(/\D/g, "").length >= 7
      )
    )
      throw fail(400, "Укажите телефон или @username в Telegram");
    const text = `Контакт: ${contact}${name ? "\nИмя: " + name : ""}`;
    await db.transaction(async (tx) => {
      const {
        rows: [m],
      } = await tx.query(
        "INSERT INTO messages(conversation_id,kind,text,client_id) VALUES ($1,'contact',$2,$3) ON CONFLICT(conversation_id,client_id) DO NOTHING RETURNING id",
        [c.id, text, key],
      );
      if (m) {
        await tx.query(
          "UPDATE conversations SET name=$2,contact=$3,updated_at=now() WHERE id=$1",
          [c.id, name, contact],
        );
        await queue(tx, cfg, notification({ ...c, name, contact }, text), {
          messageId: m.id,
        });
      } else {
        const {
          rows: [old],
        } = await tx.query(
          "SELECT text,kind FROM messages WHERE conversation_id=$1 AND client_id=$2",
          [c.id, key],
        );
        if (old.text !== text || old.kind !== "contact")
          throw fail(409, "Ключ уже использован");
      }
    });
    res.json({ ok: true });
  });
  app.post("/webhooks/telegram", async (req, res) => {
    if (!equal(req.get("X-Telegram-Bot-Api-Secret-Token"), cfg.webhookSecret))
      throw fail(403, "Forbidden");
    const u = req.body;
    if (!Number.isSafeInteger(u.update_id) || u.update_id < 0)
      throw fail(400, "Bad update");
    const m = u.message;
    // Ignore unauthorized updates before storing IDs or generating any notifications.
    if (
      !m ||
      String(m.from?.id) !== cfg.ownerId ||
      String(m.chat?.id) !== cfg.chatId ||
      m.from?.is_bot
    )
      return res.json({ ok: true });
    await db.transaction(async (tx) => {
      const { rows } = await tx.query(
        "INSERT INTO telegram_updates(id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id",
        [u.update_id],
      );
      if (!rows.length) return;
      if (!m.reply_to_message) return;
      const {
        rows: [link],
      } = await tx.query(
        "SELECT conversation_id FROM telegram_links WHERE chat_id=$1 AND telegram_message_id=$2",
        [cfg.chatId, m.reply_to_message.message_id],
      );
      if (
        !link ||
        typeof m.text !== "string" ||
        !m.text.trim() ||
        m.text.length > 2000
      ) {
        await queue(
          tx,
          cfg,
          "Ответ не доставлен. Отправьте текст до 2000 символов через «Ответить» на сообщение бота с номером диалога. Заявки форм и вложения не поддерживают ответ на сайт.",
        );
        return;
      }
      await tx.query(
        "INSERT INTO messages(conversation_id,kind,text) VALUES ($1,'owner',$2)",
        [link.conversation_id, m.text.trim()],
      );
      await tx.query("UPDATE conversations SET updated_at=now() WHERE id=$1", [
        link.conversation_id,
      ]);
    });
    res.json({ ok: true });
  });
  app.post("/webhooks/tilda/:secret", async (req, res) => {
    if (!equal(req.params.secret, cfg.tildaSecret))
      throw fail(403, "Forbidden");
    await rate("tilda:" + hash(req.ip), 100);
    const p = req.body;
    if (!p || typeof p !== "object" || Array.isArray(p))
      throw fail(400, "Bad form");
    // Tilda sends test=test while connecting a receiver; acknowledge without creating a lead.
    if (p.test === "test") return res.type("text").send("ok");
    const tranid = str(p.tranid, 100),
      formid = str(p.formid, 100);
    const fields = {};
    for (const key of cfg.formFields)
      if (Object.hasOwn(p, key)) fields[key] = str(p[key], 500, false);
    if (!Object.keys(fields).length) throw fail(400, "No configured fields");
    const name = String(cfg.formNames[formid] || formid).slice(0, 120);
    const payload = { name, formid, tranid, fields };
    await db.transaction(async (tx) => {
      const {
        rows: [lead],
      } = await tx.query(
        "INSERT INTO form_leads(dedup_key,payload) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id",
        [hash(formid + ":" + tranid), JSON.stringify(payload)],
      );
      if (lead)
        await queue(
          tx,
          cfg,
          (
            `Заявка с формы: ${name}\nНомер: ${tranid}\n` +
            Object.entries(fields)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
          ).slice(0, 4000),
          { formId: lead.id },
        );
    });
    res.type("text").send("ok");
  });
  const publicDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../public",
  );
  app.use(
    express.static(publicDir, {
      setHeaders: (res) => res.set("Cache-Control", "public, max-age=300"),
    }),
  );
  app.use((req, res) => res.status(404).json({ error: "Не найдено" }));
  app.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    const status = e.status || 500;
    res.status(status).json({
      error:
        status < 500
          ? e.message
          : "Сервис временно недоступен. Попробуйте снова",
    });
    if (status >= 500) console.error("request_failed");
  });
  return app;
}
