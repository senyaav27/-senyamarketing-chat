import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fixture, cfg } from "./helpers.js";
import { deliverOne } from "../src/worker.js";
await mkdir("test-results", { recursive: true });
const f = await fixture();
cfg.origins.push(f.url);
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.url);
  const launch = page.getByRole("button", {
    name: "Написать сообщение",
    exact: true,
  });
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole("dialog").isVisible(), false);
  await launch.click();
  await page
    .getByRole("button", { name: "Получить бесплатный аудит", exact: true })
    .click();
  await page
    .getByText("Оставьте телефон или ваш @username", { exact: false })
    .waitFor();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Анна");
  await page.getByLabel("Телефон или Telegram", { exact: true }).fill("bad");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByText("Укажите телефон или @username в Telegram", { exact: true })
    .waitFor();
  await page
    .getByLabel("Телефон или Telegram", { exact: true })
    .fill("@test_user");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page
    .getByText("Контакт: @test_user\nИмя: Анна", { exact: false })
    .waitFor();
  await page
    .getByLabel("Ваше сообщение", { exact: true })
    .fill("Черновик сохраняется");
  await page.reload();
  await launch.click();
  assert.equal(
    await page.getByLabel("Ваше сообщение", { exact: true }).inputValue(),
    "Черновик сохраняется",
  );
  await page
    .getByLabel("Ваше сообщение", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await page
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("senya-chat img").count(), 0);
  await page.getByLabel("Закрыть чат", { exact: true }).click();
  let mid = 100;
  while (await deliverOne(f.db, async () => ({ message_id: ++mid }))) {}
  const update = {
    update_id: 500,
    message: {
      from: { id: 12345 },
      chat: { id: 12345 },
      reply_to_message: { message_id: 101 },
      text: "Ответ Александра для Анны",
    },
  };
  await f.request("/webhooks/telegram", {
    body: update,
    headers: { "X-Telegram-Bot-Api-Secret-Token": cfg.webhookSecret },
  });
  await page
    .getByRole("button", {
      name: "Написать сообщение, новых ответов: 1",
      exact: true,
    })
    .waitFor({ timeout: 10000 });
  await page
    .getByRole("button", {
      name: "Написать сообщение, новых ответов: 1",
      exact: true,
    })
    .click();
  await page.getByText("Ответ Александра для Анны", { exact: false }).waitFor();
  await page.getByLabel("Ваше сообщение", { exact: true }).press("Escape");
  assert.equal(await page.getByRole("dialog").isVisible(), false);
  assert.equal(
    await launch.evaluate((el) => el.getRootNode().activeElement === el),
    true,
  );
  // A second browser context gets a different secret and no first visitor messages.
  const mobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const phone = await mobile.newPage();
  await phone.goto(f.url);
  await phone
    .getByRole("button", { name: "Написать сообщение", exact: true })
    .click();
  assert.equal(
    await phone
      .getByText("Ответ Александра для Анны", { exact: false })
      .count(),
    0,
  );
  await phone
    .getByLabel("Ваше сообщение", { exact: true })
    .fill("Сообщение с телефона");
  await phone
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await phone
    .getByRole("button", { name: "Пропустить", exact: true })
    .waitFor();
  await phone.getByRole("button", { name: "Пропустить", exact: true }).click();
  const box = await phone.getByRole("dialog").boundingBox();
  assert.ok(
    box.x >= 0 &&
      box.x + box.width <= 375 &&
      box.y >= 0 &&
      box.y + box.height <= 812,
  );
  assert.equal(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await phone.screenshot({ path: "test-results/mobile.png" });
  // Offline message remains pending and can retry after reload without duplicate.
  await mobile.setOffline(true);
  await phone
    .getByLabel("Ваше сообщение", { exact: true })
    .fill("Проверка повтора");
  await phone
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await phone.getByRole("button", { name: "Повторить", exact: true }).waitFor();
  await mobile.setOffline(false);
  await phone.reload();
  await phone
    .getByRole("button", { name: "Написать сообщение", exact: true })
    .click();
  await phone.getByRole("button", { name: "Повторить", exact: true }).click();
  await phone.waitForTimeout(800);
  const rows = (
    await f.db.query("SELECT * FROM messages WHERE text='Проверка повтора'")
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(
    await phone.getByRole("button", { name: "Повторить", exact: true }).count(),
    0,
  );
  await launch.click();
  await page.screenshot({ path: "test-results/desktop.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile, choices, contact errors/save/skip, XSS text, two sessions, draft, unread, Escape/focus, offline/reload/retry.",
  );
  await context.close();
  await mobile.close();
} finally {
  await browser.close();
  await f.close();
}
