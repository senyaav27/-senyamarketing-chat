(() => {
  "use strict";
  const script = document.currentScript;
  if (document.getElementById("senya-chat")) return;
  const base = new URL(script.src).origin;
  const storageKey = "senya-chat-v1:" + base;
  let storageOK = true;
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch {
      storageOK = false;
      return {};
    }
  };
  let saved = load();
  const random = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
  let token = /^[a-f0-9]{64}$/.test(saved.token) ? saved.token : random();
  let draft = saved.draft || "",
    pending = saved.pending || [],
    seen = saved.seen || "0",
    skipped = !!saved.skipped;
  let messages = [],
    isOpen = false,
    busy = false,
    ready = false,
    contactKnown = false,
    contactPending = saved.contactPending || null,
    privacyUrl = "";
  const persist = () => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          token,
          draft,
          pending,
          seen,
          skipped,
          contactPending,
        }),
      );
    } catch {
      storageOK = false;
    }
  };
  persist();
  const host = document.createElement("div");
  host.id = "senya-chat";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
:host {
  all: initial;
  position: fixed;
  z-index: 2147483000;
  right: 20px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  font:
    15px/1.5 Arial,
    sans-serif;
  color: #f7f7f7;
  --bg: #313131;
  --panel: #3d3d3d;
  --accent: #b9fd50;
  --muted: #d0d0d0;
  --error: #ffb9ae;
  --scroll: #aaa;
  --track: #313131;
  color-scheme: dark;
}
*,
*:before,
*:after {
  box-sizing: border-box;
  scrollbar-color: var(--scroll) var(--track);
  scrollbar-width: thin;
}
*::-webkit-scrollbar {
  width: 8px;
}
*::-webkit-scrollbar-thumb {
  background: var(--scroll);
  border-radius: 8px;
}
*::-webkit-scrollbar-track {
  background: var(--track);
}
button,
input,
textarea {
  font: inherit;
}
button,
a {
  touch-action: manipulation;
}
button {
  cursor: pointer;
  border: 0;
  border-radius: 12px;
  padding: 10px 14px;
  color: #20251a;
  background: var(--accent);
  font-weight: 600;
  min-height: 44px;
}
button:hover {
  filter: brightness(1.08);
}
button:active {
  filter: brightness(0.93);
}
button:disabled {
  cursor: wait;
  opacity: 0.65;
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible,
a:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
[hidden] {
  display: none !important;
}
.launch {
  box-shadow: 0 8px 32px #0004;
  border-radius: 50px;
  padding: 13px 20px;
  display: flex;
  gap: 10px;
  align-items: center;
}
.badge {
  background: #20251a;
  color: var(--accent);
  padding: 0 7px;
  border-radius: 20px;
}
.panel {
  width: min(390px, calc(100vw - 24px));
  height: min(620px, calc(100dvh - 100px));
  background: var(--bg);
  border: 1px solid #626262;
  border-radius: 22px;
  box-shadow: 0 16px 60px #0005;
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #555;
}
.avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--accent);
  color: #20251a;
  font-size: 24px;
  font-weight: 700;
}
.title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
}
.sub {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.close {
  margin-left: auto;
  background: transparent;
  color: #fff;
  font-size: 24px;
  padding: 4px 12px;
}
.history {
  overflow: auto;
  flex: 1;
  min-height: 60px;
  padding: 16px;
  scrollbar-gutter: stable;
}
.bubble {
  padding: 11px 13px;
  background: var(--panel);
  border-radius: 15px 15px 15px 4px;
  margin: 0 26px 10px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.visitor,
.contact {
  background: #465039;
  margin: 0 0 10px 26px;
  border-radius: 15px 15px 4px 15px;
}
.meta {
  display: block;
  font-size: 11px;
  color: var(--muted);
  margin-top: 5px;
}
.choices {
  display: grid;
  gap: 7px;
  margin: 14px 0;
}
.choices button {
  background: transparent;
  color: var(--accent);
  border: 1px solid #a2cb65;
  text-align: left;
  font-size: 14px;
}
.hint {
  color: var(--muted);
  font-size: 13px;
  margin: 10px 0;
}
.contact-box {
  border: 1px solid #666;
  padding: 12px;
  border-radius: 14px;
  margin: 14px 0;
}
.contact-box p {
  font-size: 13px;
  margin: 0 0 10px;
}
label {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
input,
textarea {
  display: block;
  border: 1px solid #777;
  border-radius: 9px;
  padding: 10px;
  background: #282828;
  color: #fff;
  width: 100%;
  min-width: 0;
}
input {
  font-size: 16px;
}
.contact-actions {
  display: flex;
  gap: 8px;
}
.skip {
  background: transparent;
  color: var(--muted);
}
.composer {
  padding: 12px;
  border-top: 1px solid #555;
}
.compose-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
textarea {
  resize: none;
  font-size: 16px;
  min-height: 48px;
  max-height: 110px;
}
.send {
  height: 48px;
}
.status {
  font-size: 12px;
  color: var(--muted);
  min-height: 18px;
  margin-top: 6px;
}
.error {
  color: var(--error);
}
a {
  color: var(--accent);
}
.policy {
  font-size: 11px;
  color: var(--muted);
  margin-top: 5px;
}
.retry {
  padding: 4px 10px;
  min-height: 34px;
  margin-top: 7px;
  font-size: 12px;
}
@media (max-width: 480px) {
  :host {
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .panel {
    height: min(580px, calc(100dvh - 92px));
    border-radius: 18px;
  }
  .launch {
    padding: 11px 17px;
  }
  .header {
    padding: 12px;
  }
  .history {
    padding: 12px;
  }
  .send {
    padding: 10px;
  }
}
@media (forced-colors: active) {
  * {
    scrollbar-color: auto;
  }
  button {
    border: 1px solid ButtonText;
  }
}
</style>
 <section class="panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" hidden>
 <header class="header"><span class="avatar" aria-hidden="true">А</span><div><h2 class="title" id="chat-title">Александр</h2><p class="sub">Маркетолог · Личный чат</p></div><button class="close" aria-label="Закрыть чат">×</button></header>
 <div class="history" role="log" aria-label="Переписка" aria-live="polite"><div class="bubble">Здравствуйте! Я Александр, маркетолог. С чем помочь?</div><div class="choices"></div><div class="items"></div><p class="hint" hidden>Опишите вашу задачу, чтобы я мог помочь.</p>
 <form class="contact-box" novalidate hidden><p>Оставьте телефон или ваш @username в Telegram, чтобы Александр мог связаться с вами, если вы закроете сайт</p><label>Ваше имя <input name="name" autocomplete="name" maxlength="80"></label><label>Телефон или Telegram <input name="contact" autocomplete="tel" maxlength="80" aria-describedby="contact-error"></label><p class="error" id="contact-error" role="status"></p><div class="contact-actions"><button type="submit">Сохранить</button><button type="button" class="skip">Пропустить</button></div></form></div>
 <form class="composer" novalidate><div class="compose-row"><textarea rows="2" maxlength="2000" aria-label="Ваше сообщение" aria-describedby="chat-status" placeholder="Напишите вашу задачу"></textarea><button class="send" type="submit" aria-label="Отправить сообщение">↑</button></div><div class="status" id="chat-status" role="status"></div><div class="policy" hidden></div></form></section>
 <button class="launch" aria-expanded="false" aria-controls="chat-title"><span>Написать сообщение</span><span class="badge" hidden></span></button>`;
  document.body.append(host);
  const $ = (s) => root.querySelector(s),
    panel = $(".panel"),
    input = $("textarea"),
    items = $(".items"),
    history = $(".history"),
    status = $(".status"),
    contactForm = $(".contact-box");
  input.value = draft;
  function setStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle("error", error);
  }
  function markSeen() {
    if (isOpen && !document.hidden) {
      const owners = messages.filter((m) => m.kind === "owner");
      if (owners.length) seen = owners.at(-1).id;
      persist();
    }
  }
  function badge() {
    const count = messages.filter(
      (m) => m.kind === "owner" && BigInt(m.id) > BigInt(seen),
    ).length;
    $(".badge").hidden = !count;
    $(".badge").textContent = count ? String(count) : "";
    $(".launch").setAttribute(
      "aria-label",
      count
        ? `Написать сообщение, новых ответов: ${count}`
        : "Написать сообщение",
    );
  }
  function toggle(open) {
    isOpen = open;
    panel.hidden = !open;
    $(".launch").setAttribute("aria-expanded", String(open));
    if (open) {
      markSeen();
      badge();
      input.focus();
      history.scrollTop = history.scrollHeight;
    } else $(".launch").focus();
  }
  $(".launch").onclick = () => toggle(!isOpen);
  $(".close").onclick = () => toggle(false);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      toggle(false);
    }
  });
  let painted = "";
  function paint() {
    const signature = JSON.stringify({
      messages,
      pending,
      contactKnown,
      skipped,
    });
    if (signature === painted) {
      markSeen();
      badge();
      return;
    }
    painted = signature;
    const near =
      history.scrollHeight - history.scrollTop - history.clientHeight < 90;
    items.replaceChildren();
    for (const m of [
      ...messages,
      ...pending
        .filter((p) => !messages.some((m) => m.client_id === p.clientId))
        .map((p) => ({ kind: "visitor", text: p.text, local: p })),
    ]) {
      const el = document.createElement("div");
      el.className = "bubble " + m.kind;
      el.textContent = m.text;
      const meta = document.createElement("span");
      meta.className = "meta";
      if (m.kind === "owner") meta.textContent = "Александр";
      else if (m.local)
        meta.textContent = m.local.sending ? "Отправляем…" : "Не отправлено";
      else
        meta.textContent =
          m.delivery === "delivered"
            ? "Передано в Telegram"
            : m.delivery === "retrying"
              ? "Сохранено. Доставка повторяется"
              : "Сохранено. Передаём в Telegram";
      el.append(meta);
      if (m.local && !m.local.sending) {
        const retry = document.createElement("button");
        retry.className = "retry";
        retry.textContent = "Повторить";
        retry.onclick = () => sendPending(m.local);
        el.append(retry);
      }
      items.append(el);
    }
    const contacted =
      contactKnown || messages.some((m) => m.kind === "contact");
    contactForm.hidden =
      skipped || contacted || !messages.some((m) => m.kind === "visitor");
    $(".choices").hidden =
      messages.some((m) => m.kind === "visitor") || pending.length > 0;
    $(".hint").hidden = !$(".choices").hidden;
    markSeen();
    badge();
    if (near) history.scrollTop = history.scrollHeight;
  }
  async function api(route, body) {
    const r = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw Error("Сервис временно недоступен");
    }
    if (!r.ok) {
      const e = Error(d.error || "Ошибка соединения");
      e.code = r.status;
      throw e;
    }
    return d;
  }
  let polling = false;
  async function poll() {
    if (!ready || polling) return;
    polling = true;
    try {
      let page;
      do {
        const last = messages.at(-1)?.id || "0";
        page = await api("/api/messages?after=" + last);
        for (const m of page.messages)
          if (!messages.some((x) => x.id === m.id)) messages.push(m);
        for (const d of page.delivery || []) {
          const m = messages.find((m) => m.client_id === d.client_id);
          if (m) m.delivery = d.delivery;
        }
        contactKnown = !!page.contact;
      } while (page.messages.length === 100);
      pending = pending.filter(
        (p) => !messages.some((m) => m.client_id === p.clientId),
      );
      persist();
      paint();
      if (!busy)
        setStatus(
          storageOK
            ? ""
            : "Данные браузера недоступны. История может не сохраниться.",
        );
    } catch (e) {
      setStatus(e.message + ". Проверьте соединение", true);
    } finally {
      polling = false;
    }
  }
  async function sendPending(p) {
    if (p.sending) return;
    p.sending = true;
    paint();
    try {
      if (!ready) await initialize();
      await api("/api/messages", { text: p.text, clientId: p.clientId });
      pending = pending.filter((x) => x !== p);
      persist();
      await poll();
    } catch (e) {
      setStatus(e.message, true);
    } finally {
      p.sending = false;
      persist();
      paint();
    }
  }
  function submit(text) {
    if (!text.trim()) return;
    if (text.trim().length > 2000)
      return setStatus("Не более 2000 символов", true);
    const p = { text: text.trim(), clientId: random() };
    pending.push(p);
    draft = "";
    input.value = "";
    persist();
    paint();
    sendPending(p);
  }
  $(".composer").onsubmit = (e) => {
    e.preventDefault();
    submit(input.value);
  };
  input.oninput = () => {
    draft = input.value;
    persist();
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit(input.value);
    }
  };
  for (const text of [
    "Получить бесплатный аудит",
    "Обсудить настройку рекламы",
    "Задать вопрос",
  ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = () => submit(text);
    $(".choices").append(b);
  }
  $(".skip").onclick = () => {
    skipped = true;
    persist();
    paint();
    input.focus();
  };
  contactForm.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = contactForm.elements.name.value.trim(),
      contact = contactForm.elements.contact.value.trim();
    const field = contactForm.elements.contact,
      error = $("#contact-error");
    if (
      !/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(contact) &&
      !(
        /^\+?[\d\s()\-]{7,25}$/.test(contact) &&
        contact.replace(/\D/g, "").length >= 7
      )
    ) {
      error.textContent = "Укажите телефон или @username в Telegram";
      field.setAttribute("aria-invalid", "true");
      field.focus();
      return;
    }
    field.removeAttribute("aria-invalid");
    error.textContent = "";
    busy = true;
    const b = contactForm.querySelector("button");
    b.disabled = true;
    if (
      !contactPending ||
      contactPending.name !== name ||
      contactPending.contact !== contact
    )
      contactPending = { name, contact, clientId: random() };
    persist();
    try {
      await api("/api/contact", contactPending);
      contactKnown = true;
      contactPending = null;
      persist();
      await poll();
      input.focus();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      busy = false;
      b.disabled = false;
    }
  };
  if (contactPending) {
    contactForm.elements.name.value = contactPending.name;
    contactForm.elements.contact.value = contactPending.contact;
  }
  let initializing;
  function initialize() {
    if (initializing) return initializing;
    initializing = (async () => {
      const utm = {};
      const url = new URL(location.href);
      for (const k of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
      ])
        if (url.searchParams.has(k))
          utm[k] = url.searchParams.get(k).slice(0, 120);
      await api("/api/session", {
        page: location.origin + location.pathname,
        utm,
      });
      ready = true;
      const conf = await api("/api/config");
      privacyUrl = conf.privacyUrl;
      if (privacyUrl) {
        const a = document.createElement("a");
        a.href = privacyUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "Политика обработки персональных данных";
        $(".policy").replaceChildren(a);
        $(".policy").hidden = false;
      }
    })().finally(() => (initializing = null));
    return initializing;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      markSeen();
      badge();
      poll();
    }
  });
  // Restore failed items as explicit retry actions; never auto-send a stale draft.
  pending.forEach((p) => (p.sending = false));
  paint();
  initialize()
    .then(poll)
    .catch((e) =>
      setStatus(e.message + ". Повторите отправку или обновите страницу", true),
    );
  setInterval(() => {
    if (!document.hidden) poll();
  }, 4000);
  window.addEventListener("online", () => {
    if (ready) poll();
    else
      initialize()
        .then(poll)
        .catch((e) => setStatus(e.message, true));
  });
  const viewport = window.visualViewport;
  function fit() {
    if (!viewport) return;
    const keyboard = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    );
    host.style.bottom = `calc(${keyboard + 12}px + env(safe-area-inset-bottom, 0px))`;
    panel.style.maxHeight = Math.max(150, viewport.height - 90) + "px";
  }
  viewport?.addEventListener("resize", fit);
  viewport?.addEventListener("scroll", fit);
})();
